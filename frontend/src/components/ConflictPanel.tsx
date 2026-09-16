import { Alert, Empty, Tag, Typography } from 'antd';
import type { Conflict, ScheduleWarning } from '../types';
import { campusLabel, dayName } from '../utils/schedule';

interface Props {
  conflicts: Conflict[];
  warnings: ScheduleWarning[];
}

export default function ConflictPanel({ conflicts, warnings }: Props) {
  return (
    <div className="conflict-panel">
      <Typography.Title level={5}>
        冲突检测
        {conflicts.length > 0 && <Tag color="error">{conflicts.length} 处时间冲突</Tag>}
        {warnings.length > 0 && <Tag color="warning">{warnings.length} 条通勤提示</Tag>}
        {conflicts.length === 0 && warnings.length === 0 && <Tag color="success">无冲突</Tag>}
      </Typography.Title>

      {conflicts.length === 0 && warnings.length === 0 && (
        <Empty description="当前选课篮没有时间冲突，可以放心提交" />
      )}

      {conflicts.map((conflict, index) => (
        <Alert
          key={`c-${index}`}
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message={
            <span>
              <strong>
                {conflict.left.courseCode} {conflict.left.section ?? ''}
              </strong>{' '}
              与{' '}
              <strong>
                {conflict.right.courseCode} {conflict.right.section ?? ''}
              </strong>{' '}
              在{dayName(conflict.day)} {conflict.overlapStart}-{conflict.overlapEnd} 重叠{' '}
              {conflict.overlapMinutes} 分钟
            </span>
          }
          description={
            <span>
              {conflict.left.venue} → {conflict.right.venue} · 生效周次：
              {(conflict.dateRanges ?? []).join('、') || conflict.dateRange}
            </span>
          }
        />
      ))}

      {warnings.map((warning, index) => (
        <Alert
          key={`w-${index}`}
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={warning.message}
          description={
            <span>
              {campusLabel(warning.left.campus)}→{campusLabel(warning.right.campus)} · 间隔{' '}
              {warning.gapMinutes} 分钟 · 生效周次：
              {(warning.dateRanges ?? []).join('、') || '—'}
            </span>
          }
        />
      ))}
    </div>
  );
}
