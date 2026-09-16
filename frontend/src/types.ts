// 与后端 model.go / schedule.go 的 JSON 字段一一对应，改动后端时这里要同步。

export interface CourseSummary {
  code: string;
  title: string;
  offerDept: string | null;
  reviewedCount: number;
  likedCount: number;
  dislikedCount: number;
}

export interface Slot {
  day: number;
  venue: string;
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
  is_tutorial: boolean;
}

export interface Subclass {
  id: number;
  semester: string | null;
  section: string | null;
  instructor: string | null;
  slots: Slot[];
  is_active: boolean;
}

export interface Review {
  id: number;
  year_taken: string | null;
  sem_taken: string | null;
  instructor: string | null;
  content: string;
  liked_count: number;
  disliked_count: number;
  user_id: number;
  course_code: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface GradeDistribution {
  a_plus: number;
  a: number;
  a_minus: number;
  b_plus: number;
  b: number;
  b_minus: number;
  c_plus: number;
  c: number;
  c_minus: number;
  d_plus: number;
  d: number;
  d_minus: number;
  pass: number;
  fail: number;
}

export interface VotePair {
  yes: number;
  no: number;
}

export interface FeatureVotes {
  tutorial: VotePair;
  essay: VotePair;
  final: VotePair;
  presentation: VotePair;
  project: VotePair;
  attendance: VotePair;
}

export interface CourseDetail {
  code: string;
  title: string;
  offer_dept: string | null;
  requirement: string | null;
  description: string | null;
  liked_count: number;
  disliked_count: number;
  reviewed_count: number;
  grade_distribution: GradeDistribution;
  feature_votes: FeatureVotes;
  subclasses: Subclass[];
  reviews: Review[];
}

export interface ScheduleRef {
  courseCode: string;
  title: string;
  subclassId: number;
  section: string | null;
  semester: string | null;
  slotIndex: number;
  day: number;
  venue: string;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  campus: string;
}

export interface Conflict {
  severity: string;
  left: ScheduleRef;
  right: ScheduleRef;
  day: number;
  overlapStart: string;
  overlapEnd: string;
  overlapMinutes: number;
  dateRange: string;
  dateRanges: string[];
}

export interface ScheduleWarning {
  severity: string;
  type: string;
  left: ScheduleRef;
  right: ScheduleRef;
  gapMinutes: number;
  message: string;
  dateRanges: string[];
}

export interface ScheduleResult {
  conflicts: Conflict[];
  warnings: ScheduleWarning[];
  semesters: string[];
}

export type CourseSort = 'code' | 'reviews' | 'rating';
