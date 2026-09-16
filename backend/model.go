package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// ---------- 原始数据集结构（用于从 JSON 建库） ----------

type dataset struct {
	Courses []sourceCourse `json:"courses"`
}

type sourceCourse struct {
	Code                 string     `json:"code"`
	Title                string     `json:"title"`
	OfferDept            *string    `json:"offer_dept"`
	Requirement          *string    `json:"requirement"`
	Description          *string    `json:"description"`
	LikedCount           int        `json:"liked_count"`
	DislikedCount        int        `json:"disliked_count"`
	ReviewedCount        int        `json:"reviewed_count"`
	APlus                int        `json:"a_plus"`
	A                    int        `json:"a"`
	AMinus               int        `json:"a_minus"`
	BPlus                int        `json:"b_plus"`
	B                    int        `json:"b"`
	BMinus               int        `json:"b_minus"`
	CPlus                int        `json:"c_plus"`
	C                    int        `json:"c"`
	CMinus               int        `json:"c_minus"`
	DPlus                int        `json:"d_plus"`
	D                    int        `json:"d"`
	DMinus               int        `json:"d_minus"`
	Pass                 int        `json:"pass"`
	Fail                 int        `json:"fail"`
	TutorialYesCount     int        `json:"tutorial_yes_count"`
	EssayYesCount        int        `json:"essay_yes_count"`
	FinalYesCount        int        `json:"final_yes_count"`
	PresentationYesCount int        `json:"presentation_yes_count"`
	ProjectYesCount      int        `json:"project_yes_count"`
	AttendanceYesCount   int        `json:"attendance_yes_count"`
	TutorialNoCount      int        `json:"tutorial_no_count"`
	EssayNoCount         int        `json:"essay_no_count"`
	FinalNoCount         int        `json:"final_no_count"`
	PresentationNoCount  int        `json:"presentation_no_count"`
	ProjectNoCount       int        `json:"project_no_count"`
	AttendanceNoCount    int        `json:"attendance_no_count"`
	Subclasses           []subclass `json:"subclasses"`
	Reviews              []review   `json:"reviews"`
}

// ---------- 领域模型 ----------

type slot struct {
	Day        int    `json:"day"`
	Venue      string `json:"venue"`
	StartTime  string `json:"start_time"`
	EndTime    string `json:"end_time"`
	StartDate  string `json:"start_date"`
	EndDate    string `json:"end_date"`
	IsTutorial bool   `json:"is_tutorial"`
}

type subclass struct {
	ID         int     `json:"id"`
	Semester   *string `json:"semester"`
	Section    *string `json:"section"`
	Instructor *string `json:"instructor"`
	Slots      []slot  `json:"slots"`
	IsActive   bool    `json:"is_active"`
}

type review struct {
	ID            int     `json:"id"`
	YearTaken     *string `json:"year_taken"`
	SemTaken      *string `json:"sem_taken"`
	Instructor    *string `json:"instructor"`
	Content       string  `json:"content"`
	LikedCount    int     `json:"liked_count"`
	DislikedCount int     `json:"disliked_count"`
	UserID        int     `json:"user_id"`
	CourseCode    string  `json:"course_code"`
	CreatedAt     *string `json:"created_at"`
	UpdatedAt     *string `json:"updated_at"`
}

type gradeDistribution struct {
	APlus  int `json:"a_plus"`
	A      int `json:"a"`
	AMinus int `json:"a_minus"`
	BPlus  int `json:"b_plus"`
	B      int `json:"b"`
	BMinus int `json:"b_minus"`
	CPlus  int `json:"c_plus"`
	C      int `json:"c"`
	CMinus int `json:"c_minus"`
	DPlus  int `json:"d_plus"`
	D      int `json:"d"`
	DMinus int `json:"d_minus"`
	Pass   int `json:"pass"`
	Fail   int `json:"fail"`
}

