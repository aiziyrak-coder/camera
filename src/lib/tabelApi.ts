import { buildQuery } from './apiClient';
import { config } from './config';
import { SECTION_KIND, type HisobotState } from './hisobotApi';
import { UZ_WEEKDAYS, UZ_WEEKDAYS_SHORT, weekdayIndex } from './uzDate';

/**
 * Oylik tabel (`GET /api/hisobot/tabel`, camera-api/app/routers/hisobot.py).
 *
 * Buyurtmachi so'ragan hujjat: qatorlar — odamlar, ustunlar — oyning
 * kunlari, har katakda bitta belgi, o'ngda jami. Qog'ozga bosiladi va
 * imzolanadi, shuning uchun belgilar rangsiz ham o'qilishi shart:
 * asosiy signal — HARF, rang esa faqat yordam beradi.
 */

export type TabelMark = '+' | 'K' | '–' | 'D' | '·';

export interface TabelDay {
  day: number;
  /** Server bergan hafta kuni. Matn ("Dushanba", "Du") yoki 0–6 raqami
   *  bo'lishi mumkin — ikkalasi ham tushuniladi (weekdayName). */
  weekday: string | number;
  isWorkDay: boolean;
  isFuture: boolean;
}

export interface TabelCell {
  day: number;
  mark: string;
  /** Katak ustiga olib borilganda chiqadigan izoh: "08:12 da keldi". */
  title: string;
}

export interface TabelPersonTotals {
  present: number;
  late: number;
  absent: number;
  unknown: number;
  workDays: number;
}

export interface TabelPerson {
  id: string;
  fullName: string;
  /** Talabada — guruh, xodimda — bo'linma. */
  group: string;
  /** Yuzi ro'yxatga olinganmi: yo'q bo'lsa butun qatori "·" bo'ladi. */
  enrolled: boolean;
  cells: TabelCell[];
  totals: TabelPersonTotals;
}

export interface TabelTotals {
  people: number;
  present: number;
  late: number;
  absent: number;
  unknown: number;
  notEnrolled: number;
}

export interface TabelLegendItem {
  mark: string;
  label: string;
}

export interface TabelReport {
  title: string;
  /** Tanlovning odamcha nomi: "Davolash ishi, 2-kurs, DI-2301 guruhi". */
  scope: string;
  /** "YYYY-MM". */
  month: string;
  /** "Sentabr 2026" — serverdan tayyor holda. */
  monthLabel: string;
  days: TabelDay[];
  people: TabelPerson[];
  totals: TabelTotals;
  legend: TabelLegendItem[];
  note: string | null;
}

/** Belgilar lug'ati: harf → nomi va ohangi. Rang faqat qo'shimcha —
 *  qog'ozda harfning o'zi yetarli bo'lishi kerak. */
export const TABEL_MARKS: Record<TabelMark, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  '+': { label: 'Keldi', tone: 'success' },
  K: { label: 'Kech keldi', tone: 'warning' },
  '–': { label: 'Kelmadi', tone: 'danger' },
  D: { label: 'Dam olish', tone: 'neutral' },
  '·': { label: "Ma'lumot yo'q", tone: 'neutral' },
};

/** Server qaysi tire/nuqtani yuborishiga bog'lanib qolmaslik uchun:
 *  oddiy defis ham "kelmadi", oddiy nuqta ham "ma'lumot yo'q". */
const MARK_ALIAS: Record<string, TabelMark> = {
  '-': '–',
  '—': '–',
  '.': '·',
  k: 'K',
  d: 'D',
};

export function normalizeMark(mark: string): TabelMark {
  const trimmed = (mark ?? '').trim();
  if (trimmed in TABEL_MARKS) return trimmed as TabelMark;
  return MARK_ALIAS[trimmed] ?? '·';
}

export const TABEL_MARK_CLASS: Record<TabelMark, string> = {
  '+': 'text-success',
  K: 'text-warning',
  '–': 'text-danger',
  D: 'text-muted',
  '·': 'text-subtle',
};

/** Faqat rangga ishonmaslik uchun: har belgining o'z fon shakli bor.
 *  Qog'ozda fonlar o'chadi (chop etish uslublari), harf qoladi. */
export const TABEL_MARK_CELL: Record<TabelMark, string> = {
  '+': 'bg-success-soft',
  K: 'bg-warning-soft',
  '–': 'bg-danger-soft',
  D: 'bg-surface-2',
  '·': '',
};

/** Ustun tepasidagi bitta harf: Du → "D", Seshanba → "S"... bir xil harf
 *  takrorlanmasin deb qisqartmaning o'zi (Du/Se/Ch/Pa/Ju/Sh/Ya) ishlatiladi. */
export function weekdayLetter(month: string, day: number): string {
  return UZ_WEEKDAYS_SHORT[weekdayIndex(month, day)] ?? '';
}

/** Serverdagi `weekday` (matn yoki 0–6) → to'liq nom, katak izohi uchun. */
export function weekdayName(weekday: string | number, month: string, day: number): string {
  if (typeof weekday === 'number' && weekday >= 0 && weekday <= 6) return UZ_WEEKDAYS[weekday] ?? '';
  const text = String(weekday ?? '').trim();
  if (/^[0-6]$/.test(text)) return UZ_WEEKDAYS[Number(text)] ?? '';
  return text || UZ_WEEKDAYS[weekdayIndex(month, day)] || '';
}

/** Tabel so'rovi: bo'lim + oy + mavjud qamrov filtrlari (analitik
 *  ko'rinish bilan bir xil kalitlar — tanlov almashganda yo'qolmaydi). */
function tabelQuery(state: HisobotState) {
  return {
    kind: SECTION_KIND[state.section],
    oy: state.month,
    faculty: state.faculty || undefined,
    course: state.course || undefined,
    group: state.group || undefined,
    unit_kind: state.unitKind || undefined,
    unit: state.unit || undefined,
    q: state.q.trim() || undefined,
  };
}

export const tabelPaths = {
  data: (state: HisobotState) => `/api/hisobot/tabel${buildQuery(tabelQuery(state))}`,
  /** Excel — oddiy havola: faylni server tayyorlaydi. */
  excel: (state: HisobotState) => `/api/hisobot/tabel.xlsx${buildQuery(tabelQuery(state))}`,
};

/** Havola uchun to'liq manzil (backend boshqa domenda bo'lishi mumkin). */
export function tabelExcelHref(state: HisobotState): string {
  return `${config.apiBaseUrl}${tabelPaths.excel(state)}`;
}

export function tabelExcelFilename(state: HisobotState): string {
  return `tabel-${state.section}-${state.month}.xlsx`;
}
