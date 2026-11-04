import { buildQuery } from './apiClient';
import { SECTION_KIND, type HisobotState } from './hisobotApi';
import type { Tone } from '../ui';

/** Darslar bo'yicha davomat jadvali (`/api/hisobot/darslar`,
 *  camera-api/app/services/lesson_grid.py). Qatorlar — odamlar; ustunlar —
 *  bitta kunda juftliklar, bir necha kunda kunlar. */

export type LessonCellStatus = 'keldi' | 'kech_keldi' | 'kelmadi' | 'olchanmadi' | 'kutilmoqda';
export type LessonGridFilter = 'hammasi' | 'kelmadi' | 'kech_keldi' | 'toliq' | 'olchanmadi';
export type LessonGridSort = 'guruh' | 'ism' | 'kelmadi';

/** Bitta kun: juftlikdagi dars. */
export interface LessonSlotCell {
  status: LessonCellStatus;
  lesson_id: string;
  subject: string | null;
  room: string | null;
  start: string | null;
  end: string | null;
  first_seen: string | null;
  /** O'qituvchi jadvalida — guruh; talabada — nega o'lchanmagani. */
  detail: string | null;
  camera: boolean;
}

/** Bir necha kun: o'sha kungi darslar jami. */
export interface LessonDayCell {
  status: LessonCellStatus;
  lessons: number;
  attended: number;
  late: number;
  absent: number;
  unmeasured: number;
  pending: number;
}

export interface LessonGridTotals {
  lessons: number;
  attended: number;
  late: number;
  absent: number;
  unmeasured: number;
  pending: number;
  rate: number | null;
}

export interface LessonGridRow {
  id: string;
  full_name: string;
  unit: string;
  cells: Record<string, LessonSlotCell | LessonDayCell>;
  totals: LessonGridTotals;
}

export interface LessonGrid {
  kind: 'talaba' | 'xodim';
  date_from: string;
  date_to: string;
  mode: 'slots' | 'days';
  columns: { key: string; label: string; sub: string | null }[];
  counts: Record<LessonGridFilter, number>;
  status: LessonGridFilter;
  sort: LessonGridSort;
  total: number;
  page: number;
  page_size: number;
  totals: LessonGridTotals;
  without_lessons: number;
  rows: LessonGridRow[];
}

export const CELL_META: Record<LessonCellStatus, { label: string; mark: string; tone: Tone }> = {
  keldi: { label: 'Keldi', mark: '✓', tone: 'success' },
  kech_keldi: { label: 'Kech keldi', mark: 'K', tone: 'warning' },
  kelmadi: { label: 'Kelmadi', mark: '✗', tone: 'danger' },
  olchanmadi: { label: "O'lchanmadi", mark: '—', tone: 'neutral' },
  kutilmoqda: { label: 'Dars hali tugamagan', mark: '…', tone: 'info' },
};

export const FILTER_LABELS: Record<LessonGridFilter, string> = {
  hammasi: 'Hammasi',
  kelmadi: 'Kelmaganlar',
  kech_keldi: 'Kech kelganlar',
  toliq: "To'liq qatnashganlar",
  olchanmadi: "O'lchanmagan darsi bor",
};

export const SORT_LABELS: Record<LessonGridSort, string> = {
  guruh: "Guruh bo'yicha",
  ism: "Ism bo'yicha",
  kelmadi: "Ko'p qoldirganlar birinchi",
};

export function isDayCell(cell: LessonSlotCell | LessonDayCell): cell is LessonDayCell {
  return 'lessons' in cell;
}

export function lessonGridPath(
  state: HisobotState,
  options: { status: LessonGridFilter; sort: LessonGridSort; page: number; pageSize: number },
): string {
  return `/api/hisobot/darslar${buildQuery({
    kind: SECTION_KIND[state.section],
    from: state.from,
    to: state.to,
    faculty: state.faculty || undefined,
    course: state.course || undefined,
    group: state.group || undefined,
    unit_kind: state.unitKind || undefined,
    unit: state.unit || undefined,
    q: state.q.trim() || undefined,
    status: options.status === 'hammasi' ? undefined : options.status,
    sort: options.sort === 'guruh' ? undefined : options.sort,
    page: options.page > 1 ? options.page : undefined,
    page_size: options.pageSize,
  })}`;
}

/** Katak ustiga olib borilganda chiqadigan izoh. */
export function cellTitle(cell: LessonSlotCell | LessonDayCell, staff: boolean): string {
  if (isDayCell(cell)) {
    const parts = [`Darslar: ${cell.lessons}`, `qatnashdi: ${cell.attended}`];
    if (cell.late) parts.push(`kechikdi: ${cell.late}`);
    if (cell.absent) parts.push(`qoldirdi: ${cell.absent}`);
    if (cell.unmeasured) parts.push(`o'lchanmadi: ${cell.unmeasured}`);
    if (cell.pending) parts.push(`davom etmoqda: ${cell.pending}`);
    return parts.join(', ');
  }
  const lines = [
    [cell.start, cell.end].filter(Boolean).join('–'),
    cell.subject,
    staff && cell.detail ? `Guruh: ${cell.detail}` : null,
    cell.room ? `Xona: ${cell.room}` : null,
    `Holat: ${CELL_META[cell.status].label}`,
    cell.first_seen ? `Kamerada: ${cell.first_seen}` : null,
    !staff && cell.detail ? cell.detail : null,
  ];
  return lines.filter(Boolean).join('\n');
}
