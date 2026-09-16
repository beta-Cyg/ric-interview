package main

import (
	"sort"
	"strings"
	"time"
)

// ---------- 场地 → 校区映射 ----------
//
// 数据来源：
//   - HKU Examinations Office 教室列表 https://www.exam.hku.hk/c_rooms.php
//   - HKU Campus Map https://www.maps.hku.hk
//
// 前缀按「长优先」顺序匹配。未收录的场地返回空字符串，调用方必须跳过，
// 不得猜测其所属校区（PRD FR-6.4）。

const (
	campusMain       = "main"
	campusCentennial = "centennial"
)

var venuePrefixes = []struct {
	prefix string
	campus string
}{
	{"CPD", campusCentennial}, // Central Podium Levels, 百周年校园
	{"CBA", campusMain},       // Chow Yei Ching Building
	{"CBC", campusMain},
	{"CB", campusMain},
	{"KKLG", campusMain}, // K.K. Leung Building
	{"KK", campusMain},
	{"MWT", campusMain}, // Meng Wah Complex
	{"MW", campusMain},
	{"CYPP", campusMain}, // Chong Yuet Ming Physics Building
	{"CYP", campusMain},
	{"LE", campusMain}, // Library Extension
	{"MB", campusMain}, // Main Building
	{"KB", campusMain}, // Knowles Building
	{"TT", campusMain}, // T.T. Tsui Building
	{"RHT", campusMain},
	{"EH", campusMain},
	{"JL", campusMain},
}

func campusOf(venue string) string {
	trimmed := strings.ToUpper(strings.TrimSpace(venue))
	if trimmed == "" {
		return ""
	}
	for _, entry := range venuePrefixes {
		if strings.HasPrefix(trimmed, entry.prefix) {
			return entry.campus
		}
	}
	return ""
}

// ---------- 冲突与通勤判定 ----------

const (
	venueChangeGapMinutes  = 15
	// 本部与百周年校园相邻（有连廊），30 分钟偏保守，只作提示不阻断。
	crossCampusGapMinutes = 30
)

type scheduleRef struct {
	CourseCode string  `json:"courseCode"`
	Title      string  `json:"title"`
	SubclassID int     `json:"subclassId"`
	Section    *string `json:"section"`
	Semester   *string `json:"semester"`
	SlotIndex  int     `json:"slotIndex"`
	Day        int     `json:"day"`
	Venue      string  `json:"venue"`
	StartTime  string  `json:"startTime"`
	EndTime    string  `json:"endTime"`
	StartDate  string  `json:"startDate"`
	EndDate    string  `json:"endDate"`
	Campus     string  `json:"campus"`
}

type conflict struct {
	Severity       string      `json:"severity"`
	Left           scheduleRef `json:"left"`
	Right          scheduleRef `json:"right"`
	Day            int         `json:"day"`
	OverlapStart   string      `json:"overlapStart"`
	OverlapEnd     string      `json:"overlapEnd"`
	OverlapMinutes int         `json:"overlapMinutes"`
	DateRange      string      `json:"dateRange"`
	DateRanges     []string    `json:"dateRanges"`
}

type warning struct {
	Severity   string      `json:"severity"`
	Type       string      `json:"type"`
	Left       scheduleRef `json:"left"`
	Right      scheduleRef `json:"right"`
	GapMinutes int         `json:"gapMinutes"`
	Message    string      `json:"message"`
	DateRanges []string    `json:"dateRanges"`
}

type scheduleResult struct {
	Conflicts []conflict `json:"conflicts"`
	Warnings  []warning  `json:"warnings"`
	Semesters []string   `json:"semesters"`
}

type scheduledSubclass struct {
	CourseCode string
	Title      string
	Subclass   subclass
}

func detectSchedule(items []scheduledSubclass) scheduleResult {
	result := scheduleResult{
		Conflicts: []conflict{},
		Warnings:  []warning{},
		Semesters: []string{},
	}

	// 只保留活跃班次（FR-3.7）
	active := make([]scheduledSubclass, 0, len(items))
	for _, item := range items {
		if item.Subclass.IsActive {
			active = append(active, item)
		}
	}

	// 按学期分组：Sem 1 与 Sem 2 的课不可能真的撞时间（FR-4.3）
	bySemester := map[string][]scheduledSubclass{}
	semesterSeen := map[string]bool{}
	for _, item := range active {
		key := ""
		if item.Subclass.Semester != nil {
			key = *item.Subclass.Semester
		}
		bySemester[key] = append(bySemester[key], item)
		if !semesterSeen[key] {
			semesterSeen[key] = true
			result.Semesters = append(result.Semesters, key)
		}
	}
	sort.Strings(result.Semesters)

	for _, semester := range result.Semesters {
		group := bySemester[semester]
		for i := 0; i < len(group); i++ {
			for j := i + 1; j < len(group); j++ {
				// 同一班次内部的 slot 是数据源自身排课，不算用户决策冲突（FR-5.5）
				sameSubclass := group[i].Subclass.ID == group[j].Subclass.ID &&
					group[i].CourseCode == group[j].CourseCode
				if sameSubclass {
					continue
				}
				compareSubclasses(group[i], group[j], &result)
			}
		}
	}

	result.Conflicts = mergeConflicts(result.Conflicts)
	result.Warnings = mergeWarnings(result.Warnings)

	sort.Slice(result.Conflicts, func(a, b int) bool {
		return result.Conflicts[a].OverlapMinutes > result.Conflicts[b].OverlapMinutes
	})
	sort.Slice(result.Warnings, func(a, b int) bool {
		dayA, dayB := result.Warnings[a].Left.Day, result.Warnings[b].Left.Day
		if dayA != dayB {
			return dayA < dayB
		}
		return result.Warnings[a].GapMinutes < result.Warnings[b].GapMinutes
	})

	return result
}