type votePair struct {
	Yes int `json:"yes"`
	No  int `json:"no"`
}

type featureVotes struct {
	Tutorial     votePair `json:"tutorial"`
	Essay        votePair `json:"essay"`
	Final        votePair `json:"final"`
	Presentation votePair `json:"presentation"`
	Project      votePair `json:"project"`
	Attendance   votePair `json:"attendance"`
}

type courseDetail struct {
	Code              string            `json:"code"`
	Title             string            `json:"title"`
	OfferDept         *string           `json:"offer_dept"`
	Requirement       *string           `json:"requirement"`
	Description       *string           `json:"description"`
	LikedCount        int               `json:"liked_count"`
	DislikedCount     int               `json:"disliked_count"`
	ReviewedCount     int               `json:"reviewed_count"`
	GradeDistribution gradeDistribution `json:"grade_distribution"`
	FeatureVotes      featureVotes      `json:"feature_votes"`
	Subclasses        []subclass        `json:"subclasses"`
	Reviews           []review          `json:"reviews"`
}

type courseSummary struct {
	Code          string   `json:"code"`
	Title         string   `json:"title"`
	OfferDept     *string  `json:"offerDept"`
	Description   *string  `json:"description"`
	ReviewedCount int      `json:"reviewedCount"`
	LikedCount    int      `json:"likedCount"`
	DislikedCount int      `json:"dislikedCount"`
	Instructors   []string `json:"instructors"`
}

// courseRow 与 courses 表全部 34 列一一对应，顺序必须与 courseColumns 一致。
type courseRow struct {
	Code                 string
	Title                string
	OfferDept            *string
	Requirement          *string
	Description          *string
	LikedCount           int
	DislikedCount        int
	ReviewedCount        int
	APlus                int
	A                    int
	AMinus               int
	BPlus                int
	B                    int
	BMinus               int
	CPlus                int
	C                    int
	CMinus               int
	DPlus                int
	D                    int
	DMinus               int
	Pass                 int
	Fail                 int
	TutorialYesCount     int
	EssayYesCount        int
	FinalYesCount        int
	PresentationYesCount int
	ProjectYesCount      int
	AttendanceYesCount   int
	TutorialNoCount      int
	EssayNoCount         int
	FinalNoCount         int
	PresentationNoCount  int
	ProjectNoCount       int
	AttendanceNoCount    int
}

const courseColumns = `code, title, offer_dept, requirement, description,
	liked_count, disliked_count, reviewed_count,
	a_plus, a, a_minus, b_plus, b, b_minus, c_plus, c, c_minus,
	d_plus, d, d_minus, pass, fail,
	tutorial_yes_count, essay_yes_count, final_yes_count,
	presentation_yes_count, project_yes_count, attendance_yes_count,
	tutorial_no_count, essay_no_count, final_no_count,
	presentation_no_count, project_no_count, attendance_no_count`

// destinations 必须用指针接收者：值接收者会让 Scan 写进结构体副本，数据全部丢失。
func (row *courseRow) destinations() []any {
	return []any{
		&row.Code, &row.Title, &row.OfferDept, &row.Requirement, &row.Description,
		&row.LikedCount, &row.DislikedCount, &row.ReviewedCount,
		&row.APlus, &row.A, &row.AMinus, &row.BPlus, &row.B, &row.BMinus,
		&row.CPlus, &row.C, &row.CMinus, &row.DPlus, &row.D, &row.DMinus,
		&row.Pass, &row.Fail,
		&row.TutorialYesCount, &row.EssayYesCount, &row.FinalYesCount,
		&row.PresentationYesCount, &row.ProjectYesCount, &row.AttendanceYesCount,
		&row.TutorialNoCount, &row.EssayNoCount, &row.FinalNoCount,
		&row.PresentationNoCount, &row.ProjectNoCount, &row.AttendanceNoCount,
	}
}

