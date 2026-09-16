package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(value); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(response http.ResponseWriter, status int, code, message string) {
	writeJSON(response, status, errorBody{Error: errorDetail{Code: code, Message: message}})
}

func healthHandler(db *sql.DB) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 GET")
			return
		}

		var courses, reviews, subclasses int
		err := db.QueryRow(`
			SELECT
				(SELECT COUNT(*) FROM courses),
				(SELECT COUNT(*) FROM reviews),
				(SELECT COUNT(*) FROM subclasses)
		`).Scan(&courses, &reviews, &subclasses)
		if err != nil {
			writeError(response, http.StatusInternalServerError, "DATABASE_UNAVAILABLE", "数据库不可用")
			return
		}

		writeJSON(response, http.StatusOK, map[string]any{
			"status": "ok",
			"database": map[string]int{
				"courses": courses, "reviews": reviews, "subclasses": subclasses,
			},
		})
	}
}

// coursesHandler 支持 ?q=关键词&dept=院系&sort=code|reviews|rating
func coursesHandler(db *sql.DB) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 GET")
			return
		}

		query := request.URL.Query()
		keyword := strings.ToLower(strings.TrimSpace(query.Get("q")))
		department := strings.TrimSpace(query.Get("dept"))
		sortBy := query.Get("sort")

		orderClause := "courses.code ASC"
		switch sortBy {
		case "reviews":
			orderClause = "reviewCount DESC, courses.code ASC"
		case "rating":
			// 分母为 0 时排最后，避免除零
			orderClause = `CASE WHEN courses.liked_count + courses.disliked_count = 0 THEN -1
				ELSE CAST(courses.liked_count AS REAL) / (courses.liked_count + courses.disliked_count) END DESC,
				courses.code ASC`
		}

		rows, err := db.Query(`
			SELECT
				courses.code,
				courses.title,
				courses.offer_dept,
				COUNT(reviews.id) AS reviewCount,
				courses.liked_count,
				courses.disliked_count
			FROM courses
			LEFT JOIN reviews ON reviews.course_code = courses.code
			WHERE (? = '' OR LOWER(courses.code) LIKE '%' || ? || '%' OR LOWER(courses.title) LIKE '%' || ? || '%')
			  AND (? = '' OR courses.offer_dept = ?)
			GROUP BY courses.code
			ORDER BY `+orderClause,
			keyword, keyword, keyword, department, department,
		)
		if err != nil {
			writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "课程查询失败")
			return
		}
		defer rows.Close()

		courses := make([]courseSummary, 0, 10)
		for rows.Next() {
			var item courseSummary
			if err := rows.Scan(
				&item.Code, &item.Title, &item.OfferDept, &item.ReviewedCount,
				&item.LikedCount, &item.DislikedCount,
			); err != nil {
				writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "课程读取失败")
				return
			}
			courses = append(courses, item)
		}
		if err := rows.Err(); err != nil {
			writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "课程读取失败")
			return
		}

		writeJSON(response, http.StatusOK, map[string]any{"courses": courses})
	}
}

// courseDetailHandler 处理 GET /api/courses/{code}
func courseDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 GET")
			return
		}

		code := strings.Trim(strings.TrimPrefix(request.URL.Path, "/api/courses/"), "/")
		if code == "" || strings.Contains(code, "/") {
			writeError(response, http.StatusNotFound, "COURSE_NOT_FOUND", "课程代码无效")
			return
		}

		detail, err := loadCourseDetail(db, strings.ToUpper(code))
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(response, http.StatusNotFound, "COURSE_NOT_FOUND", "没有找到课程 "+code)
				return
			}
			log.Printf("load course %s: %v", code, err)
			writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "课程详情读取失败")
			return
		}

		writeJSON(response, http.StatusOK, map[string]any{"course": detail})
	}
}

func loadCourseDetail(db *sql.DB, code string) (courseDetail, error) {
	var row courseRow
	err := db.QueryRow("SELECT "+courseColumns+" FROM courses WHERE code = ?", code).
		Scan(row.destinations()...)
	if err != nil {
		return courseDetail{}, err
	}

	subclasses, err := loadSubclasses(db, code)
	if err != nil {
		return courseDetail{}, err
	}

	reviews, err := loadReviews(db, code)
	if err != nil {
		return courseDetail{}, err
	}

	return row.toDetail(subclasses, reviews), nil
}

