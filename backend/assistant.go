package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

// ---------- 配置 ----------

type assistantConfig struct {
	apiKey  string
	baseURL string
	model   string
	timeout time.Duration
}

// loadAssistantConfig 读取 backend/.env 中的 DEEPSEEK_* 配置。
// 缺失时使用官方默认值，调用方据此决定是否启用离线回落。
func loadAssistantConfig() assistantConfig {
	base := strings.TrimRight(os.Getenv("DEEPSEEK_BASE_URL"), "/")
	if base == "" {
		base = "https://api.deepseek.com"
	}
	return assistantConfig{
		apiKey:  os.Getenv("DEEPSEEK_API_KEY"),
		baseURL: base,
		model:   firstNonEmpty(os.Getenv("DEEPSEEK_MODEL"), "deepseek-chat"),
		timeout: 25 * time.Second,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// ---------- 请求 / 响应 ----------

type assistantRequestBody struct {
	Message     string   `json:"message"`
	SubclassIDs []int    `json:"subclassIds"`
	CourseCodes []string `json:"courseCodes"`
}

type assistantResponseBody struct {
	Reply string `json:"reply"`
	Mode  string `json:"mode"` // "ai" | "offline"
	Note  string `json:"note,omitempty"`
}

// ---------- 课程上下文 ----------

type courseContext struct {
	Code   string
	Title  string
	Detail courseDetail
	Slots  []slot // 用户指定班次（或首个活跃班次）的排课，用于展示上课时间与冲突分析
}

type assistantContext struct {
	courses []courseContext
	text    string
}

// buildAssistantContext 从选课篮的 subclassIds 与显式课程代码收集课程，
// 组装成一段给大模型看的纯文本上下文。没有可分析课程时 text 为空。
func buildAssistantContext(db *sql.DB, subclassIDs []int, courseCodes []string) assistantContext {
	codeSet := map[string]bool{}
	scheduleByCode := map[string][]slot{}

	if len(subclassIDs) > 0 {
		scheduled, err := loadScheduledSubclasses(db, subclassIDs)
		if err == nil {
			for _, item := range scheduled {
				codeSet[item.CourseCode] = true
				// 同一门课可能只选了一个班次；若有多个则合并排课用于冲突分析。
				scheduleByCode[item.CourseCode] = append(scheduleByCode[item.CourseCode], item.Subclass.Slots...)
			}
		}
	}
	for _, raw := range courseCodes {
		code := strings.ToUpper(strings.TrimSpace(raw))
		if code != "" {
			codeSet[code] = true
		}
	}

	courses := make([]courseContext, 0, len(codeSet))
	lines := make([]string, 0, len(codeSet))
	for code := range codeSet {
		detail, err := loadCourseDetail(db, code)
		if err != nil {
			continue
		}
		slots := scheduleByCode[code]
		if len(slots) == 0 {
			// 未指定具体班次时，取首个活跃班次的排课作为示例，帮助大模型理解上课节奏。
			for _, sub := range detail.Subclasses {
				if sub.IsActive {
					slots = sub.Slots
					break
				}
			}
		}
		cc := courseContext{Code: detail.Code, Title: detail.Title, Detail: detail, Slots: slots}
		courses = append(courses, cc)
		lines = append(lines, formatCourseForPrompt(cc))
	}

	return assistantContext{courses: courses, text: strings.Join(lines, "\n")}
}

// formatCourseForPrompt 把一门课压缩成模型易读的结构化文本。
func formatCourseForPrompt(cc courseContext) string {
	d := cc.Detail
	var b strings.Builder
	fmt.Fprintf(&b, "【课程 %s %s】\n", d.Code, d.Title)
	if d.OfferDept != nil && *d.OfferDept != "" {
		fmt.Fprintf(&b, "院系：%s\n", *d.OfferDept)
	}
	if d.Description != nil && strings.TrimSpace(*d.Description) != "" {
		desc := *d.Description
		if len(desc) > 160 {
			desc = desc[:160] + "…"
		}
		fmt.Fprintf(&b, "简介：%s\n", desc)
	}

	g := d.GradeDistribution
	total := g.APlus + g.A + g.AMinus + g.BPlus + g.B + g.BMinus +
		g.CPlus + g.C + g.CMinus + g.DPlus + g.D + g.DMinus + g.Pass + g.Fail
	if total > 0 {
		aRange := g.APlus + g.A + g.AMinus
		fmt.Fprintf(&b, "成绩样本 %d 人：A 及以上 %d（%.0f%%）", total, aRange, float64(aRange)/float64(total)*100)
		if g.Fail > 0 {
			fmt.Fprintf(&b, "，Fail %d", g.Fail)
		}
		b.WriteString("\n")
	}

	fv := d.FeatureVotes
	workload := make([]string, 0, 6)
	if fv.Final.Yes > fv.Final.No {
		workload = append(workload, "期末考试")
	}
	if fv.Essay.Yes > fv.Essay.No {
		workload = append(workload, "论文")
	}
	if fv.Project.Yes > fv.Project.No {
		workload = append(workload, "小组项目")
	}
	if fv.Presentation.Yes > fv.Presentation.No {
		workload = append(workload, "课堂展示")
	}
	if fv.Attendance.Yes > fv.Attendance.No {
		workload = append(workload, "考勤")
	}
	if fv.Tutorial.Yes > fv.Tutorial.No {
		workload = append(workload, "辅导课")
	}
	if len(workload) > 0 {
		fmt.Fprintf(&b, "考核方式（多数评价认为有）：%s\n", strings.Join(workload, "、"))
	}

	if len(d.Reviews) > 0 {
		shown := 0
		for _, r := range d.Reviews {
			content := strings.TrimSpace(r.Content)
			if content == "" {
				continue
			}
			if len(content) > 120 {
				content = content[:120] + "…"
			}
			fmt.Fprintf(&b, "学生评价（赞 %d）：%s\n", r.LikedCount, content)
			shown++
			if shown >= 2 {
				break
			}
		}
	}

	if len(cc.Slots) > 0 {
		b.WriteString("上课时间：\n")
		for _, s := range cc.Slots {
			campus := campusOf(s.Venue)
			campusLabel := ""
			if campus == campusCentennial {
				campusLabel = "（百周年校园）"
			} else if campus == campusMain {
				campusLabel = "（本部）"
			}
			venueLabel := s.Venue
			if strings.TrimSpace(venueLabel) == "" {
				venueLabel = "待定教室"
			}
			fmt.Fprintf(&b, "  - 周%s %s-%s %s%s", dayLabel(s.Day), s.StartTime, s.EndTime, venueLabel, campusLabel)
			if s.StartDate != "" || s.EndDate != "" {
				b.WriteString(" " + formatDateRange(parseDateRange(s.StartDate, s.EndDate)))
			}
			b.WriteString("\n")
		}
	}

	return b.String()
}

// ---------- 全部课程目录（背景上下文） ----------

// loadAllCourseDetails 从数据库加载全部课程详情，用于给助手注入完整课程目录，
// 使其能跨课对比、主动推荐学生未选的课程。
func loadAllCourseDetails(db *sql.DB) ([]courseDetail, error) {
	rows, err := db.Query("SELECT code FROM courses ORDER BY code")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	codes := make([]string, 0)
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result := make([]courseDetail, 0, len(codes))
	for _, code := range codes {
		d, derr := loadCourseDetail(db, code)
		if derr != nil {
			continue
		}
		result = append(result, d)
	}
	return result, nil
}

// formatCourseBrief 把一门课压缩成 1–3 行摘要，用于背景目录（不含学生评价全文）。
func formatCourseBrief(d courseDetail) string {
	var b strings.Builder
	fmt.Fprintf(&b, "【%s %s】", d.Code, d.Title)
	if d.OfferDept != nil && *d.OfferDept != "" {
		fmt.Fprintf(&b, " %s", *d.OfferDept)
	}
	b.WriteString("\n")

	g := d.GradeDistribution
	total := sumGrades(g)
	if total > 0 {
		aRange := g.APlus + g.A + g.AMinus
		fmt.Fprintf(&b, "  成绩样本 %d 人，A 及以上 %.0f%%", total, float64(aRange)/float64(total)*100)
	} else {
		b.WriteString("  暂无成绩样本")
	}
	fv := d.FeatureVotes
	work := make([]string, 0, 6)
	if fv.Final.Yes > fv.Final.No {
		work = append(work, "期末")
	}
	if fv.Essay.Yes > fv.Essay.No {
		work = append(work, "论文")
	}
	if fv.Project.Yes > fv.Project.No {
		work = append(work, "项目")
	}
	if fv.Presentation.Yes > fv.Presentation.No {
		work = append(work, "展示")
	}
	if fv.Attendance.Yes > fv.Attendance.No {
		work = append(work, "考勤")
	}
	if fv.Tutorial.Yes > fv.Tutorial.No {
		work = append(work, "辅导")
	}
	if len(work) > 0 {
		fmt.Fprintf(&b, "；考核：%s", strings.Join(work, "/"))
	}
	b.WriteString("\n")

	var slots []slot
	for _, sub := range d.Subclasses {
		if sub.IsActive {
			slots = sub.Slots
			break
		}
	}
	if len(slots) > 0 {
		days := map[int]bool{}
		early := false
		cross := false
		for _, s := range slots {
			days[s.Day] = true
			if s.StartTime < "09:30" {
				early = true
			}
			if campusOf(s.Venue) == campusCentennial {
				cross = true
			}
		}
		dayNums := make([]int, 0, len(days))
		for day := range days {
			dayNums = append(dayNums, day)
		}
		sort.Ints(dayNums)
		dayStrs := make([]string, 0, len(dayNums))
		for _, day := range dayNums {
			dayStrs = append(dayStrs, "周"+dayLabel(day))
		}
		tags := make([]string, 0, 2)
		if early {
			tags = append(tags, "含早八")
		}
		if cross {
			tags = append(tags, "跨校区")
		}
		fmt.Fprintf(&b, "  上课：%s", strings.Join(dayStrs, "、"))
		if len(tags) > 0 {
			fmt.Fprintf(&b, "（%s）", strings.Join(tags, "、"))
		}
		b.WriteString("\n")
	}
	return b.String()
}

// buildCatalogText 把全部课程拼成一段目录文本。
func buildCatalogText(details []courseDetail) string {
	lines := make([]string, 0, len(details))
	for _, d := range details {
		lines = append(lines, formatCourseBrief(d))
	}
	return strings.Join(lines, "\n")
}

func sumGrades(g gradeDistribution) int {
	return g.APlus + g.A + g.AMinus + g.BPlus + g.B + g.BMinus +
		g.CPlus + g.C + g.CMinus + g.DPlus + g.D + g.DMinus + g.Pass + g.Fail
}

func aRateOf(g gradeDistribution) float64 {
	total := sumGrades(g)
	if total == 0 {
		return 0
	}
	return float64(g.APlus+g.A+g.AMinus) / float64(total)
}

// ---------- 处理器 ----------

func assistantHandler(db *sql.DB, cfg assistantConfig) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writeError(response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "仅支持 POST")
			return
		}

		var body assistantRequestBody
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			writeError(response, http.StatusBadRequest, "INVALID_BODY", "请求体格式错误，应为 JSON")
			return
		}
		if strings.TrimSpace(body.Message) == "" {
			writeError(response, http.StatusBadRequest, "EMPTY_MESSAGE", "请输入你想问的问题")
			return
		}

		ctx := buildAssistantContext(db, body.SubclassIDs, body.CourseCodes)

		// 注入全部课程目录作为背景上下文（轻量方案：助手可跨课对比、主动推荐）。
		catalog, catErr := loadAllCourseDetails(db)
		catalogText := ""
		if catErr == nil && len(catalog) > 0 {
			catalogText = buildCatalogText(catalog)
		}

		system := assistantSystemPrompt()
		user := "学生的问题：\n" + strings.TrimSpace(body.Message) + "\n\n"
		if ctx.text == "" {
			user += "（学生选课篮暂为空。）\n\n"
		} else {
			user += "学生已选课程（详细上下文）：\n" + ctx.text + "\n\n"
		}
		if catalogText != "" {
			user += fmt.Sprintf("全部课程目录（共 %d 门，含学生未选课程，可用于对比与推荐）：\n%s", len(catalog), catalogText)
		}

		reply, err := callDeepSeek(cfg, system, user)
		if err != nil {
			// 未配置 Key 或调用失败（超时 / 限流 / 网络）→ 回落到基于数据的离线概览。
			offline := offlineSummary(ctx.courses, catalog)
			writeJSON(response, http.StatusOK, assistantResponseBody{
				Reply: offline,
				Mode:  "offline",
				Note:  "大模型暂不可用（" + err.Error() + "），已切换为基于课程数据的离线概览。",
			})
			return
		}

		writeJSON(response, http.StatusOK, assistantResponseBody{Reply: reply, Mode: "ai"})
	}
}

