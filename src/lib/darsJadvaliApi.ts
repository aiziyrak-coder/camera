import { api, buildQuery, type CallOptions } from './apiClient';

/** Dars jadvali — haftalik namuna va uni semestrga yoyib yuklash
 *  (camera-api/app/routers/lesson_sessions.py). */

export interface ImportPreviewRow {
  row: number;
  date: string;
  start: string | null;
  group: string;
  subject: string;
  teacher: string | null;
  teacherMatched: boolean;
  room: string | null;
  camera: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  preview: boolean;
  withCamera: number;
  withTeacher: number;
  weeks: number;
  rows: ImportPreviewRow[];
  errors: { row: number; message: string }[];
  /** Kameraga bog'lanmagan xona raqamlari — kamera sozlamasida
   *  xona raqami yozilmagan yoki boshqacha yozilgan. */
  unmatchedRooms: string[];
  unmatchedTeachers: string[];
}

/** Namuna fayl manzili — oddiy havola (o'ng tugma bilan ham saqlanadi). */
export const TEMPLATE_PATH = '/api/lesson-sessions/namuna.xlsx';

export function uploadWeekly(
  file: File,
  range: { from: string; to: string },
  apply: boolean,
  token: string | null,
  opts: CallOptions = {},
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const query = buildQuery({ dan: range.from, gacha: range.to, apply: String(apply) });
  return api.postForm<ImportResult>(`/api/lesson-sessions/import-haftalik${query}`, form, token, opts);
}

/** Semestr oralig'ining oqilona boshlanishi: joriy oyning 1-kuni. */
export function defaultRange(today: string): { from: string; to: string } {
  const from = `${today.slice(0, 7)}-01`;
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 4);
  return { from, to: end.toISOString().slice(0, 10) };
}

/** Yuklashdan oldin: nima yozilishini bir gapda aytadi. */
export function previewSummary(result: ImportResult): string {
  const parts = [`${result.imported.toLocaleString('ru-RU')} dars`];
  if (result.weeks > 0) parts.push(`${result.weeks} hafta`);
  if (result.skipped > 0) parts.push(`${result.skipped} takror`);
  return parts.join(' · ');
}
