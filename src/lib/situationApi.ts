/**
 * Situatsion markaz API'si (`/api/situation/*`) uchun tiplangan mijoz.
 *
 * Shartnoma: camera-api/docs/SITUATION_API.md — interfeyslar u yerdagi
 * TS ta'riflar bilan bir xil (camelCase). Barcha funksiyalar ixtiyoriy
 * `AbortSignal` qabul qiladi (filtr/sana o'zgarganda eski so'rovni bekor
 * qilish uchun). Token apiClient orqali avtomatik qo'shiladi.
 */
import { api, buildQuery, type CallOptions } from './apiClient';

// ───────────────────────────────────────────── Umumiy tiplar

/** Odamning bir kundagi holati. */
export type AttendanceStatus = 'keldi' | 'kech_keldi' | 'kelmadi' | 'dam_olish' | 'kutilmoqda' | 'malumot_yoq';

export type BiometricsStatus = 'tasdiqlangan' | 'kutilmoqda' | 'yoq';

/** Bir to'plam odamning kunlik davomati. `total = present + absent + dayOff + notYet + noData`. */
export interface Counts {
  total: number;
  enrolled: number;
  present: number;
  /** present ichidan kech kelganlar */
  late: number;
  absent: number;
  dayOff: number;
  notYet: number;
  noData: number;
  /** present / (present + absent + notYet) * 100; asos 0 → null */
  rate: number | null;
}

export type LessonState = 'upcoming' | 'ongoing' | 'finished';

export type TeacherStatus = 'oz_vaqtida' | 'kechikdi' | 'kelmadi' | 'kutilmoqda' | 'nomalum';

export interface Lesson {
  id: string;
  date: string;
  subject: string;
  groupName: string;
  faculty: string;
  teacher: string;
  teacherId: string | null;
  teacherPhotoUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  building: string | null;
  state: LessonState;
  teacherStatus: TeacherStatus;
  teacherArrivedAt: string | null;
  teacherOnTime: boolean | null;
  expected: number;
  present: number;
  late: number;
  /** yakunlanmagan darsda null */
  absent: number | null;
  seen: number;
  finalized: boolean;
  attentionScore: number | null;
  activityScore: number | null;
  sleepIncidents: number;
}

// ───────────────────────────────────────────── 1. Overview

export interface FacultyCounts extends Counts {
  /** "Fakultetsiz" uchun null */
  id: string | null;
  name: string;
}

export interface LastArrival {
  id: string;
  fullName: string;
  photoUrl: string | null;
  initials: string;
  type: 'talaba' | 'xodim';
  unit: string;
  faculty: string | null;
  time: string;
  status: string;
}

export interface Overview {
  date: string;
  isToday: boolean;
  generatedAt: string;
  students: Counts;
  staff: Counts;
  teachers: { scheduled: number; onTime: number; late: number; absent: number; unknown: number };
  lessons: { total: number; finished: number; ongoing: number; upcoming: number; avgAttention: number | null };
  cameras: { total: number; active: number; online: number; videoFlowing: number };
  events: { open: number; today: number; highOpen: number; overdue: number };
  byFaculty: FacultyCounts[];
  arrivalsByHour: Array<{ hour: number; students: number; staff: number }>;
  lastArrivals: LastArrival[];
}

// ───────────────────────────────────────────── 2–4. Fakultet / guruh

export interface GroupStat extends Counts {
  name: string;
  facultyId: string | null;
  faculty: string | null;
  course: number | null;
  curator: null;
}

export interface CourseBlock {
  course: number | null;
  label: string;
  groups: GroupStat[];
  totals: Counts;
}

export interface FacultyDetail {
  id: string;
  name: string;
  date: string;
  isToday: boolean;
  totals: Counts;
  courses: CourseBlock[];
}

export interface GroupStudent {
  id: string;
  fullName: string;
  photoUrl: string | null;
  initials: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  biometricsStatus: BiometricsStatus;
}

export interface TrendPoint {
  date: string;
  rate: number | null;
  present: number;
  late: number;
  absent: number;
}