func loadSubclasses(db *sql.DB, code string) ([]subclass, error) {
	rows, err := db.Query(`
		SELECT id, semester, section, instructor, slots, is_active
		FROM subclasses WHERE course_code = ?
		ORDER BY semester ASC, section ASC
	`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []subclass{}
	for rows.Next() {
		var item subclass
		var rawSlots string
		var isActive int
		if err := rows.Scan(&item.ID, &item.Semester, &item.Section, &item.Instructor, &rawSlots, &isActive); err != nil {
			return nil, err
		}
		item.IsActive = isActive != 0
		item.Slots = []slot{}
		if strings.TrimSpace(rawSlots) != "" {
			if err := json.Unmarshal([]byte(rawSlots), &item.Slots); err != nil {
				log.Printf("parse slots of subclass %d: %v", item.ID, err)
			}
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func loadReviews(db *sql.DB, code string) ([]review, error) {
	rows, err := db.Query(`
		SELECT id, year_taken, sem_taken, instructor, content, liked_count,
			disliked_count, user_id, course_code, created_at, updated_at
		FROM reviews WHERE course_code = ?
		ORDER BY liked_count DESC, id DESC
	`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []review{}
	for rows.Next() {
		var item review
		if err := rows.Scan(
			&item.ID, &item.YearTaken, &item.SemTaken, &item.Instructor, &item.Content,
			&item.LikedCount, &item.DislikedCount, &item.UserID, &item.CourseCode,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

// conflictsHandler 处理 POST /api/conflicts
func conflictsHandler(db *sql.DB) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 POST")
			return
		}

		var payload struct {
			SubclassIDs []int `json:"subclassIds"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writeError(response, http.StatusBadRequest, "INVALID_BODY", "请求体必须是 {\"subclassIds\": [...]}")
			return
		}
		if len(payload.SubclassIDs) == 0 {
			writeJSON(response, http.StatusOK, detectSchedule(nil))
			return
		}

		items, err := loadScheduledSubclasses(db, payload.SubclassIDs)
		if err != nil {
			log.Printf("load subclasses: %v", err)
			writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "班次读取失败")
			return
		}

		writeJSON(response, http.StatusOK, detectSchedule(items))
	}
}

func loadScheduledSubclasses(db *sql.DB, ids []int) ([]scheduledSubclass, error) {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}

	rows, err := db.Query(`
		SELECT subclasses.id, subclasses.semester, subclasses.section, subclasses.instructor,
			subclasses.slots, subclasses.is_active, subclasses.course_code, courses.title
		FROM subclasses
		JOIN courses ON courses.code = subclasses.course_code
		WHERE subclasses.id IN (`+placeholders+`)
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []scheduledSubclass{}
	for rows.Next() {
		var item scheduledSubclass
		var rawSlots string
		var isActive int
		var sub subclass
		if err := rows.Scan(
			&sub.ID, &sub.Semester, &sub.Section, &sub.Instructor, &rawSlots,
			&isActive, &item.CourseCode, &item.Title,
		); err != nil {
			return nil, err
		}
		sub.IsActive = isActive != 0
		sub.Slots = []slot{}
		if strings.TrimSpace(rawSlots) != "" {
			if err := json.Unmarshal([]byte(rawSlots), &sub.Slots); err != nil {
				log.Printf("parse slots of subclass %d: %v", sub.ID, err)
			}
		}
		item.Subclass = sub
		result = append(result, item)
	}
	return result, rows.Err()
}

// departmentsHandler 返回全部开课院系，供前端筛选下拉使用
func departmentsHandler(db *sql.DB) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 GET")
			return
		}

		rows, err := db.Query(`
			SELECT DISTINCT offer_dept FROM courses
			WHERE offer_dept IS NOT NULL AND TRIM(offer_dept) <> ''
			ORDER BY offer_dept ASC
		`)
		if err != nil {
			writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "院系查询失败")
			return
		}
		defer rows.Close()

		departments := []string{}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				writeError(response, http.StatusInternalServerError, "QUERY_FAILED", "院系读取失败")
				return
			}
			departments = append(departments, name)
		}

		writeJSON(response, http.StatusOK, map[string]any{"departments": departments})
	}
}

func atoiOrZero(value string) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return parsed
}
