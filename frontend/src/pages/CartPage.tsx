import { Button, Card, Empty, Segmented, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConflicts } from '../api';
import ConflictPanel from '../components/ConflictPanel';
import WeeklyTimetable from '../components/WeeklyTimetable';
import { useCart, type CartItem } from '../store/cart';
import type { ScheduleResult } from '../types';
import { formatSlot } from '../utils/schedule';

const EMPTY_SCHEDULE: ScheduleResult = { conflicts: [], warnings: [], semesters: [] };

export default function CartPage() {
  const navigate = useNavigate();
  const { items, remove, clear } = useCart();
  const [schedule, setSchedule] = useState<ScheduleResult>(EMPTY_SCHEDULE);
  const [loading, setLoading] = useState(false);
  const [semester, setSemester] = useState<string>('全部');

  const idKey = items
    .map((item) => item.subclassId)
    .sort((a, b) => a - b)
    .join(',');

  useEffect(() => {
    const ids = idKey ? idKey.split(',').map(Number) : [];
    if (ids.length === 0) {
      setSchedule(EMPTY_SCHEDULE);
      return;
    }
    let active = true;
    setLoading(true);
    fetchConflicts(ids)
      .then((data) => {
        if (active) setSchedule(data);
      })
      .catch(() => {
        if (active) setSchedule(EMPTY_SCHEDULE);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [idKey]);

  const semesterOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.semester) values.add(item.semester);
    });
    schedule.semesters.forEach((value) => {
      if (value) values.add(value);
    });
    const list = Array.from(values).sort();
    return list.length > 1 ? ['全部', ...list] : [];
  }, [items, schedule.semesters]);

  const visibleItems = useMemo(
    () => (semester === '全部' ? items : items.filter((item) => item.semester === semester)),
    [items, semester],
  );

  const columns: ColumnsType<CartItem> = [
    {
      title: '课程',
      render: (_, item) => (
        <Typography.Link onClick={() => navigate(`/course/${item.courseCode}`)}>
          {item.courseCode} {item.courseTitle}
        </Typography.Link>
      ),
    },
    {
      title: '班次',
      dataIndex: 'section',
      width: 90,
      render: (value: string | null) => value || '—',
    },
    {
      title: '教师',
      dataIndex: 'instructor',
      width: 150,
      render: (value: string | null) => value || '—',
    },
    {
      title: '上课时间',
      render: (_, item) =>
        item.slots.length === 0 ? (
          <span>—</span>
        ) : (
          <div>
            {item.slots.map((slot, index) => (
              <div key={index}>{formatSlot(slot)}</div>
            ))}
          </div>
        ),
    },
    {
      title: '操作',
      width: 90,
      render: (_, item) => (
        <Button size="small" danger onClick={() => remove(item.subclassId)}>
          移除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="cart-header">
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            我的选课篮
          </Typography.Title>
          {items.length > 0 && (
            <Button danger onClick={clear}>
              清空
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <Empty description="还没有选课，去课程列表挑几门吧">
            <Button type="primary" onClick={() => navigate('/')}>
              浏览课程
            </Button>
          </Empty>
        ) : (
          <>
            <Card size="small" loading={loading} title="周课表">
              {semesterOptions.length > 0 && (
                <Segmented
                  value={semester}
                  onChange={(value) => setSemester(String(value))}
                  options={semesterOptions}
                  style={{ marginBottom: 12 }}
                />
              )}
              <WeeklyTimetable items={visibleItems} />
            </Card>

            <Card size="small" loading={loading}>
              <ConflictPanel conflicts={schedule.conflicts} warnings={schedule.warnings} />
            </Card>

            <Card size="small" title={`已选班次（${items.length}）`}>
              <Table<CartItem>
                columns={columns}
                dataSource={items}
                rowKey="subclassId"
                pagination={false}
                size="small"
              />
            </Card>
          </>
        )}
      </Space>
    </div>
  );
}