func (row courseRow) toDetail(subclasses []subclass, reviews []review) courseDetail {
	// reviewedCount 用真实可展示的评价条数，而非 RIC 平台上的累计计数。
	return courseDetail{
		Code:          row.Code,
		Title:         row.Title,
		OfferDept:     row.OfferDept,
		Requirement:   row.Requirement,
		Description:   row.Description,
		LikedCount:    row.LikedCount,
		DislikedCount: row.DislikedCount,
		ReviewedCount: len(reviews),
		GradeDistribution: gradeDistribution{
			APlus: row.APlus, A: row.A, AMinus: row.AMinus,
			BPlus: row.BPlus, B: row.B, BMinus: row.BMinus,
			CPlus: row.CPlus, C: row.C, CMinus: row.CMinus,
			DPlus: row.DPlus, D: row.D, DMinus: row.DMinus,
			Pass: row.Pass, Fail: row.Fail,
		},
		FeatureVotes: featureVotes{
			Tutorial:     votePair{Yes: row.TutorialYesCount, No: row.TutorialNoCount},
			Essay:        votePair{Yes: row.EssayYesCount, No: row.EssayNoCount},
			Final:        votePair{Yes: row.FinalYesCount, No: row.FinalNoCount},
			Presentation: votePair{Yes: row.PresentationYesCount, No: row.PresentationNoCount},
			Project:      votePair{Yes: row.ProjectYesCount, No: row.ProjectNoCount},
			Attendance:   votePair{Yes: row.AttendanceYesCount, No: row.AttendanceNoCount},
		},
		Subclasses: subclasses,
		Reviews:    reviews,
	}
}

// ---------- 建库 ----------

func databaseReady(db *sql.DB) bool {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM courses").Scan(&count)
	return err == nil && count > 0
}

