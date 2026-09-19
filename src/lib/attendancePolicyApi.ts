import { api } from './apiClient';

/** Kelib-ketish qoidalari (camera-api/app/routers/attendance_policy.py). */
export interface AttendancePolicy {
  staffStart: string;
  studentStart: string;
  graceMinutes: number;
  workEnd: string;
  /** ISO hafta kunlari: 1 — dushanba ... 7 — yakshanba. */
  workDays: number[];
  trackLastSeen: boolean;
  staffLateAfter: string;
  studentLateAfter: string;
  recomputed?: number;
}

export type AttendancePolicyInput = Omit<AttendancePolicy, 'staffLateAfter' | 'studentLateAfter' | 'recomputed'>;

export function getAttendancePolicy(token: string | null) {
  return api.get<AttendancePolicy>('/api/attendance-policy', token);
}

export function saveAttendancePolicy(token: string | null, body: AttendancePolicyInput) {
  return api.put<AttendancePolicy>('/api/attendance-policy', body, token);
}

/** "08:00" + 10 -> "08:10". */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
