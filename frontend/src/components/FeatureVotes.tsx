import { Progress, Typography } from 'antd';
import type { FeatureVotes } from '../types';

// short 用于六边形雷达图顶点标签（顶点空间有限，用简短中文）
const FEATURES: { key: keyof FeatureVotes; label: string; short: string; hint: string }[] = [
  { key: 'tutorial', label: '有 Tutorial', short: '导修', hint: '需要上导修课' },
  { key: 'essay', label: '有 Essay', short: '论文', hint: '需要写论文' },
  { key: 'final', label: '有 Final', short: '期末', hint: '有期末考试' },
  { key: 'presentation', label: '有 Presentation', short: '展示', hint: '需要做展示' },
  { key: 'project', label: '有 Project', short: '项目', hint: '需要做项目' },
  { key: 'attendance', label: '点名严格', short: '点名', hint: '考勤要求高' },
];

const AXES = FEATURES.length;

function HexRadar({ data }: { data: FeatureVotes }) {
  const size = 280;
  const center = size / 2;
  const R = 92;
  const angleOf = (i: number) => ((-90 + (360 / AXES) * i) * Math.PI) / 180;
  const pointAt = (i: number, value: number) => {
    const r = (value / 100) * R;
    const a = angleOf(i);
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
  };

  const levels = [0.25, 0.5, 0.75, 1];
  const ringPoints = (level: number) =>
    FEATURES.map((_, i) => {
      const p = pointAt(i, level * 100);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');

  const dataPoints = FEATURES.map((feature, i) => {
    const pair = data[feature.key];
    const total = (pair?.yes ?? 0) + (pair?.no ?? 0);
    const value = total === 0 ? 0 : ((pair?.yes ?? 0) / total) * 100;
    return pointAt(i, value);
  });
  const dataPolygon = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="feature-radar-svg" role="img" aria-label="课程负担六维雷达图">
      {levels.map((lv) => (
        <polygon key={lv} points={ringPoints(lv)} className="radar-grid" />
      ))}
      {FEATURES.map((_, i) => {
        const p = pointAt(i, 100);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} className="radar-axis" />;
      })}
      <polygon points={dataPolygon} className="radar-data" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="radar-dot" />
      ))}
      {FEATURES.map((feature, i) => {
        const a = angleOf(i);
        const lx = center + (R + 16) * Math.cos(a);
        const ly = center + (R + 16) * Math.sin(a);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        return (
          <text key={i} x={lx} y={ly} className="radar-label" textAnchor={anchor} dominantBaseline="middle">
            {feature.short}
          </text>
        );
      })}
    </svg>
  );
}

export default function FeatureVotesPanel({ data }: { data: FeatureVotes }) {
  return (
    <div>
      <div className="feature-radar">
        <HexRadar data={data} />
        <Typography.Text type="secondary" className="feature-radar-caption">
          六边形各顶点表示对应维度的「有 / 需要」占比（越外圈占比越高）
        </Typography.Text>
      </div>
      <div className="feature-grid">
        {FEATURES.map((feature) => {
          const pair = data[feature.key];
          const total = (pair?.yes ?? 0) + (pair?.no ?? 0);
          const percent = total === 0 ? 0 : Math.round((pair.yes / total) * 100);
          return (
            <div key={feature.key} className="feature-item">
              <div className="feature-head">
                <Typography.Text>{feature.label}</Typography.Text>
                <Typography.Text type="secondary" className="feature-hint">
                  {total === 0 ? '数据不足' : `${pair.yes}/${total} 人`}
                </Typography.Text>
              </div>
              <Progress
                percent={percent}
                status={total === 0 ? 'normal' : 'active'}
                strokeColor={total === 0 ? '#d9d9d9' : '#1D9E75'}
                showInfo={total > 0}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
