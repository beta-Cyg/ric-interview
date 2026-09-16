import { FilterOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Input, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

interface CourseSummary {
  code: string;
  title: string;
  offerDept: string | null;
  reviewedCount: number;
  likedCount: number;
  dislikedCount: number;
}

interface CoursesResponse {
  courses: CourseSummary[];
}

const columns: ColumnsType<CourseSummary> = [
  {
    title: '课程代码',
    dataIndex: 'code',
    width: 130,
  },
  {
    title: '课程名称',
    dataIndex: 'title',
  },
  {
    title: '开课院系',
    dataIndex: 'offerDept',
    render: (value: string | null) => value || '—',
  },
  {
    title: '评价数',
    dataIndex: 'reviewedCount',
    width: 90,
  },
  {
    title: '点赞数',
    dataIndex: 'likedCount',
    width: 90,
  },
  {
    title: '点踩数',
    dataIndex: 'dislikedCount',
    width: 90,
  },
];

const instruction = `这是 Starter 项目提供的临时说明区域，不代表最终产品设计。

当前数据库提供以下课程数据：
- 课程代码
- 课程名称
- 开课院系
- 课程简介
- 前置要求
- 点赞数
- 点踩数
- 评价数
- 成绩分布
- Tutorial 投票统计
- Essay 投票统计
- Final 投票统计
- Presentation 投票统计
- Project 投票统计
- Attendance 投票统计

数据库还提供课程班次数据，包括：
- Semester
- Section
- Instructor
- 上课日期
- 上课时间
- 上课地点

每门课程还包含对应的评价数据，包括：
- 修读年份
- Semester
- Instructor
- 评价内容
- 点赞数
- 匿名用户 ID

你可以通过后端 API 获取一门课程的完整数据。例如：

GET /api/courses/COMP3314

{
  "course": {
    "code": "COMP3314",
    "title": "Introduction to machine learning",
    "offer_dept": "School of Computing and Data S",
    "requirement": "Pass in MATH1853 or MATH2014 or MATH1013; and COMP2119 or COMP2118 or COMP2502 or ELEC2543 or FITE2000",
    "description": "",
    "liked_count": 4,
    "disliked_count": 6,
    "reviewed_count": 43,
    "grade_distribution": {
      "a_plus": 23,
      "a": 25,
      "a_minus": 12,
      "b_plus": 21,
      "b": 5,
      "b_minus": 3,
      "c_plus": 4,
      "c": 4,
      "c_minus": 0,
      "d_plus": 0,
      "d": 0,
      "d_minus": 0,
      "pass": 2,
      "fail": 1
    },
    "feature_votes": {
      "tutorial": { "yes": 0, "no": 3 },
      "essay": { "yes": 0, "no": 3 },
      "final": { "yes": 3, "no": 0 },
      "presentation": { "yes": 0, "no": 3 },
      "project": { "yes": 3, "no": 0 },
      "attendance": { "yes": 1, "no": 2 }
    },
    "subclasses": [
      {
        "id": 52718,
        "semester": "2026-27 Sem 1",
        "section": "1A",
        "instructor": "Xu,Dong",
        "slots": [
          {
            "day": 1,
            "venue": "MB167",
            "start_time": "15:00",
            "end_time": "17:50",
            "start_date": "2026/09/07",
            "end_date": "2026/10/05",
            "is_tutorial": false
          }
        ],
        "is_active": true
      }
    ],
    "reviews": [
      {
        "id": 2964,
        "year_taken": "2020-2021",
        "sem_taken": "Sem1",
        "instructor": null,
        "content": "gooood",
        "liked_count": 1,
        "disliked_count": 0,
        "user_id": 314,
        "course_code": "COMP3314",
        "created_at": "2021-08-06 00:49:24+08",
        "updated_at": "2021-08-06 00:49:24+08"
      }
    ]
  }
}

当前 API 和页面仅作为项目起点。你可以根据自己选择的功能修改或重新设计 API，也可以删除或完全覆盖这个抽屉、课程列表以及其他所有前端设计。我们不会根据你是否保留 Starter 的原有页面进行评分。`;

function App() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<CourseSummary | null>(null);
  const showNotImplemented = () => window.alert('暂未实现的功能');

  useEffect(() => {
    const controller = new AbortController();

    async function loadCourses() {
      try {
        const response = await fetch('/api/courses', { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as CoursesResponse;
        setCourses(data.courses);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError('课程数据加载失败，请确认本地后端已经启动。');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCourses();
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <div className="page-header">
        <Typography.Title level={2}>RIC 选课平台 Starter</Typography.Title>
        <Button
          aria-label="登录"
          shape="circle"
          icon={<UserOutlined />}
          onClick={showNotImplemented}
        />
      </div>
      <Typography.Paragraph type="secondary">
        这是一个刻意保持精简的基础项目。请在此基础上改进设计并实现新功能。
      </Typography.Paragraph>

      <div className="course-toolbar">
        <Input.Search
          placeholder="搜索课程"
          className="course-search"
          onSearch={showNotImplemented}
        />
        <Button icon={<FilterOutlined />} onClick={showNotImplemented}>
          筛选
        </Button>
      </div>

      {loading && <Typography.Text>正在加载课程……</Typography.Text>}
      {!loading && error && <Alert type="error" message={error} />}
      {!loading && !error && (
        <Table<CourseSummary>
          columns={columns}
          dataSource={courses}
          rowKey="code"
          pagination={false}
          onRow={(course) => ({
            onClick: () => setSelectedCourse(course),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Drawer
        title={selectedCourse ? `${selectedCourse.code} ${selectedCourse.title}` : '课程说明'}
        width={640}
        placement="bottom"
        height="90vh"
        open={selectedCourse !== null}
        onClose={() => setSelectedCourse(null)}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            lineHeight: 1.7,
          }}
        >
          {instruction}
        </pre>
      </Drawer>
    </main>
  );
}

export default App;
