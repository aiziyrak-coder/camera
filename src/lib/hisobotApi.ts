import { buildQuery } from './apiClient';
import { isFixedPreset, resolvePreset, type FixedPreset } from './reportPeriods';
import { todayInTashkent } from './uzDate';

/** Hisobotlar sahifasi (`/api/hisobot/*`, camera-api/app/routers/hisobot.py).
 *  Xodimlar va talabalar — alohida: sonlar, filtrlar va mezonlar aralashmaydi. */

export type HisobotKind = 'talaba' | 'xodim';
export type HisobotSection = 'xodimlar' | 'talabalar';
export type HisobotTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface HisobotCriterion {
  key: string;
  label: string;
  description: string;
  indicator: string;
  tone: HisobotTone;
}

export interface HisobotTile {
  label: string;
  value: string | number;
  unit: string;
  hint: string | null;
  tone: HisobotTone;
}

export interface HisobotColumn {
  key: string;
  label: string;
  unit: string;
  /** Qaysi yo'nalish yaxshi: 'up' — katta yaxshi (davomat), 'down' — kichik yaxshi. */
  better: 'up' | 'down' | 'none';
}

export interface HisobotPerson {
  id: string;
  full_name: string;
  initials: string;
  photo_url: string | null;
  unit: string;
  values: Record<string, number | null>;
}

export interface HisobotBreakdownRow {
  id: string;
  name: string;
  value: number | null;
  detail: string | null;
  headcount: number | null;
}

export interface HisobotReport {
  kind: HisobotKind;
  period: { from: string; to: string; days: number };
  population: { total: number; enrolled: number };
  criteria: HisobotCriterion[];
  criterion: string;
  report: {
    tiles: HisobotTile[];
    trend: { unit: '%' | 'ta'; points: { date: string; value: number | null }[] };
    breakdown: { title: string; unit: string; better: 'up' | 'down'; rows: HisobotBreakdownRow[] } | null;
    columns: HisobotColumn[];
    people: HisobotPerson[];
    people_total: number;
    sort_key: string | null;
    worst_desc: boolean;
    note: string | null;
  };
}

export interface HisobotFilterOptions {
  faculties: { id: string; name: string; count: number }[];
  groups: { faculty_id: string; course: number | null; name: string; count: number }[];
  courses: number[];
  units: { id: string; name: string; kind: string; count: number }[];
  unit_kinds: { id: string; label: string }[];
}

/** URL'dagi holat — havola bilan ulashiladi, "orqaga" ishlaydi. */
export interface HisobotState {
  section: HisobotSection;
  preset: FixedPreset | 'custom';
  from: string;
  to: string;
  criterion: string;
  faculty: string;
  course: string;
  group: string;
  unitKind: string;
  unit: string;
  q: string;
}

export const SECTION_KIND: Record<HisobotSection, HisobotKind> = { xodimlar: 'xodim', talabalar: 'talaba' };
export const PERIOD_PRESETS: readonly FixedPreset[] = ['today', 'week', 'month'];

/** Bo'lim almashganda tozalanadigan (bo'limga xos) parametrlar. */
const SECTION_PARAMS = ['mezon', 'fakultet', 'kurs', 'guruh', 'turi', 'bolinma', 'q'] as const;

export function readState(params: URLSearchParams, today: string = todayInTashkent()): HisobotState {
  const section: HisobotSection = params.get('bolim') === 'talabalar' ? 'talabalar' : 'xodimlar';
  const rawPreset = params.get('davr');
  let preset: HisobotState['preset'] = isFixedPreset(rawPreset) ? rawPreset : 'today';
  let range = resolvePreset(isFixedPreset(rawPreset) ? rawPreset : 'today', today);
  if (rawPreset === 'custom') {
    const from = params.get('dan');
    const to = params.get('gacha');
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
      preset = 'custom';
      range = { from, to };
    }
  }
  return {
    section,
    preset,
    from: range.from,
    to: range.to,
    criterion: params.get('mezon') ?? '',
    faculty: section === 'talabalar' ? params.get('fakultet') ?? '' : '',
    course: section === 'talabalar' ? params.get('kurs') ?? '' : '',
    group: section === 'talabalar' ? params.get('guruh') ?? '' : '',
    unitKind: section === 'xodimlar' ? params.get('turi') ?? '' : '',
    unit: section === 'xodimlar' ? params.get('bolinma') ?? '' : '',
    q: params.get('q') ?? '',
  };
}

