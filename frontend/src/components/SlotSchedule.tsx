import type { Slot } from '../types';
import { dayName, formatTimeRange, groupSlots, slotKey, slotMeetsInWeek } from '../utils/schedule';
import type { WeekOption } from '../utils/schedule';

interface Props {
  slots: Slot[];
  // 传入周次时，该周不上课的时间点会以灰色弱化显示，与上方课表保持一致。
  week?: WeekOption | null;
}

export default function SlotSchedule({ slots, week }: Props) {
  const groups = groupSlots(slots);
  if (groups.length === 0) {
    return <span>—</span>;
  }

  // 归约时把日期段合并了，判断某周是否有课要回到原始 slot 上算。
  const activeKeys = week
    ? new Set(
        slots.filter((slot) => slotMeetsInWeek(slot, week)).map((slot) => slotKey(slot)),
      )
    : null;

  return (
    <div>
      {groups.map((group) => {
        const inactive = activeKeys ? !activeKeys.has(group.key) : false;
        return (
          <div key={group.key} style={{ marginBottom: 6, opacity: inactive ? 0.45 : 1 }}>
            <div>
              {dayName(group.day)} {formatTimeRange(group.startTime, group.endTime)}
              {group.venue ? ` ${group.venue}` : ''}
            </div>
            {group.dateRanges.length > 0 && (
              <div className="slot-dates" title={group.dateRanges.join('、')}>
                {group.dateRanges.length > 3
                  ? `${group.dateRanges.slice(0, 2).join(' · ')} · 共 ${group.dateRanges.length} 段`
                  : group.dateRanges.join(' · ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
