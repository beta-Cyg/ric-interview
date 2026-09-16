import { Alert, Button, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCourse, fetchCourses, fetchDepartments } from '../api';
import { useCart } from '../store/cart';
import type { CourseSort, CourseSummary } from '../types';

const SORT_OPTIONS = [
  { value: 'code', label: '按课程代码' },
  { value: 'reviews', label: '按评价数' },
  { value: 'rating', label: '按好评率' },
];

function ratingValue(course: CourseSummary): number {
  const total = course.likedCount + course.dislikedCount;
  if (total === 0) return -1; // 无评价排最后
  return course.likedCount / total;
}

function ratingText(course: CourseSummary): string {
  const value = ratingValue(course);
  if (value < 0) return '—';
  return `${Math.round(value * 100)}%`;
}

export default function CourseListPage() {
  const navigate = useNavigate();
  const { add, hasSubclass, subclassIdOf } = useCart();

  // 全量课程：仅加载一次，模糊搜索在本地完成，无需每次输入都请求后端
  const [allCourses, setAllCourses] = useState<CourseSummary[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [instructor, setInstructor] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<CourseSort>('code');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  // 关键词防抖：输入停止 300ms 后才触发模糊匹配
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  // 首次进入加载全量课程与院系列表
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCourses({})
      .then((data) => {
        if (!active) return;
        setAllCourses(data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : '课程加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  // Fuse 模糊索引：容忍拼写误差、按相关度排序；ignoreLocation 让匹配不限于开头
  const fuse = useMemo(
    () =>
      new Fuse(allCourses, {
        keys: ['code', 'title', 'offerDept', 'description', 'instructors'],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 1,
      }),
    [allCourses],
  );

  // 所有课程涉及过的讲师（去重），供讲师筛选下拉使用
  const instructors = useMemo(() => {
    const set = new Set<string>();
    allCourses.forEach((course) => course.instructors?.forEach((name) => set.add(name)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allCourses]);

  // 本地模糊过滤 + 院系筛选 + 讲师筛选 + 排序
  const courses = useMemo<CourseSummary[]>(() => {
    let list: CourseSummary[] = allCourses;
    if (keyword) {
      list = fuse.search(keyword).map((result) => result.item);
    }
    if (department) {
      list = list.filter((course) => course.offerDept === department);
    }
    if (instructor) {
      list = list.filter((course) => course.instructors?.includes(instructor));
    }
    const sorted = [...list];
    if (sort === 'reviews') {
      sorted.sort((a, b) => b.reviewedCount - a.reviewedCount || a.code.localeCompare(b.code));
    } else if (sort === 'rating') {
      sorted.sort((a, b) => ratingValue(b) - ratingValue(a) || a.code.localeCompare(b.code));
    } else {
      sorted.sort((a, b) => a.code.localeCompare(b.code));
    }
    return sorted;
  }, [allCourses, fuse, keyword, department, instructor, sort]);

  async function handleQuickAdd(course: CourseSummary) {
    setPendingCode(course.code);
    try {
      const detail = await fetchCourse(course.code);
      const active = detail.subclasses.filter((item) => item.is_active);
      if (active.length === 0) {
        message.warning(`${course.code} 暂无可排班次，无法加入选课篮`);
        return;
      }
      if (active.length > 1) {
        message.info(`${course.code} 有 ${active.length} 个班次，请选择具体 section`);
        navigate(`/course/${course.code}`);
        return;
      }
      const result = add({ code: detail.code, title: detail.title }, active[0]);
      if (result === 'replaced') {
        message.success(`已切换 ${detail.code} 的班次为 ${active[0].section ?? ''}`);
      } else {
        message.success(`已加入 ${detail.code} ${active[0].section ?? ''}`);
      }
    } catch (requestError) {
      message.error(requestError instanceof Error ? requestError.message : '加入失败');
    } finally {
      setPendingCode(null);
    }
  }

  const columns = useMemo<ColumnsType<CourseSummary>>(
    () => [
      {
        title: '课程代码',
        dataIndex: 'code',
        width: 130,
        render: (code: string) => <Typography.Link strong>{code}</Typography.Link>,
      },
      { title: '课程名称', dataIndex: 'title' },
      {
        title: '开课院系',
        dataIndex: 'offerDept',
        responsive: ['lg'],
        render: (value: string | null) => value || '—',
      },
      {
        title: '授课讲师',
        responsive: ['lg'],
        render: (_, course) =>
          course.instructors && course.instructors.length > 0
            ? course.instructors.join('、')
            : '—',
      },
      { title: '评价数', dataIndex: 'reviewedCount', width: 90 },
      {
        title: '好评率',
        width: 100,
        render: (_, course) => ratingText(course),
      },
      {
        title: '操作',
        width: 130,
        render: (_, course) => {
          const selectedId = subclassIdOf(course.code);
          const selected = selectedId !== null && hasSubclass(selectedId);
          return (
            <Button
              size="small"
              type={selected ? 'default' : 'primary'}
              loading={pendingCode === course.code}
              onClick={(event) => {
                event.stopPropagation();
                void handleQuickAdd(course);
              }}
            >
              {selected ? '更换班次' : '加入选课篮'}
            </Button>
          );
        },
      },
    ],
    [hasSubclass, subclassIdOf, pendingCode],
  );

  return (
    <div>
      <Typography.Title level={3}>课程列表</Typography.Title>
      <Typography.Paragraph type="secondary">
        支持模糊搜索：课程代码、名称、简介都能搜，拼写误差或部分匹配也能命中。可按院系、授课讲师筛选，点击课程进入详情查看成绩分布、六维评价与可选班次。
      </Typography.Paragraph>

      <Space wrap size="middle" className="list-toolbar">
        <Input.Search
          allowClear
          placeholder="搜索课程代码、名称或描述（支持模糊匹配）"
          style={{ width: 300 }}
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          onSearch={(value) => setKeyword(value.trim())}
        />
        <Select
          allowClear
          placeholder="全部院系"
          style={{ width: 240 }}
          value={department}
          onChange={setDepartment}
          options={departments.map((name) => ({ value: name, label: name }))}
        />
        <Select
          allowClear
          showSearch
          placeholder="全部讲师"
          style={{ width: 220 }}
          value={instructor}
          onChange={setInstructor}
          options={instructors.map((name) => ({ value: name, label: name }))}
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
        />
        <Select
          value={sort}
          style={{ width: 150 }}
          onChange={(value: CourseSort) => setSort(value)}
          options={SORT_OPTIONS}
        />
        {keyword && (
          <Tag color="blue">模糊匹配 “{keyword}” · {courses.length} 条</Tag>
        )}
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Table<CourseSummary>
        columns={columns}
        dataSource={courses}
        rowKey="code"
        loading={loading}
        pagination={false}
        onRow={(course) => ({
          onClick: () => navigate(`/course/${course.code}`),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}
