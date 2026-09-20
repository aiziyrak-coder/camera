import { describe, expect, it } from 'vitest';
import type { FacultyCounts, GroupStat, KafedraStat, Lesson } from '../../lib/situationApi';
import {
  clockLabel,
  facultyBoardItems,
  lessonSlots,
  lowestGroups,
  mergeArrivals,
  peakHour,
  share,
  situationReference,
  teacherOnTimeRate,
  unitBoardItems,
  worstFirst,
  type ArrivalItem,
} from './situationUtils';

const counts = { total: 20, enrolled: 20, present: 10, late: 1, absent: 5, dayOff: 0, notYet: 5, noData: 0, rate: 50 };
const group = (name: string, over: Partial<GroupStat> = {}): GroupStat => ({ ...counts, name, facultyId: null, faculty: null, course: 1, curator: null, ...over });
const arrival = (id: string, photo: string | null = null): ArrivalItem => ({ id, fullName: id, photoUrl: photo, initials: '', type: 'talaba', unit: '', faculty: null, time: '08:00', status: 'keldi' });
const lesson = (id: string, startsAt: string, state: Lesson['state'], teacherStatus: Lesson['teacherStatus']): Lesson =>
  ({ id, startsAt, endsAt: null, state, teacherStatus, groupName: 'G', subject: 'S' }) as Lesson;

describe('situationUtils', () => {
  it('lowestGroups skips good and unsettled groups', () => {
    const res = lowestGroups([group('A', { rate: 90 }), group('B', { rate: 40 }), group('C', { rate: 20, notYet: 19, present: 1, absent: 0 }), group('D', { rate: 60 })]);
    expect(res.map((g) => g.name)).toEqual(['B', 'D']);
  });
  it('mergeArrivals prefers server copy and dedupes', () => {
    const res = mergeArrivals([arrival('x'), arrival('y')], [arrival('y', 'p.jpg'), arrival('z')]);
    expect(res.map((a) => a.id)).toEqual(['x', 'y', 'z']);
    expect(res[1].photoUrl).toBe('p.jpg');
  });
  it('teacherOnTimeRate ignores unknown', () => {
    expect(teacherOnTimeRate({ scheduled: 10, onTime: 3, late: 1, absent: 0, unknown: 6 })).toBe(75);
    expect(teacherOnTimeRate({ scheduled: 2, onTime: 0, late: 0, absent: 0, unknown: 2 })).toBeNull();
  });
  it('lessonSlots groups by start and marks state', () => {
    const slots = lessonSlots([lesson('1', '10:10', 'upcoming', 'kutilmoqda'), lesson('2', '08:30', 'finished', 'kechikdi'), lesson('3', '08:30', 'ongoing', 'oz_vaqtida')]);
    expect(slots.map((s) => [s.start, s.state, s.total])).toEqual([['08:30', 'ongoing', 2], ['10:10', 'upcoming', 1]]);
    expect(slots[0].late).toBe(1);
  });
  it('helpers', () => {
    expect(peakHour([{ hour: 8, students: 5, staff: 1 }, { hour: 9, students: 2, staff: 0 }])).toEqual({ hour: 8, total: 6 });
    expect(peakHour([{ hour: 8, students: 0, staff: 0 }])).toBeNull();
    expect(share(1, 3)).toBe(33.3);
    expect(share(1, 0)).toBeNull();
    expect(clockLabel('2026-09-19T08:12:00+05:00')).toBe('08:12');
    expect(clockLabel('8:05')).toBe('08:05');
  });
});

const kafedra = (id: string, over: Partial<KafedraStat> = {}): KafedraStat => ({
  id,
  name: `Kafedra ${id}`,
  kind: 'kafedra',
  building: null,
  unassigned: false,
  staffTotal: 10,
  enrolled: 10,
  present: 8,
  late: 1,
  absent: 2,
  dayOff: 0,
  notYet: 0,
  noData: 0,
  rate: 80,
  lessonsToday: 0,
  teacherLateLessons: 0,
  teacherMissedLessons: 0,
  ...over,
});

describe('situationReference', () => {
  it("bir xil holat — bir xil kod (vaqtga bog'liq emas)", () => {
    const a = situationReference({ date: '2026-09-20', mode: 'xodimlar', isToday: true });
    const b = situationReference({ date: '2026-09-20', mode: 'xodimlar', isToday: true });
    expect(a).toBe(b);
    expect(a).toMatch(/^FERMI\/SIT\/20260920\/XDM-\d{4}$/);
  });

  it('yakunlangan kun, kesim va tashkilot kodga kiradi', () => {
    expect(situationReference({ date: '2026-09-20', mode: 'talabalar' })).toMatch(/^FERMI\/SIT\/20260920\/TLB-\d{4}$/);
    expect(situationReference({ date: '2026-09-20', mode: 'xodimlar' })).not.toBe(
      situationReference({ date: '2026-09-20', mode: 'xodimlar', isToday: true }),
    );
    expect(situationReference({ date: '2026-09-20', mode: 'xodimlar', org: 'test' })).toContain('TEST/SIT/');
  });
});

describe('holat taxtasi kataklari', () => {
  it("o'lchanmagan bo'linma nolga aylanmaydi", () => {
    const [measured, blind] = unitBoardItems([
      kafedra('a'),
      kafedra('b', { enrolled: 0, present: 0, absent: 0, notYet: 0, rate: null }),
    ]);
    expect(measured.value).toBe(80);
    expect(blind.value).toBeNull();
    expect(blind.detail).toMatch(/o'lchab bo'lmaydi/);
  });

  it("kod nom bo'yicha barqaror — foiz o'zgarsa sakramaydi", () => {
    const first = unitBoardItems([kafedra('z', { name: 'Zoologiya' }), kafedra('a', { name: 'Anatomiya' })]);
    expect(first.map((i) => [i.name, i.code])).toEqual([['Zoologiya', 'BOL-02'], ['Anatomiya', 'BOL-01']]);
  });

  it("biriktirilmagan bo'linma taxtaga chiqmaydi", () => {
    expect(unitBoardItems([kafedra('a'), kafedra('x', { unassigned: true })])).toHaveLength(1);
  });

  it('fakultetlar ham katakka aylanadi', () => {
    const faculty = (id: string, over: Partial<FacultyCounts> = {}): FacultyCounts =>
      ({ ...counts, id, name: `Fakultet ${id}`, ...over }) as FacultyCounts;
    const [a, empty] = facultyBoardItems([faculty('a'), faculty('b', { total: 0, present: 0, absent: 0, notYet: 0, rate: null })]);
    expect(a.unit).toBe('%');
    expect(empty.value).toBeNull();
    expect(empty.detail).toMatch(/biriktirilmagan/);
  });

  it("worstFirst — qizil tepada, o'lchanmagani oxirida", () => {
    const mk = (id: string, value: number | null) => ({ id, value, unit: '%' });
    expect(worstFirst([mk('yashil', 95), mk('yoq', null), mk('qizil', 40), mk('sariq', 80)]).map((i) => i.id)).toEqual([
      'qizil',
      'sariq',
      'yashil',
      'yoq',
    ]);
  });
});
