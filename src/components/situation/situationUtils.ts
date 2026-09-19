import type { LiveAttendanceMessage } from '../../lib/realtime';
import type { Counts, GroupStat, LastArrival, Lesson, Overview } from '../../lib/situationApi';
import type { ProgressSegment } from '../../ui';

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
    { value: counts.late, tone: 'warning', label: 'Kech qoldi' },
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
