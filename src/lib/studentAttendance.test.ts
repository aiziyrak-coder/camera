import { describe, expect, it } from 'vitest';
import type { Counts, GroupStat, GroupStudent } from './situationApi';
import {
  applyArrival,
  averageRate,
  computeRate,
  countSegments,
  countsFromStudents,
  filterStudents,
  groupsToCourses,
  lessonRate,
  monthsInRange,
  normalizeText,
  sortGroups,
  sortStudents,
  sumCounts,
  toClock,
  visitsByDate,
} from './studentAttendance';

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 10, enrolled: 10, present: 6, late: 2, absent: 2, dayOff: 0, notYet: 2, noData: 0, rate: 60, ...over,
});

const student = (id: string, fullName: string, status: GroupStudent['status'], checkIn: string | null = null): GroupStudent => ({
  id, fullName, photoUrl: null, initials: '', status, checkIn, checkOut: null, biometricsStatus: 'tasdiqlangan',
});

const group = (name: string, rate: number | null, course: number | null = 1): GroupStat => ({
  ...counts({ rate }), name, facultyId: null, faculty: null, course, curator: null,
});

describe('studentAttendance', () => {
  it('computeRate follows server rule and returns null for empty base', () => {
    expect(computeRate(6, 2, 2)).toBe(60);
    expect(computeRate(1, 2, 0)).toBe(33.3);
    expect(computeRate(0, 0, 0)).toBeNull();
  });

  it('sumCounts adds and recomputes rate', () => {
    const s = sumCounts([counts(), counts({ present: 10, late: 0, absent: 0, notYet: 0 })]);
    expect(s.total).toBe(20);
    expect(s.present).toBe(16);
    expect(s.rate).toBe(80);
  });

  it('countSegments splits on-time from late', () => {
    const seg = countSegments(counts());
    expect(seg.map((x) => x.value)).toEqual([4, 2, 2, 2, 0]);
  });

  it('countsFromStudents tallies statuses', () => {
    const c = countsFromStudents([student('1', 'A', 'keldi'), student('2', 'B', 'kech_keldi'), student('3', 'C', 'kutilmoqda')]);
    expect(c).toMatchObject({ total: 3, present: 2, late: 1, notYet: 1, rate: 66.7 });
  });

  it('applyArrival updates only matching student and keeps identity otherwise', () => {
    const list = [student('1', 'A', 'kutilmoqda'), student('2', 'B', 'kelmadi')];
    expect(applyArrival(list, { personId: 'x', status: 'keldi', checkIn: '08:00' })).toBe(list);
    const next = applyArrival(list, { personId: '2', status: 'kech_keldi', checkIn: '09:10' });
    expect(next[1]).toMatchObject({ status: 'kech_keldi', checkIn: '09:10' });
    expect(applyArrival(next, { personId: '2', status: 'kech_keldi', checkIn: '09:10' })).toBe(next);
  });

  it('filterStudents matches apostrophe variants case-insensitively', () => {
    const list = [student('1', "G'ulomov Ali", 'keldi'), student('2', 'Karimova Nodira', 'kelmadi')];
    expect(filterStudents(list, 'all', 'gʻulom').map((s) => s.id)).toEqual(['1']);
    expect(filterStudents(list, 'kelmadi', '').map((s) => s.id)).toEqual(['2']);
    expect(normalizeText('  A  B ')).toBe('a b');
  });

  it('sortStudents by status puts absent first, by arrival earliest first', () => {
    const list = [student('1', 'B', 'keldi', '08:30'), student('2', 'A', 'kelmadi'), student('3', 'C', 'keldi', '07:50')];
    expect(sortStudents(list, 'status').map((s) => s.id)).toEqual(['2', '1', '3']);
    expect(sortStudents(list, 'arrival').map((s) => s.id)).toEqual(['3', '1', '2']);
  });

  it('sortGroups keeps null rates last', () => {
    const list = [group('B', null), group('A', 90), group('C', 50)];
    expect(sortGroups(list, 'rate-asc').map((g) => g.name)).toEqual(['C', 'A', 'B']);
    expect(sortGroups(list, 'rate-desc').map((g) => g.name)).toEqual(['A', 'C', 'B']);
  });

  it('groupsToCourses groups by course with null last', () => {
    const blocks = groupsToCourses([group('X', 50, null), group('B', 50, 2), group('A', 50, 2), group('C', 50, 1)]);
    expect(blocks.map((b) => b.label)).toEqual(['1-kurs', '2-kurs', "Kurs ko'rsatilmagan"]);
    expect(blocks[1].groups.map((g) => g.name)).toEqual(['A', 'B']);
    expect(blocks[1].totals.total).toBe(20);
  });

  it('lessonRate uses seen before finalization', () => {
    expect(lessonRate({ expected: 20, present: 15, seen: 10, finalized: true })).toBe(75);
    expect(lessonRate({ expected: 20, present: 0, seen: 10, finalized: false })).toBe(50);
    expect(lessonRate({ expected: 0, present: 0, seen: 0, finalized: true })).toBeNull();
  });

  it('toClock converts ISO to Tashkent time', () => {
    expect(toClock('2026-09-19T03:12:00Z')).toBe('08:12');
    expect(toClock('9:05:30')).toBe('09:05');
    expect(toClock(null)).toBeNull();
  });

  it('monthsInRange spans years and limits', () => {
    expect(monthsInRange('2025-11-20', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsInRange('2026-01-01', '2026-06-01', 2)).toEqual(['2026-05', '2026-06']);
    expect(monthsInRange('2026-02-01', '2026-01-01')).toEqual([]);
  });

  it('averageRate skips null days', () => {
    expect(averageRate([{ rate: 80 }, { rate: null }, { rate: 90 }])).toBe(85);
    expect(averageRate([{ rate: null }])).toBeNull();
  });

  it('visitsByDate groups newest first', () => {
    const v = (id: string, date: string, firstSeen: string) => ({ id, date, camera: 'c', building: null, zone: null, firstSeen, lastSeen: firstSeen, durationMinutes: 5, sightings: 1 });
    const out = visitsByDate([v('1', '2026-09-18', '08:00'), v('2', '2026-09-19', '08:00'), v('3', '2026-09-19', '10:00')]);
    expect(out.map((d) => d.date)).toEqual(['2026-09-19', '2026-09-18']);
    expect(out[0].visits.map((x) => x.id)).toEqual(['3', '2']);
    expect(out[0].minutes).toBe(10);
  });
});
