import type {
  CourseDetail,
  CourseSort,
  CourseSummary,
  ScheduleResult,
} from './types';

const API_BASE = '/api';

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, init);
  } catch {
    throw new Error('无法连接后端服务，请确认 docker compose 已启动。');
  }

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`;
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // 响应不是 JSON，沿用默认文案
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function fetchCourses(options: {
  keyword?: string;
  department?: string;
  sort?: CourseSort;
}): Promise<CourseSummary[]> {
  const query = buildQuery({
    q: options.keyword,
    dept: options.department,
    sort: options.sort,
  });
  const data = await request<{ courses: CourseSummary[] }>(`/courses${query}`);
  return data.courses ?? [];
}

export async function fetchDepartments(): Promise<string[]> {
  const data = await request<{ departments: string[] }>('/departments');
  return data.departments ?? [];
}

export async function fetchCourse(code: string): Promise<CourseDetail> {
  const data = await request<{ course: CourseDetail }>(
    `/courses/${encodeURIComponent(code)}`,
  );
  return data.course;
}

export async function fetchConflicts(subclassIds: number[]): Promise<ScheduleResult> {
  return request<ScheduleResult>('/conflicts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subclassIds }),
  });
}