// mergeConflicts 合并同一对班次在同一天同一时间段的冲突：数据源里同一节课
// 常被拆成多个日期区间（如 9/7-10/5 与 10/26-11/30），逐段比对会产生重复条目。
func mergeConflicts(items []conflict) []conflict {
	merged := make([]conflict, 0, len(items))
	positions := map[string]int{}
	ranges := map[string][]string{}

	for _, item := range items {
		key := itoa(item.Left.SubclassID) + "|" + itoa(item.Right.SubclassID) + "|" +
			itoa(item.Day) + "|" + item.OverlapStart + "|" + item.OverlapEnd

		if index, ok := positions[key]; ok {
			if !containsString(ranges[key], item.DateRange) {
				ranges[key] = append(ranges[key], item.DateRange)
				merged[index].DateRanges = ranges[key]
			}
			continue
		}
		item.DateRanges = []string{item.DateRange}
		positions[key] = len(merged)
		ranges[key] = item.DateRanges
		merged = append(merged, item)
	}

	return merged
}

func mergeWarnings(items []warning) []warning {
	merged := make([]warning, 0, len(items))
	positions := map[string]int{}
	ranges := map[string][]string{}

	for _, item := range items {
		key := itoa(item.Left.SubclassID) + "|" + itoa(item.Right.SubclassID) + "|" +
			itoa(item.Left.Day) + "|" + item.Type + "|" +
			item.Left.StartTime + "|" + item.Right.StartTime

		rangeLabel := formatDateRange(parseDateRangeRaw(item.Left.StartDate, item.Left.EndDate))
		if index, ok := positions[key]; ok {
			if !containsString(ranges[key], rangeLabel) {
				ranges[key] = append(ranges[key], rangeLabel)
				merged[index].DateRanges = ranges[key]
			}
			continue
		}
		item.DateRanges = []string{rangeLabel}
		positions[key] = len(merged)
		ranges[key] = item.DateRanges
		merged = append(merged, item)
	}

	return merged
}

