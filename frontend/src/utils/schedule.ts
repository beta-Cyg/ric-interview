import type { Slot } from '../types';

export const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function dayName(day: number): string {
  return DAY_NAMES[day] ?? `第${day}天`;
}

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start}-${end}`;
}

export function formatSlot(slot: Slot): string {
  const parts = [dayName(slot.day), formatTimeRange(slot.start_time, slot.end_time)];
  if (slot.venue) {
    parts.push(slot.venue);
  }
  return parts.join(' ');
}

export function formatSlotDate(slot: Slot): string {
  return `${slot.start_date} - ${slot.end_date}`;
}

export function campusLabel(campus: string): string {
  if (campus === 'centennial') {
    return '百周年校园';
  }
  if (campus === 'main') {
    return '本部';
  }
  return '未知校区';
}

// ---------- 日期处理 ----------

// 数据集里的日期形如 2026/09/03，不是 ISO 格式，不能直接 new Date(string)。
export function parseCourseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatMonthDay(date: Date): string {
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

export function formatDateRange(start: string, end: string): string {
  const from = parseCourseDate(start);
  const to = parseCourseDate(end);
  if (!from || !to) return '';
  if (start === end) return formatMonthDay(from);
  if (from.getFullYear() !== to.getFullYear()) return `${start}-${end}`;
  return `${formatMonthDay(from)}-${formatMonthDay(to)}`;
}

// ---------- slot 归约 ----------

export interface SlotGroup {
  key: string;
  day: number;
  startTime: string;
  endTime: string;
  venue: string;
  dateRanges: string[];
}

// 同一个「周几 + 时段 + 教室」在数据集里会被拆成多条（学期切成多个教学周段），
// 归约后一行显示，日期段挂在下面，避免 8 条记录渲染成 8 行重复内容。
export function groupSlots(slots: Slot[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  slots.forEach((slot) => {
    const key = `${slot.day}|${slot.start_time}|${slot.end_time}|${slot.venue}`;
    const range = formatDateRange(slot.start_date, slot.end_date);
    const existing = groups.get(key);
    if (existing) {
      if (range && !existing.dateRanges.includes(range)) {
        existing.dateRanges.push(range);
      }
      return;
    }
    groups.set(key, {
      key,
      day: slot.day,
      startTime: slot.start_time,
      endTime: slot.end_time,
      venue: slot.venue,
      dateRanges: range ? [range] : [],
    });
  });
  return Array.from(groups.values()).sort(
    (a, b) => a.day - b.day || toMinutes(a.startTime) - toMinutes(b.startTime),
  );
}

// ---------- 周次 ----------

export interface WeekOption {
  index: number;
  start: Date;
  end: Date;
  label: string;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 数据集里 day=1 是周一，所以这里把周一当作一周的第一天。
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

// 按所选班次覆盖的日期范围切出连续周次，空周也保留（周序号才有意义）。
export function buildWeeks(slots: Slot[]): WeekOption[] {
  const bounds: number[] = [];
  slots.forEach((slot) => {
    const from = parseCourseDate(slot.start_date);
    const to = parseCourseDate(slot.end_date);
    if (from) bounds.push(from.getTime());
    if (to) bounds.push(to.getTime());
  });
  if (bounds.length === 0) return [];

  const last = new Date(Math.max(...bounds));
  const cursor = startOfWeek(new Date(Math.min(...bounds)));
  const weeks: WeekOption[] = [];
  let index = 1;
  while (cursor <= last && index <= 60) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    weeks.push({
      index,
      start: new Date(cursor),
      end,
      label: `第 ${index} 周（${formatMonthDay(cursor)}-${formatMonthDay(end)}）`,
    });
    cursor.setDate(cursor.getDate() + 7);
    index += 1;
  }
  return weeks;
}

// 该周内 slot.day 对应的那一天，是否落在日期区间内。
export function slotMeetsInWeek(slot: Slot, week: WeekOption): boolean {
  const from = parseCourseDate(slot.start_date);
  const to = parseCourseDate(slot.end_date);
  if (!from || !to || slot.day < 1 || slot.day > 7) return false;
  const target = new Date(week.start);
  target.setDate(target.getDate() + (slot.day - 1));
  const time = target.getTime();
  return time >= from.getTime() && time <= to.getTime();
}