const PARAM_OF: Partial<Record<keyof HisobotState, string>> = {
  criterion: 'mezon',
  faculty: 'fakultet',
  course: 'kurs',
  group: 'guruh',
  unitKind: 'turi',
  unit: 'bolinma',
  q: 'q',
};

/** Holat o'zgarishini URL parametrlariga yozadi. Kaskad: yuqori filtr
 *  o'zgarsa, unga bog'liq pastkilari tozalanadi (fakultet -> kurs -> guruh,
 *  bo'linma turi -> bo'linma); bo'lim almashsa — bo'limga xos hammasi. */
export function writeState(current: URLSearchParams, patch: Partial<HisobotState>): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  if (patch.section !== undefined) {
    if (patch.section !== (current.get('bolim') === 'talabalar' ? 'talabalar' : 'xodimlar')) {
      SECTION_PARAMS.forEach((key) => next.delete(key));
    }
    set('bolim', patch.section === 'xodimlar' ? undefined : patch.section);
  }
  if (patch.preset !== undefined) {
    set('davr', patch.preset === 'today' ? undefined : patch.preset);
    if (patch.preset === 'custom') {
      set('dan', patch.from);
      set('gacha', patch.to);
    } else {
      next.delete('dan');
      next.delete('gacha');
    }
  }
  if (patch.faculty !== undefined) {
    next.delete('kurs');
    next.delete('guruh');
  }
  if (patch.course !== undefined) next.delete('guruh');
  if (patch.unitKind !== undefined) next.delete('bolinma');
  for (const [field, param] of Object.entries(PARAM_OF) as [keyof HisobotState, string][]) {
    if (patch[field] !== undefined) set(param, String(patch[field]));
  }
  return next;
}

// Faol filtrlarni sanash endi FilterBar'da (src/ui/Toolbar.tsx) — bitta
// joyda, barcha sahifalarda bir xil. Bu yerdagi nusxa `q`ni trim qilmay
// sanardi: bitta probel "Tozalash (1)" chiqarib, hech nimani filtrlamasdi.

function queryParams(state: HisobotState, criterion?: string) {
  return {
    kind: SECTION_KIND[state.section],
    from: state.from,
    to: state.to,
    criterion: criterion ?? (state.criterion || undefined),
    faculty: state.faculty || undefined,
    course: state.course || undefined,
    group: state.group || undefined,
    unit_kind: state.unitKind || undefined,
    unit: state.unit || undefined,
    q: state.q.trim() || undefined,
  };
}

export const hisobotPaths = {
  filters: (kind: HisobotKind) => `/api/hisobot/filters${buildQuery({ kind })}`,
  report: (state: HisobotState) => `/api/hisobot/report${buildQuery(queryParams(state))}`,
  export: (state: HisobotState, criterion: string) =>
    `/api/hisobot/export.xlsx${buildQuery(queryParams(state, criterion))}`,
};

/** Kurs va guruh variantlari — tanlangan fakultet (va kurs) doirasida. */
export function courseOptions(options: HisobotFilterOptions | null, faculty: string): number[] {
  if (!options) return [];
  const courses = new Set<number>();
  for (const g of options.groups) {
    if (g.course !== null && (!faculty || g.faculty_id === faculty)) courses.add(g.course);
  }
  return [...courses].sort((a, b) => a - b);
}

export function groupOptions(options: HisobotFilterOptions | null, faculty: string, course: string): string[] {
  if (!options) return [];
  const names = new Set<string>();
  for (const g of options.groups) {
    if (faculty && g.faculty_id !== faculty) continue;
    if (course && String(g.course) !== course) continue;
    names.add(g.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'uz'));
}

export function unitOptions(options: HisobotFilterOptions | null, unitKind: string) {
  if (!options) return [];
  return options.units.filter((u) => !unitKind || u.kind === unitKind);
}

/** Jadval qiymati: "87%", "3 kun", yoki "—". */
export function formatCell(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return '—';
  const text = Number.isInteger(value) ? String(value) : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (unit === '%') return `${text}%`;
  return unit ? `${text} ${unit}` : text;
}

/** Kesim qatorini bosish — bir pog'ona chuqurroq filtr (fakultet -> kurs
 *  -> guruh; xodimda — bo'linma). Pastroq pog'ona bo'lmasa null. */
export function drillPatch(state: HisobotState, rowId: string): Partial<HisobotState> | null {
  if (state.section === 'xodimlar') return state.unit ? null : { unit: rowId };
  if (!state.faculty) return { faculty: rowId };
  if (!state.course && !state.group) return rowId && rowId !== '0' ? { course: rowId } : null;
  if (!state.group) return rowId ? { group: rowId } : null;
  return null;
}