func parseDateRangeRaw(start, end string) (time.Time, time.Time) {
	return parseDateRange(start, end)
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func compareSubclasses(left, right scheduledSubclass, result *scheduleResult) {
	for a, slotA := range left.Subclass.Slots {
		for b, slotB := range right.Subclass.Slots {
			if slotA.Day != slotB.Day {
				continue
			}
			startA, endA, okA := parseMinutes(slotA.StartTime, slotA.EndTime)
			startB, endB, okB := parseMinutes(slotB.StartTime, slotB.EndTime)
			if !okA || !okB {
				continue
			}
			fromA, toA := parseDateRange(slotA.StartDate, slotA.EndDate)
			fromB, toB := parseDateRange(slotB.StartDate, slotB.EndDate)
			if !dateRangesOverlap(fromA, toA, fromB, toB) {
				continue
			}

			refA := buildRef(left, a, slotA)
			refB := buildRef(right, b, slotB)

			if startA < endB && startB < endA {
				// 硬冲突（FR-5.1）
				overlapStart := maxInt(startA, startB)
				overlapEnd := minInt(endA, endB)
				result.Conflicts = append(result.Conflicts, conflict{
					Severity:       "error",
					Left:           refA,
					Right:          refB,
					Day:            slotA.Day,
					OverlapStart:   formatMinutes(overlapStart),
					OverlapEnd:     formatMinutes(overlapEnd),
					OverlapMinutes: overlapEnd - overlapStart,
					DateRange:      formatDateRange(maxDate(fromA, fromB), minDate(toA, toB)),
				})
				continue // 已判冲突就不再重复产出通勤提示（FR-6.6）
			}

			// 不重叠 → 计算间隔，产出通勤提示（FR-6.1 ~ FR-6.3）
			earlier, later := refA, refB
			earlierEnd, laterStart := endA, startB
			if startB < startA {
				earlier, later = refB, refA
				earlierEnd, laterStart = endB, startA
			}
			gap := laterStart - earlierEnd
			if gap < 0 {
				continue
			}

			campusA := campusOf(earlier.Venue)
			campusB := campusOf(later.Venue)
			crossCampus := campusA != "" && campusB != "" && campusA != campusB

			switch {
			case crossCampus && gap < crossCampusGapMinutes:
				result.Warnings = append(result.Warnings, warning{
					Severity:   "warning",
					Type:       "CROSS_CAMPUS",
					Left:       earlier,
					Right:      later,
					GapMinutes: gap,
					Message:    formatCommuteMessage("跨校区", earlier, later, gap, crossCampusGapMinutes),
				})
			case earlier.Venue != later.Venue && gap < venueChangeGapMinutes:
				result.Warnings = append(result.Warnings, warning{
					Severity:   "warning",
					Type:       "VENUE_CHANGE",
					Left:       earlier,
					Right:      later,
					GapMinutes: gap,
					Message:    formatCommuteMessage("换教室", earlier, later, gap, venueChangeGapMinutes),
				})
			}
		}
	}
}

func buildRef(item scheduledSubclass, index int, s slot) scheduleRef {
	return scheduleRef{
		CourseCode: item.CourseCode,
		Title:      item.Title,
		SubclassID: item.Subclass.ID,
		Section:    item.Subclass.Section,
		Semester:   item.Subclass.Semester,
		SlotIndex:  index,
		Day:        s.Day,
		Venue:      s.Venue,
		StartTime:  s.StartTime,
		EndTime:    s.EndTime,
		StartDate:  s.StartDate,
		EndDate:    s.EndDate,
		Campus:     campusOf(s.Venue),
	}
}

func formatCommuteMessage(kind string, earlier, later scheduleRef, gap, threshold int) string {
	return "周" + dayLabel(earlier.Day) + " " + earlier.EndTime + " 下课后需" + kind +
		"：从 " + displayVenue(earlier.Venue) + " 到 " + displayVenue(later.Venue) +
		"，仅剩 " + itoa(gap) + " 分钟（建议 " + itoa(threshold) + " 分钟以上）"
}

func displayVenue(venue string) string {
	if strings.TrimSpace(venue) == "" {
		return "待定教室"
	}
	return venue
}

// ---------- 时间与日期工具 ----------

func parseMinutes(start, end string) (int, int, bool) {
	startMinute, errStart := parseClock(start)
	endMinute, errEnd := parseClock(end)
	if errStart || errEnd || endMinute <= startMinute {
		return 0, 0, false
	}
	return startMinute, endMinute, true
}

func parseClock(value string) (int, bool) {
	parsed, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		parsed, err = time.Parse("15:04:05", strings.TrimSpace(value))
		if err != nil {
			return 0, true
		}
	}
	return parsed.Hour()*60 + parsed.Minute(), false
}

func formatMinutes(value int) string {
	if value < 0 {
		value = 0
	}
	return itoa(value/60) + ":" + pad2(value%60)
}

func parseDateRange(start, end string) (time.Time, time.Time) {
	from, errFrom := time.Parse("2006/01/02", strings.TrimSpace(start))
	if errFrom != nil {
		from = time.Time{}
	}
	to, errTo := time.Parse("2006/01/02", strings.TrimSpace(end))
	if errTo != nil {
		to = time.Time{}
	}
	return from, to
}

// dateRangesOverlap 中任一区间解析失败时视为无边界，按重叠处理，避免误判为不冲突。
func dateRangesOverlap(fromA, toA, fromB, toB time.Time) bool {
	if !fromA.IsZero() && !toB.IsZero() && fromA.After(toB) {
		return false
	}
	if !fromB.IsZero() && !toA.IsZero() && fromB.After(toA) {
		return false
	}
	return true
}

func formatDateRange(from, to time.Time) string {
	switch {
	case from.IsZero() && to.IsZero():
		return ""
	case from.IsZero():
		return "至 " + to.Format("2006/01/02")
	case to.IsZero():
		return from.Format("2006/01/02") + " 起"
	default:
		return from.Format("2006/01/02") + " - " + to.Format("2006/01/02")
	}
}

func maxDate(a, b time.Time) time.Time {
	if a.IsZero() || (!b.IsZero() && b.After(a)) {
		return b
	}
	return a
}

func minDate(a, b time.Time) time.Time {
	if a.IsZero() || (!b.IsZero() && b.Before(a)) {
		return b
	}
	return a
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func dayLabel(day int) string {
	labels := map[int]string{1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日"}
	if label, ok := labels[day]; ok {
		return label
	}
	return itoa(day)
}

func pad2(value int) string {
	if value < 10 {
		return "0" + itoa(value)
	}
	return itoa(value)
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	negative := value < 0
	if negative {
		value = -value
	}
	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	if negative {
		return "-" + string(digits)
	}
	return string(digits)
}