func assistantSystemPrompt() string {
	return `你是 RIC（香港大学内地本科生权益保障组）选课规划器的 AI 选课助手，面向 HKU 内地本科生。

你的职责：
- 结合学生提供的课程数据（成绩分布、考核方式、学生评价、上课时间与校区），用简体中文给出选课建议。
- 帮学生评估课程难度、工作量、是否「水课 / 硬课」，以及早八、跨校区通勤、时间冲突等现实问题。
- 语气亲切、务实，像学长学姐一样给建议；结论明确，避免空话。
- 若学生选了多门课，主动提示可能的时间冲突与跨校区奔波风险（应用本身已做硬冲突与通勤提示，你可据此做整体权衡）。
- 每次对话都会附上「全部课程目录」（含学生未选课程）。你可据此跨课对比、主动推荐合适的水课或互补课；推荐时请明确给出课程代码，方便学生一键加入。
- 只回答选课相关的问题；不知道或不确定的信息如实说明，不要编造数据。
- 回答控制在适读长度，必要时用分点。`
}

// ---------- DeepSeek 调用 ----------

func callDeepSeek(cfg assistantConfig, system, user string) (string, error) {
	if strings.TrimSpace(cfg.apiKey) == "" {
		return "", errors.New("DEEPSEEK_API_KEY 未配置")
	}

	payload, err := json.Marshal(map[string]any{
		"model": cfg.model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature": 0.7,
		"stream":      false,
	})
	if err != nil {
		return "", err
	}

	url := cfg.baseURL + "/v1/chat/completions"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.apiKey)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: cfg.timeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("未返回任何内容")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "…"
}

