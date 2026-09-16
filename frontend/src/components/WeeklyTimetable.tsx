import type { CartItem } from '../store/cart';
import { dayName, slotMeetsInWeek, toMinutes, type WeekOption } from '../utils/schedule';

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const STEP = 30;
const ROW_COUNT = (DAY_END - DAY_START) / STEP;

const BLOCK_RGB = [
  '47, 84, 235',
  '19, 194, 194',
  '114, 46, 209',
  '235, 47, 150',
  '250, 140, 22',
  '82, 196, 26',
  '24, 144, 255',
  '245, 34, 45',
];

// 色块填充：高透明淡色，与黑白灰基调一致
function colorOf(code: string): string {
  let sum = 0;
  for (let i = 0; i < code.length; i += 1) {
    sum += code.charCodeAt(i);
  }
  return `rgba(${BLOCK_RGB[sum % BLOCK_RGB.length]}, 0.12)`;
}

// 色块边框：同一色相但加深，使颜色清晰可辨且不喧宾夺主
function borderColorOf(code: string): string {
  let sum = 0;
  for (let i = 0; i < code.length; i += 1) {
    sum += code.charCodeAt(i);
  }
  return `rgba(${BLOCK_RGB[sum % BLOCK_RGB.length]}, 0.5)`;
}

interface Block {
  key: string;
  item: CartItem;
  day: number;
  start: string;
  end: string;
  venue: string;
  rowStart: number;
  rowEnd: number;
}

function buildBlocks(items: CartItem[], week: WeekOption | null): Block[] {
  const blocks: Block[] = [];
  items.forEach((item) => {
    item.slots.forEach((slot, index) => {
      if (slot.day < 1 || slot.day > 5) return;
      if (week && !slotMeetsInWeek(slot, week)) return;
      const startMin = toMinutes(slot.start_time);
      const endMin = toMinutes(slot.end_time);
      if (endMin <= DAY_START || startMin >= DAY_END) return;
      const rowStart = Math.max(2, 2 + Math.floor((startMin - DAY_START) / STEP));
      const rowEnd = Math.min(2 + ROW_COUNT, 2 + Math.ceil((endMin - DAY_START) / STEP));
      blocks.push({
        key: `${item.subclassId}-${index}`,
        item,
        day: slot.day,
        start: slot.start_time,
        end: slot.end_time,
        venue: slot.venue,
        rowStart,
        rowEnd,
      });
    });
  });
  return blocks;
}

interface Props {
  items: CartItem[];
  week: WeekOption | null;
}

export default function WeeklyTimetable({ items, week }: Props) {
  const blocks = buildBlocks(items, week);
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => 8 + i);

  return (
    <div
      className="timetable"
      style={{
        gridTemplateColumns: '56px repeat(5, 1fr)',
        gridTemplateRows: `32px repeat(${ROW_COUNT}, 22px)`,
      }}
    >
      <div className="timetable-corner" />
      {[1, 2, 3, 4, 5].map((day) => (
        <div key={day} className="timetable-day" style={{ gridRow: 1, gridColumn: day + 1 }}>
          {dayName(day)}
        </div>
      ))}

      {hours.map((hour, index) => (
        <div
          key={hour}
          className="timetable-hour"
          style={{ gridRow: `${2 + index * 2}`, gridColumn: 1 }}
        >
          {hour}:00
        </div>
      ))}

      {[1, 2, 3, 4, 5].map((day) => (
        <div
          key={`col-${day}`}
          className="timetable-column"
          style={{ gridRow: `2 / ${2 + ROW_COUNT}`, gridColumn: day + 1 }}
        />
      ))}

      {blocks.map((block) => (
        <div
          key={block.key}
          className="timetable-block"
          style={{
            gridRow: `${block.rowStart} / ${block.rowEnd}`,
            gridColumn: block.day + 1,
            backgroundColor: colorOf(block.item.courseCode),
            borderColor: borderColorOf(block.item.courseCode),
          }}
          title={`${block.item.courseCode} ${block.item.section ?? ''} ${block.start}-${block.end} ${block.venue}`}
        >
          <div className="timetable-block-code">
            {block.item.courseCode} {block.item.section ?? ''}
          </div>
          <div className="timetable-block-time">{block.start}-{block.end}</div>
          <div className="timetable-block-venue">{block.venue}</div>
        </div>
      ))}
    </div>
  );
}
