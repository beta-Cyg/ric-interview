import { Tooltip } from 'antd';
import type { GradeDistribution } from '../types';

// 成绩分布采用「好→差」语义色阶：高分段绿、中分段青蓝、低分段金橙、F 红、P 紫（非灰）
const GRADES: { key: keyof GradeDistribution; label: string; color: string }[] = [
  { key: 'a_plus', label: 'A+', color: '#237804' },
  { key: 'a', label: 'A', color: '#389e0d' },
  { key: 'a_minus', label: 'A-', color: '#52c41a' },
  { key: 'b_plus', label: 'B+', color: '#1D9E75' },
  { key: 'b', label: 'B', color: '#13c2c2' },
  { key: 'b_minus', label: 'B-', color: '#36cfc9' },
  { key: 'c_plus', label: 'C+', color: '#1677ff' },
  { key: 'c', label: 'C', color: '#4096ff' },
  { key: 'c_minus', label: 'C-', color: '#69b1ff' },
  { key: 'd_plus', label: 'D+', color: '#faad14' },
  { key: 'd', label: 'D', color: '#fa8c16' },
  { key: 'd_minus', label: 'D-', color: '#fa541c' },
  { key: 'pass', label: 'P', color: '#722ed1' },
  { key: 'fail', label: 'F', color: '#ff4d4f' },
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
            <div className="grade-bar-area">
              <div
                className="grade-bar"
                style={{
                  height: `${Math.max((item.count / max) * 100, 2)}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
            <div className="grade-label">{item.label}</div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
