import type { LiveAttendanceMessage } from '../../lib/realtime';
import type { Counts, FacultyCounts, GroupStat, KafedraStat, LastArrival, Lesson, Overview } from '../../lib/situationApi';
import type { ProgressSegment } from '../../ui';
import { RATE_RAG, rag, type Rag, type RagThresholds } from '../../ui/rag';

export type ArrivalItem = LastArrival;

/** Realtime davomat xabari → "So'nggi kelganlar" elementi (suratsiz —
 *  keyingi yangilanishda serverdagi to'liq yozuv bilan almashadi). */
export function arrivalFromMessage(message: LiveAttendanceMessage): ArrivalItem {
  const name = message.fullName?.trim() || "Noma'lum shaxs";
  return {
    id: message.personId,
    fullName: name,
    photoUrl: null,
    initials: '',
    type: message.personType ?? 'talaba',
    unit: message.group ?? '',
    faculty: null,
    time: message.checkIn ?? '',
    status: message.status,
  };
}

/** Jonli (realtime) va serverdagi kelishlarni birlashtiradi: bir odam bir
 *  marta, jonlilar (yangiroq) birinchi, server yozuvi bo'lsa — o'sha (suratli). */
export function mergeArrivals(live: readonly ArrivalItem[], server: readonly ArrivalItem[], limit = 10): ArrivalItem[] {
  const serverIds = new Set(server.map((item) => item.id));
  const seen = new Set<string>();
  const out: ArrivalItem[] = [];
  for (const item of [...live.filter((l) => !serverIds.has(l.id)), ...server]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** O'qituvchilarning darsga o'z vaqtida kelish ulushi (tekshirilganlar orasida). */
export function teacherOnTimeRate(teachers: Overview['teachers']): number | null {
  const checked = teachers.onTime + teachers.late + teachers.absent;
  if (checked <= 0) return null;
  return Math.round((teachers.onTime / checked) * 1000) / 10;
}

/** Davomati eng past guruhlar: foizi `below`dan past va kuni "aniqlashgan"
 *  (hali kelmaganlar kelgan+kelmaganlardan ko'p bo'lmagan) guruhlar —
 *  ertalab hamma hali yo'lda bo'lganda guruhlar noto'g'ri belgilanmasin. */
export function lowestGroups(groups: readonly GroupStat[], limit = 3, below = 85): GroupStat[] {
  return groups
    .filter((g) => g.total > 0 && g.rate !== null && g.rate < below && g.notYet <= g.present + g.absent)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || b.absent - a.absent || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Kechikkan / kelmagan o'qituvchili darslar: avval kelmaganlar, keyin eng so'nggisi. */
export function teacherIssues(lessons: readonly Lesson[], limit = 4): Lesson[] {
  const rank = (lesson: Lesson) => (lesson.teacherStatus === 'kelmadi' ? 0 : 1);
  return lessons
    .filter((l) => l.teacherStatus === 'kechikdi' || l.teacherStatus === 'kelmadi')
    .sort((a, b) => rank(a) - rank(b) || (b.startsAt ?? '').localeCompare(a.startsAt ?? ''))
    .slice(0, limit);
}

export interface LessonSlot {
  start: string;
  end: string | null;
  total: number;
  finished: number;
  ongoing: number;
  upcoming: number;
  /** O'qituvchi holatlari (shu juftlikdagi darslar bo'yicha). */
  onTime: number;
  late: number;
  missed: number;
  state: 'finished' | 'ongoing' | 'upcoming';
}

/** Darslarni boshlanish vaqti bo'yicha juftliklarga yig'adi ("08:30", "10:10"...). */
export function lessonSlots(lessons: readonly Lesson[]): LessonSlot[] {
  const map = new Map<string, LessonSlot>();
  for (const lesson of lessons) {
    const key = lesson.startsAt ?? '—';
    let slot = map.get(key);
    if (!slot) {
      slot = { start: key, end: lesson.endsAt, total: 0, finished: 0, ongoing: 0, upcoming: 0, onTime: 0, late: 0, missed: 0, state: 'upcoming' };
      map.set(key, slot);
    }
    slot.total += 1;
    slot[lesson.state] += 1;
    if (lesson.endsAt && (!slot.end || lesson.endsAt > slot.end)) slot.end = lesson.endsAt;
    if (lesson.teacherStatus === 'oz_vaqtida') slot.onTime += 1;
    else if (lesson.teacherStatus === 'kechikdi') slot.late += 1;
    else if (lesson.teacherStatus === 'kelmadi') slot.missed += 1;
  }
  const slots = [...map.values()].sort((a, b) => (a.start === '—' ? 1 : b.start === '—' ? -1 : a.start.localeCompare(b.start)));
  for (const slot of slots) {
    slot.state = slot.ongoing > 0 ? 'ongoing' : slot.upcoming > 0 ? 'upcoming' : 'finished';
  }
  return slots;
}

/** Keyingi (hali boshlanmagan) darslar, vaqt bo'yicha. */
export function nextLessons(lessons: readonly Lesson[], limit = 4): Lesson[] {
  return lessons
    .filter((l) => l.state === 'upcoming')
    .sort((a, b) => (a.startsAt ?? '99').localeCompare(b.startsAt ?? '99') || a.groupName.localeCompare(b.groupName))
    .slice(0, limit);
}

/** "2026-09-19T14:28:57+05:00" → 14 (server Toshkent vaqtida beradi). */
export function hourOf(isoWithOffset: string | null | undefined): number | null {
  const match = isoWithOffset?.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) : null;
}

/** "…T14:28:57+05:00" → "14:28". */
export function clockOf(isoWithOffset: string | null | undefined): string | null {
  const match = isoWithOffset?.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** Eng gavjum soat (talaba + xodim). Hech kim kelmagan bo'lsa null. */
export function peakHour(rows: Overview['arrivalsByHour']): { hour: number; total: number } | null {
  let best: { hour: number; total: number } | null = null;
  for (const row of rows) {
    const total = row.students + row.staff;
    if (total > 0 && (!best || total > best.total)) best = { hour: row.hour, total };
  }
  return best;
}

/** Holatlar chizig'i: o'z vaqtida / kech / kelmadi / hali kelmagan. */
export function attendanceSegments(counts: Counts): ProgressSegment[] {
  return [
    { value: Math.max(0, counts.present - counts.late), tone: 'success', label: "O'z vaqtida" },
    { value: counts.late, tone: 'warning', label: 'Kech keldi' },
    { value: counts.absent, tone: 'danger', label: 'Kelmadi' },
    { value: counts.notYet, tone: 'neutral', label: 'Hali kelmagan' },
  ];
}

/** Ulush foizda (1 xona), asos 0 → null. */
export function share(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** "HH:MM" → daqiqa (00:00 dan). */
export function minutesOf(clock: string | null | undefined): number | null {
  const match = clock?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "08:12", "2026-09-19T08:12:00+05:00" → "08:12". */
export function clockLabel(value: string | null | undefined): string {
  if (!value) return '';
  const iso = value.match(/T(\d{2}:\d{2})/);
  if (iso) return iso[1];
  const plain = value.match(/^(\d{1,2}:\d{2})/);
  return plain ? plain[1].padStart(5, '0') : value;
}

// ───────────────────────────────────────────── Xodimlar taqqoslashi, bo'linmalar reytingi

const WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
const WEEKDAY_DATIVE = ['yakshanbaga', 'dushanbaga', 'seshanbaga', 'chorshanbaga', 'payshanbaga', 'jumaga', 'shanbaga'];

/** "2026-09-18" → "jumaga" (taqqoslash yorlig'i uchun). */
export function weekdayDative(date: string): string {
  return WEEKDAY_DATIVE[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

/** "YYYY-MM-DD" ± kun (UTC — vaqt mintaqasidan qat'i nazar barqaror). */
export function shiftIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-09-18" → "Ju". */
export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

export interface DailyLike {
  date: string;
  present: number;
  late: number;
  absent: number;
  expected: number;
  rate: number | null;
}

export interface StaffComparison<T extends DailyLike> {
  /** `date`dan oldingi eng yaqin ish kuni (kutilgani > 0). */
  previous: T | null;
  /** "kecha" yoki "Pa" (oldingi ish kuni kecha bo'lmasa). */
  previousLabel: string;
  /** O'tgan hafta shu kuni (ish kuni bo'lsa). */
  lastWeek: T | null;
  lastWeekLabel: string;
}

export function staffComparison<T extends DailyLike>(daily: readonly T[], date: string): StaffComparison<T> {
  const before = daily.filter((d) => d.date < date && d.expected > 0).sort((a, b) => b.date.localeCompare(a.date));
  const previous = before[0] ?? null;
  const weekAgo = shiftIso(date, -7);
  const lastWeek = daily.find((d) => d.date === weekAgo && d.expected > 0) ?? null;
  return {
    previous,
    previousLabel: previous ? (previous.date === shiftIso(date, -1) ? 'kechaga nisbatan' : `${weekdayDative(previous.date)} nisbatan`) : '',
    lastWeek,
    lastWeekLabel: `o'tgan ${weekdayDative(date)} nisbatan`,
  };
}

/** Trend qatori: faqat ish kunlari (kutilgani > 0), `date`gacha, eskisi birinchi. */
export function dailySeries<T extends DailyLike>(daily: readonly T[], date: string, pick: (d: T) => number | null, limit = 14): Array<number | null> {
  return daily
    .filter((d) => d.date <= date && d.expected > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(pick);
}

export interface RankableUnit {
  id: string;
  name: string;
  unassigned: boolean;
  staffTotal: number;
  present: number;
  late: number;
  absent: number;
  notYet: number;
  rate: number | null;
}

/** Bo'linmalar reytingi: foizi bor va kamida `minPeople` kishi kutilgan
 *  bo'linmalar; eng yaxshi `n` va eng past `n` (bir-birini takrorlamaydi). */
export function rankUnits<T extends RankableUnit>(units: readonly T[], n = 5, minPeople = 3): { top: T[]; bottom: T[]; ranked: number } {
  const eligible = units
    .filter((u) => !u.unassigned && u.rate !== null && u.present + u.absent >= minPeople)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.present - a.present || a.name.localeCompare(b.name));
  const top = eligible.slice(0, n);
  const rest = eligible.slice(top.length);
  const bottom = rest.slice(-n).reverse();
  return { top, bottom, ranked: eligible.length };
}

/* --- Holat taxtasi — "Institut holati" ekrani uchun. --- */

/** Foizni taxta katagi uchun yaxlitlash (null — o'lchanmagan). */
function boardRate(rate: number | null): number | null {
  return rate === null || !Number.isFinite(rate) ? null : Math.round(rate * 10) / 10;
}

export interface SituationBoardItem {
  id: string;
  code: string;
  name: string;
  value: number | null;
  unit: string;
  detail: string | null;
  headcount: number | null;
}

const n = (value: number) => value.toLocaleString('ru-RU');

/**
 * Bo'linmalar (kafedra/dekanat/bo'lim) — holat taxtasi kataklari.
 * Kodlar ro'yxat tartibidan emas, NOM bo'yicha barqaror tartibdan
 * chiqadi: kun davomida foiz o'zgarganda katakning kodi sakramasin.
 */
export function unitBoardItems(units: readonly KafedraStat[] | null): SituationBoardItem[] {
  const rows = (units ?? []).filter((u) => !u.unassigned);
  const order = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'uz')).map((u) => u.id);
  return rows.map((u) => {
    const expected = u.present + u.absent + u.notYet;
    const measured = u.enrolled > 0 && expected > 0;
    return {
      id: u.id,
      code: `BOL-${String(order.indexOf(u.id) + 1).padStart(2, '0')}`,
      name: u.name,
      value: measured ? boardRate(u.rate) : null,
      unit: '%',
      detail: measured
        ? `${n(u.present)}/${n(expected)} keldi${u.late > 0 ? ` · ${n(u.late)} kech` : ''}`
        : u.staffTotal === 0
          ? "Xodim biriktirilmagan"
          : `Yuzi ro'yxatdan o'tgani ${n(u.enrolled)}/${n(u.staffTotal)} — o'lchab bo'lmaydi`,
      headcount: u.staffTotal > 0 ? u.staffTotal : null,
    };
  });
}

/** Fakultetlar — o'sha taxta uchun kataklar (talabalar kesimi). */
export function facultyBoardItems(faculties: readonly FacultyCounts[] | null): SituationBoardItem[] {
  const rows = faculties ?? [];
  const order = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'uz')).map((f) => f.id ?? f.name);
  return rows.map((f) => {
    const key = f.id ?? f.name;
    const expected = f.present + f.absent + f.notYet;
    const measured = f.total > 0 && expected > 0;
    return {
      id: f.id ?? f.name,
      code: `FAK-${String(order.indexOf(key) + 1).padStart(2, '0')}`,
      name: f.name,
      value: measured ? boardRate(f.rate) : null,
      unit: '%',
      detail: measured
        ? `${n(f.present)}/${n(expected)} keldi${f.late > 0 ? ` · ${n(f.late)} kech` : ''}`
        : f.total === 0
          ? "Talaba biriktirilmagan"
          : "Bu kuni davomat yozuvi yo'q — o'lchanmagan",
      headcount: f.total > 0 ? f.total : null,
    };
  });
}

/** Yomoni birinchi: qizil → sariq → yashil → o'lchanmagan, ichida esa
 *  past foiz oldinda. Hukm — tizim bo'ylab yagona `rag()` qoidasidan,
 *  bu yerda chegaralar qaytadan yozilmaydi. */
export function worstFirst<T extends { value: number | null; unit: string }>(
  items: readonly T[],
  thresholds: RagThresholds = RATE_RAG,
): T[] {
  const order: Record<Rag, number> = { qizil: 0, sariq: 1, yashil: 2, yoq: 3 };
  const band = (item: T): number => order[item.unit === '%' ? rag(item.value, thresholds) : 'yoq'];
  return [...items].sort((a, b) => band(a) - band(b) || (a.value ?? Infinity) - (b.value ?? Infinity));
}
