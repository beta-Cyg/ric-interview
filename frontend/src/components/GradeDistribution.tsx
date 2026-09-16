import { Tooltip } from 'antd';
import type { GradeDistribution } from '../types';

const GRADES: { key: keyof GradeDistribution; label: string; color: string }[] = [
  { key: 'a_plus', label: 'A+', color: '#1f1f1f' },
  { key: 'a', label: 'A', color: '#1f1f1f' },
  { key: 'a_minus', label: 'A-', color: '#1f1f1f' },
  { key: 'b_plus', label: 'B+', color: '#1f1f1f' },
  { key: 'b', label: 'B', color: '#1f1f1f' },
  { key: 'b_minus', label: 'B-', color: '#1f1f1f' },
  { key: 'c_plus', label: 'C+', color: '#1f1f1f' },
  { key: 'c', label: 'C', color: '#1f1f1f' },
  { key: 'c_minus', label: 'C-', color: '#1f1f1f' },
  { key: 'd_plus', label: 'D+', color: '#1f1f1f' },
  { key: 'd', label: 'D', color: '#1f1f1f' },
  { key: 'd_minus', label: 'D-', color: '#1f1f1f' },
  { key: 'pass', label: 'P', color: '#bfbfbf' },
  { key: 'fail', label: 'F', color: '#8c8c8c' },
];

export default function GradeDistributionChart({ data }: { data: GradeDistribution }) {
  const values = GRADES.map((grade) => ({ ...grade, count: data[grade.key] ?? 0 }));
  const total = values.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return <div className="empty-hint">暂无成绩分布数据</div>;
  }

  const max = Math.max(...values.map((item) => item.count));

  return (
    <div className="grade-chart">
      {values.map((item) => (
        <Tooltip
          key={item.key}
          title={`${item.label}：${item.count} 人（${((item.count / total) * 100).toFixed(1)}%）`}
        >
          <div className="grade-column">
            <div className="grade-count">{item.count > 0 ? item.count : ''}</div>
            <div
              className="grade-bar"
              style={{
                height: `${Math.max((item.count / max) * 100, 2)}%`,
                backgroundColor: item.color,
              }}
            />
            <div className="grade-label">{item.label}</div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
