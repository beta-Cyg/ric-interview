import { Alert, Button, Card, Empty, Segmented, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConflicts } from '../api';
import ConflictPanel from '../components/ConflictPanel';
import WeeklyTimetable from '../components/WeeklyTimetable';
import { useCart, type CartItem } from '../store/cart';
import type { ScheduleResult, Slot } from '../types';
import { buildWeeks, formatSlot, slotMeetsInWeek } from '../utils/schedule';

const EMPTY_SCHEDULE: ScheduleResult = { conflicts: [], warnings: [], semesters: [] };

export default function CartPage() {
  const navigate = useNavigate();
  const { items, remove, clear } = useCart();
  const [schedule, setSchedule] = useState<ScheduleResult>(EMPTY_SCHEDULE);
  const [loading, setLoading] = useState(false);
  const [semester, setSemester] = useState<string>('全部');
  // 0 表示「整学期」合并视图，其余为第 N 周。
  const [weekIndex, setWeekIndex] = useState<number>(0);

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

  const weeks = useMemo(() => {
    const slots: Slot[] = [];
    visibleItems.forEach((item) => slots.push(...item.slots));
    return buildWeeks(slots);
  }, [visibleItems]);

  // 换学期或改选课后周次会失效，回到整学期视图。
  useEffect(() => {
    setWeekIndex(0);
  }, [semester, idKey]);

  const selectedWeek = useMemo(
    () => (weekIndex === 0 ? null : weeks.find((week) => week.index === weekIndex) ?? null),
    [weeks, weekIndex],
  );

  const hasClassInWeek = useMemo(() => {
    if (!selectedWeek) return true;
    return visibleItems.some((item) =>
      item.slots.some((slot) => slotMeetsInWeek(slot, selectedWeek)),
    );
  }, [visibleItems, selectedWeek]);

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
            <Card
              size="small"
              loading={loading}
              title={selectedWeek ? `周课表 · ${selectedWeek.label}` : '周课表'}
            >
              {semesterOptions.length > 0 && (
                <Segmented
                  value={semester}
                  onChange={(value) => setSemester(String(value))}
                  options={semesterOptions}
                  style={{ marginBottom: 12 }}
                />
              )}
              {weeks.length > 0 && (
                <Space style={{ marginBottom: 12 }} wrap>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>周次</span>
                  <Select
                    value={weekIndex}
                    onChange={(value) => setWeekIndex(Number(value))}
                    style={{ width: 230 }}
                    options={[
                      { value: 0, label: '整学期（合并显示）' },
                      ...weeks.map((week) => ({ value: week.index, label: week.label })),
                    ]}
                  />
                </Space>
              )}
              <WeeklyTimetable items={visibleItems} week={selectedWeek} />
              {!hasClassInWeek && selectedWeek && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`${selectedWeek.label} 没有排课`}
                  description="该周不落在所选班次的教学周区间内，通常是 reading week、假期或考试周。"
                />
              )}
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