export interface GroupDetail {
  date: string;
  isToday: boolean;
  group: { name: string; facultyId: string | null; faculty: string | null; course: number | null; totals: Counts };
  students: GroupStudent[];
  lessons: Lesson[];
  trend: TrendPoint[];
}

// ───────────────────────────────────────────── 5–6. Kafedralar

export interface KafedraStat {
  id: string;
  name: string;
  building: string | null;
  unassigned: boolean;
  staffTotal: number;
  enrolled: number;
  present: number;
  late: number;
  absent: number;
  dayOff: number;
  notYet: number;
  noData: number;
  rate: number | null;
  lessonsToday: number;
  teacherLateLessons: number;
  teacherMissedLessons: number;
}

export interface KafedraTeacher {
  id: string;
  fullName: string;
  photoUrl: string | null;
  initials: string;
  position: string;
  biometricsStatus: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  lessonsScheduled: number;
  lessonsOnTime: number;
  lessonsLate: number;
  lessonsMissed: number;
  periodLessons: number;
  periodOnTime: number;
  periodLate: number;
  periodMissed: number;
  onTimeRate: number | null;
  avgActivityScore: number | null;
  periodPresentDays: number;
  periodLateDays: number;
  periodAbsentDays: number;
}

export interface KafedraDetail {
  id: string;
  name: string;
  building: string | null;
  unassigned: boolean;
  date: string;
  isToday: boolean;
  today: Counts;
  teachers: KafedraTeacher[];
  period: {
    dateFrom: string;
    dateTo: string;
    lessons: number;
    onTime: number;
    late: number;
    missed: number;
    unknown: number;
    onTimeRate: number | null;
    avgActivityScore: number | null;
    presentDays: number;
    lateDays: number;
    absentDays: number;
  };
}

// ───────────────────────────────────────────── 7. Darslar

