package main

import (
	"bytes"
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

		system := assistantSystemPrompt()
		user := "学生的问题：\n" + strings.TrimSpace(body.Message) + "\n\n"
		if ctx.text == "" {
			user += "（学生尚未提供具体课程。请基于通用选课经验回答，并提示其可把课程加入选课篮或给出课程代码，以便你结合数据给建议。）"
		} else {
			user += "选课上下文（来自学生的选课篮 / 指定课程）：\n" + ctx.text
		}

		reply, err := callDeepSeek(cfg, system, user)
		if err != nil {
			// 未配置 Key 或调用失败（超时 / 限流 / 网络）→ 回落到基于数据的离线概览。
			offline := offlineSummary(ctx.courses)
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
// 覆盖难度、工作量、上课节奏与跨课冲突，保证「离线也有用」。
func offlineSummary(courses []courseContext) string {
	if len(courses) == 0 {
		return "当前没有可分析的课程。你可以把感兴趣的课程加入选课篮，或在问题里直接写明课程代码（例如 ACCT1101、SCNC1112），我就能基于成绩分布、考核方式与上课时间给你一份离线概览。"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "已为你整理 %d 门课的离线概览（未连接大模型，以下由课程数据自动生成）：\n\n", len(courses))

	for index, c := range courses {
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
			workItems = append(workItems, "期末考")		}
		if fv.Essay.Yes > fv.Essay.No {
			workItems = append(workItems, "论文")		}
		if fv.Project.Yes > fv.Project.No {
			workItems = append(workItems, "项目")		}
		if fv.Presentation.Yes > fv.Presentation.No {
			workItems = append(workItems, "展示")		}
		if fv.Attendance.Yes > fv.Attendance.No {
			workItems = append(workItems, "考勤")		}
		if fv.Tutorial.Yes > fv.Tutorial.No {
			workItems = append(workItems, "辅导课")		}
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

	// 多门课且有排课时，提示时间冲突 / 通勤。
	if len(courses) > 1 {
		items := make([]scheduledSubclass, 0, len(courses))
		for _, c := range courses {
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

	b.WriteString("\n说明：以上为离线自动概览。配置 DeepSeek API Key 后将获得更自然的对话式建议。")
	return b.String()
}
