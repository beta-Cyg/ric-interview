import { Progress, Typography } from 'antd';
import type { FeatureVotes } from '../types';

const FEATURES: { key: keyof FeatureVotes; label: string; hint: string }[] = [
  { key: 'tutorial', label: '有 Tutorial', hint: '需要上导修课' },
  { key: 'essay', label: '有 Essay', hint: '需要写论文' },
  { key: 'final', label: '有 Final', hint: '有期末考试' },
  { key: 'presentation', label: '有 Presentation', hint: '需要做展示' },
  { key: 'project', label: '有 Project', hint: '需要做项目' },
  { key: 'attendance', label: '点名严格', hint: '考勤要求高' },
];

export default function FeatureVotesPanel({ data }: { data: FeatureVotes }) {
  return (
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
              strokeColor={total === 0 ? '#d9d9d9' : '#1f1f1f'}
              showInfo={total > 0}
            />
          </div>
        );
      })}
    </div>
  );
}