export interface LessonPage {
  items: Lesson[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  date: string;
  counts: { upcoming: number; ongoing: number; finished: number };
}

export interface LessonQuery {
  date?: string;
  facultyId?: string;
  group?: string;
  teacherId?: string;
  departmentId?: string;
  status?: LessonState;
  page?: number;
  pageSize?: number;
}

// ───────────────────────────────────────────── 8. Shaxs profili

export type LessonAttendanceStatus = 'keldi' | 'kech_keldi' | 'kelmadi';

export interface PersonLesson extends Lesson {
  attendanceStatus: LessonAttendanceStatus | null;
  firstSeen: string | null;
}

export interface CalendarDay {
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
}

export interface PersonVisit {
  id: string;
  date: string;
  camera: string;
  building: string | null;
  zone: string | null;
  firstSeen: string;
  lastSeen: string;
  durationMinutes: number;
  sightings: number;
}

export interface PersonInfo {
  id: string;
  fullName: string;
  type: 'talaba' | 'xodim';
  photoUrl: string | null;
  initials: string;
  facultyId: string | null;
  faculty: string | null;
  unit: string;
  group: string | null;
  course: number | null;
  departmentId: string | null;
  department: string | null;
  biometricsStatus: string;
  parentNotify: boolean;
  active: boolean;
}

export interface PersonProfile {
  person: PersonInfo;
  dateFrom: string;
  dateTo: string;
  calendar: CalendarDay[];
  totals: {
    days: number;
    present: number;
    late: number;
    absent: number;
    dayOff: number;
    noData: number;
    rate: number | null;
    avgArrival: string | null;
  };
  lessons: PersonLesson[];
  recentVisits: PersonVisit[];
}

// ───────────────────────────────────────────── Dars davomati (lesson-sessions)

export interface LessonAttendanceRow {
  studentId: string;
  fullName: string;
  /** null — dars hali yakunlanmagan */
  status: LessonAttendanceStatus | null;
  firstSeenAt: string | null;
  sightings: number;
}

export interface LessonAttendance {
  lessonSessionId: string;
  group: string;
  subject: string;
  scheduledStartTime: string | null;
  finalized: boolean;
  present: number;
  late: number;
  absent: number;
  rows: LessonAttendanceRow[];
}

// ───────────────────────────────────────────── Funksiyalar

const BASE = '/api/situation';

export function getOverview(date?: string, opts?: CallOptions): Promise<Overview> {
  return api.get<Overview>(`${BASE}/overview${buildQuery({ date })}`, undefined, opts);
}

export function getFaculty(facultyId: string, date?: string, opts?: CallOptions): Promise<FacultyDetail> {
  return api.get<FacultyDetail>(`${BASE}/faculties/${encodeURIComponent(facultyId)}${buildQuery({ date })}`, undefined, opts);
}

export function getGroups(
  params: { date?: string; facultyId?: string; course?: number; search?: string } = {},
  opts?: CallOptions,
): Promise<GroupStat[]> {
  return api.get<GroupStat[]>(`${BASE}/groups${buildQuery(params)}`, undefined, opts);
}

export function getGroup(groupName: string, date?: string, opts?: CallOptions): Promise<GroupDetail> {
  return api.get<GroupDetail>(`${BASE}/groups/${encodeURIComponent(groupName)}${buildQuery({ date })}`, undefined, opts);
}

export function getKafedras(date?: string, opts?: CallOptions): Promise<KafedraStat[]> {
  return api.get<KafedraStat[]>(`${BASE}/kafedras${buildQuery({ date })}`, undefined, opts);
}

export function getKafedra(
  departmentId: string,
  params: { date?: string; from?: string; to?: string } = {},
  opts?: CallOptions,
): Promise<KafedraDetail> {
  return api.get<KafedraDetail>(`${BASE}/kafedras/${encodeURIComponent(departmentId)}${buildQuery(params)}`, undefined, opts);
}

export function getLessons(params: LessonQuery = {}, opts?: CallOptions): Promise<LessonPage> {
  return api.get<LessonPage>(`${BASE}/lessons${buildQuery({ ...params })}`, undefined, opts);
}

export function getPerson(
  personId: string,
  params: { from?: string; to?: string } = {},
  opts?: CallOptions,
): Promise<PersonProfile> {
  return api.get<PersonProfile>(`${BASE}/people/${encodeURIComponent(personId)}${buildQuery(params)}`, undefined, opts);
}

export function getLessonAttendance(lessonId: string, opts?: CallOptions): Promise<LessonAttendance> {
  return api.get<LessonAttendance>(`/api/lesson-sessions/${encodeURIComponent(lessonId)}/attendance`, undefined, opts);
}

// ───────────────────────────────────────────── Yorliqlar

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  keldi: 'Keldi',
  kech_keldi: 'Kech qoldi',
  kelmadi: 'Kelmadi',
  dam_olish: 'Dam olish',
  kutilmoqda: 'Hali kelmagan',
  malumot_yoq: "Ma'lumot yo'q",
};

export const TEACHER_STATUS_LABELS: Record<TeacherStatus, string> = {
  oz_vaqtida: "O'z vaqtida",
  kechikdi: 'Kechikdi',
  kelmadi: 'Kelmadi',
  kutilmoqda: 'Kutilmoqda',
  nomalum: "Noma'lum",
};

export const LESSON_STATE_LABELS: Record<LessonState, string> = {
  upcoming: 'Boshlanmagan',
  ongoing: 'Davom etmoqda',
  finished: 'Tugagan',
};

/** Frontend marshrutlari (davomat sahifalari orasida havola uchun). */
export const situationPaths = {
  faculties: '/talabalar',
  faculty: (id: string | null) => `/talabalar/fakultet/${id ? encodeURIComponent(id) : NO_FACULTY_ID}`,
  group: (name: string) => `/talabalar/guruh/${encodeURIComponent(name)}`,
  person: (id: string) => `/shaxs/${encodeURIComponent(id)}`,
  kafedra: (id: string) => `/oqituvchilar/kafedra/${encodeURIComponent(id)}`,
};

/** "Fakultetsiz" (id null) talabalar uchun URL segmenti. */
export const NO_FACULTY_ID = 'fakultetsiz';