// ---------- 离线回落 ----------

// offlineSummary 在没有大模型时，直接用课程数据生成一份结构化中文概览，
// 覆盖已选课难度、工作量、上课节奏与跨课冲突，并在末尾列出全部可选课程目录，
// 保证「离线也有用、且能跨课推荐」。
func offlineSummary(cart []courseContext, catalog []courseDetail) string {
	var b strings.Builder

	if len(cart) == 0 {
		b.WriteString("当前选课篮为空。下面是全部可选课程的离线概览（未连接大模型，由课程数据自动生成）：\n\n")
	} else {
		fmt.Fprintf(&b, "已为你整理 %d 门已选课的离线概览（未连接大模型，以下由课程数据自动生成）：\n\n", len(cart))
	}

	for index, c := range cart {
		d := c.Detail
		g := d.GradeDistribution
		total := g.APlus + g.A + g.AMinus + g.BPlus + g.B + g.BMinus +
			g.CPlus + g.C + g.CMinus + g.DPlus + g.D + g.DMinus + g.Pass + g.Fail

		difficulty := "难度适中"
		if total > 0 {
			aRate := float64(g.APlus+g.A+g.AMinus) / float64(total)
			switch {
			case aRate >= 0.5:
				difficulty = "相对轻松（A 及以上占比较高）"
			case aRate <= 0.2:
				difficulty = "偏硬（高分比例低，需多投入）"
			}
		}

		fv := d.FeatureVotes
		workItems := make([]string, 0, 6)
		if fv.Final.Yes > fv.Final.No {
			workItems = append(workItems, "期末考")
		}
		if fv.Essay.Yes > fv.Essay.No {
			workItems = append(workItems, "论文")
		}
		if fv.Project.Yes > fv.Project.No {
			workItems = append(workItems, "项目")
		}
		if fv.Presentation.Yes > fv.Presentation.No {
			workItems = append(workItems, "展示")
		}
		if fv.Attendance.Yes > fv.Attendance.No {
			workItems = append(workItems, "考勤")
		}
		if fv.Tutorial.Yes > fv.Tutorial.No {
			workItems = append(workItems, "辅导课")
		}
		workload := "考核较轻"
		if len(workItems) > 0 {
			workload = "考核包含：" + strings.Join(workItems, "、")
		}

		fmt.Fprintf(&b, "%d. %s %s\n", index+1, d.Code, d.Title)
		fmt.Fprintf(&b, "   - %s；%s", difficulty, workload)
		if total > 0 {
			fmt.Fprintf(&b, "；成绩样本 %d 人", total)
		}
		b.WriteString("\n")

		if len(c.Slots) > 0 {
			daySet := map[int]bool{}
			crossCampus := false
			for _, s := range c.Slots {
				daySet[s.Day] = true
				if campusOf(s.Venue) == campusCentennial {
					crossCampus = true
				}
			}
			dayNums := make([]int, 0, len(daySet))
			for day := range daySet {
				dayNums = append(dayNums, day)
			}
			sort.Ints(dayNums)
			dayStrs := make([]string, 0, len(dayNums))
			for _, day := range dayNums {
				dayStrs = append(dayStrs, "周"+dayLabel(day))
			}
			fmt.Fprintf(&b, "   - 上课日：%s", strings.Join(dayStrs, "、"))
			if crossCampus {
				b.WriteString("；有百周年校园的课，注意跨校区通勤")
			}
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	// 多门已选课且有排课时，提示时间冲突 / 通勤。
	if len(cart) > 1 {
		items := make([]scheduledSubclass, 0, len(cart))
		for _, c := range cart {
			if len(c.Slots) == 0 {
				continue
			}
			items = append(items, scheduledSubclass{
				CourseCode: c.Code,
				Title:      c.Title,
				Subclass:   subclass{Slots: c.Slots, IsActive: true},
			})
		}
		if len(items) > 1 {
			result := detectSchedule(items)
			if len(result.Conflicts) > 0 {
				b.WriteString("⚠️ 存在硬时间冲突（同一时段两门课重叠），请在选课篮里查看具体冲突并调整班次。\n")
			}
			if len(result.Warnings) > 0 {
				b.WriteString("提示：部分课程之间换教室 / 跨校区间隔偏紧，建议预留充足通勤时间。\n")
			}
			if len(result.Conflicts) == 0 && len(result.Warnings) == 0 {
				b.WriteString("整体时间排布无明显硬冲突，搭配较为可行。\n")
			}
		}
	}

	// 全部课程目录：列出可选项，便于学生从中挑「水课」或互补课。
	if len(catalog) > 0 {
		ranked := make([]courseDetail, len(catalog))
		copy(ranked, catalog)
		sort.SliceStable(ranked, func(i, j int) bool {
			return aRateOf(ranked[i].GradeDistribution) > aRateOf(ranked[j].GradeDistribution)
		})
		b.WriteString("\n—— 全部可选课程（共 " + fmt.Sprintf("%d", len(catalog)) + " 门，按 A 及以上占比从高到低） ——\n")
		for _, d := range ranked {
			g := d.GradeDistribution
			total := sumGrades(g)
			rate := aRateOf(g)
			tag := "适中"
			if total > 0 {
				switch {
				case rate >= 0.5:
					tag = "较轻松"
				case rate <= 0.2:
					tag = "偏硬"
				}
			}
			fmt.Fprintf(&b, "  - %s %s：A 及以上 %.0f%%（%s）\n", d.Code, d.Title, rate*100, tag)
		}
	}

	b.WriteString("\n说明：以上为离线自动概览（含全部课程目录）。配置 DeepSeek API Key 后将获得更自然的对话式建议与跨课推荐。")
	return b.String()
}