func initializeDatabase(db *sql.DB, dataPath string) error {
	content, err := readDataset(dataPath)
	if err != nil {
		return err
	}

	var source dataset
	if err := json.Unmarshal(content, &source); err != nil {
		return fmt.Errorf("解析数据集失败: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	schema := `
		DROP TABLE IF EXISTS reviews;
		DROP TABLE IF EXISTS subclasses;
		DROP TABLE IF EXISTS courses;

		CREATE TABLE courses (
			code TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			offer_dept TEXT,
			requirement TEXT,
			description TEXT,
			liked_count INTEGER NOT NULL DEFAULT 0,
			disliked_count INTEGER NOT NULL DEFAULT 0,
			reviewed_count INTEGER NOT NULL DEFAULT 0,
			a_plus INTEGER NOT NULL DEFAULT 0,
			a INTEGER NOT NULL DEFAULT 0,
			a_minus INTEGER NOT NULL DEFAULT 0,
			b_plus INTEGER NOT NULL DEFAULT 0,
			b INTEGER NOT NULL DEFAULT 0,
			b_minus INTEGER NOT NULL DEFAULT 0,
			c_plus INTEGER NOT NULL DEFAULT 0,
			c INTEGER NOT NULL DEFAULT 0,
			c_minus INTEGER NOT NULL DEFAULT 0,
			d_plus INTEGER NOT NULL DEFAULT 0,
			d INTEGER NOT NULL DEFAULT 0,
			d_minus INTEGER NOT NULL DEFAULT 0,
			pass INTEGER NOT NULL DEFAULT 0,
			fail INTEGER NOT NULL DEFAULT 0,
			tutorial_yes_count INTEGER NOT NULL DEFAULT 0,
			essay_yes_count INTEGER NOT NULL DEFAULT 0,
			final_yes_count INTEGER NOT NULL DEFAULT 0,
			presentation_yes_count INTEGER NOT NULL DEFAULT 0,
			project_yes_count INTEGER NOT NULL DEFAULT 0,
			attendance_yes_count INTEGER NOT NULL DEFAULT 0,
			tutorial_no_count INTEGER NOT NULL DEFAULT 0,
			essay_no_count INTEGER NOT NULL DEFAULT 0,
			final_no_count INTEGER NOT NULL DEFAULT 0,
			presentation_no_count INTEGER NOT NULL DEFAULT 0,
			project_no_count INTEGER NOT NULL DEFAULT 0,
			attendance_no_count INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE reviews (
			id INTEGER PRIMARY KEY,
			year_taken TEXT,
			sem_taken TEXT,
			instructor TEXT,
			content TEXT NOT NULL,
			liked_count INTEGER NOT NULL DEFAULT 0,
			disliked_count INTEGER NOT NULL DEFAULT 0,
			user_id INTEGER NOT NULL,
			course_code TEXT NOT NULL REFERENCES courses(code),
			created_at TEXT,
			updated_at TEXT
		);

		CREATE TABLE subclasses (
			id INTEGER PRIMARY KEY,
			semester TEXT,
			section TEXT,
			instructor TEXT,
			slots TEXT NOT NULL,
			course_code TEXT NOT NULL REFERENCES courses(code),
			is_active INTEGER NOT NULL DEFAULT 1
		);

		CREATE INDEX reviews_course_code_idx ON reviews(course_code);
		CREATE INDEX subclasses_course_code_idx ON subclasses(course_code);
	`
	if _, err := tx.Exec(schema); err != nil {
		return err
	}

	insertCourse, err := tx.Prepare(fmt.Sprintf(
		"INSERT INTO courses (%s) VALUES (%s)",
		courseColumns,
		strings.TrimSuffix(strings.Repeat("?,", 34), ","),
	))
	if err != nil {
		return err
	}
	defer insertCourse.Close()

	insertReview, err := tx.Prepare(`
		INSERT INTO reviews (
			id, year_taken, sem_taken, instructor, content, liked_count,
			disliked_count, user_id, course_code, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer insertReview.Close()

	insertSubclass, err := tx.Prepare(`
		INSERT INTO subclasses (
			id, semester, section, instructor, slots, course_code, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer insertSubclass.Close()

	for _, item := range source.Courses {
		_, err := insertCourse.Exec(
			item.Code, item.Title, item.OfferDept, item.Requirement, item.Description,
			item.LikedCount, item.DislikedCount, item.ReviewedCount,
			item.APlus, item.A, item.AMinus, item.BPlus, item.B, item.BMinus,
			item.CPlus, item.C, item.CMinus, item.DPlus, item.D, item.DMinus,
			item.Pass, item.Fail, item.TutorialYesCount, item.EssayYesCount,
			item.FinalYesCount, item.PresentationYesCount, item.ProjectYesCount,
			item.AttendanceYesCount, item.TutorialNoCount, item.EssayNoCount,
			item.FinalNoCount, item.PresentationNoCount, item.ProjectNoCount,
			item.AttendanceNoCount,
		)
		if err != nil {
			return err
		}

		for _, itemReview := range item.Reviews {
			_, err := insertReview.Exec(
				itemReview.ID, itemReview.YearTaken, itemReview.SemTaken,
				itemReview.Instructor, itemReview.Content, itemReview.LikedCount,
				itemReview.DislikedCount, itemReview.UserID, itemReview.CourseCode,
				itemReview.CreatedAt, itemReview.UpdatedAt,
			)
			if err != nil {
				return err
			}
		}

		for _, itemSubclass := range item.Subclasses {
			slots := itemSubclass.Slots
			encoded := []byte("[]")
			if len(slots) > 0 {
				encoded, err = json.Marshal(slots)
				if err != nil {
					return err
				}
			}
			isActive := 0
			if itemSubclass.IsActive {
				isActive = 1
			}
			_, err := insertSubclass.Exec(
				itemSubclass.ID, itemSubclass.Semester, itemSubclass.Section,
				itemSubclass.Instructor, string(encoded), item.Code, isActive,
			)
			if err != nil {
				return err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	return nil
}
