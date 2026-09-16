import { Empty, List, Segmented, Select, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { Review } from '../types';

type SortMode = 'likes' | 'latest';

function uniqueValues(values: (string | null)[]): string[] {
  const result = new Set<string>();
  values.forEach((value) => {
    if (value && value.trim()) {
      result.add(value);
    }
  });
  return Array.from(result).sort();
}

export default function ReviewList({ reviews }: { reviews: Review[] }) {
  const [instructor, setInstructor] = useState<string | undefined>(undefined);
  const [semester, setSemester] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortMode>('likes');

  const instructors = useMemo(() => uniqueValues(reviews.map((r) => r.instructor)), [reviews]);
  const semesters = useMemo(() => uniqueValues(reviews.map((r) => r.sem_taken)), [reviews]);

  const filtered = useMemo(() => {
    const result = reviews.filter((review) => {
      if (instructor && review.instructor !== instructor) return false;
      if (semester && review.sem_taken !== semester) return false;
      return true;
    });
    if (sort === 'likes') {
      return [...result].sort((a, b) => b.liked_count - a.liked_count);
    }
    return [...result].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [reviews, instructor, semester, sort]);

  return (
    <div>
      <Space wrap size="middle" className="list-toolbar">
        <Select
          allowClear
          placeholder="全部教师"
          style={{ width: 200 }}
          value={instructor}
          onChange={setInstructor}
          options={instructors.map((name) => ({ value: name, label: name }))}
        />
        <Select
          allowClear
          placeholder="全部学期"
          style={{ width: 140 }}
          value={semester}
          onChange={setSemester}
          options={semesters.map((name) => ({ value: name, label: name }))}
        />
        <Segmented
          value={sort}
          onChange={(value) => setSort(value as SortMode)}
          options={[
            { value: 'likes', label: '按点赞' },
            { value: 'latest', label: '按时间' },
          ]}
        />
      </Space>

      {filtered.length === 0 ? (
        <Empty description="没有符合条件的评价" />
      ) : (
        <List
          dataSource={filtered}
          rowKey={(review) => review.id}
          pagination={filtered.length > 8 ? { pageSize: 8 } : false}
          renderItem={(review) => (
            <List.Item key={review.id}>
              <div className="review-item">
                <Space size={8} wrap className="review-meta">
                  {review.instructor && <Tag color="blue">{review.instructor}</Tag>}
                  {review.year_taken && <Tag>{review.year_taken}</Tag>}
                  {review.sem_taken && <Tag>{review.sem_taken}</Tag>}
                  <Typography.Text type="secondary">
                    {review.liked_count} 人觉得有用
                  </Typography.Text>
                </Space>
                <Typography.Paragraph className="review-content">
                  {review.content}
                </Typography.Paragraph>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
