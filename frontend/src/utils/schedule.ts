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
