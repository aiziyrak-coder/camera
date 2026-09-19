import { describe, expect, it } from 'vitest';
import { dailySeries, rankUnits, shiftIso, staffComparison, weekdayShort, type RankableUnit } from './situationUtils';

const day = (date: string, present: number, expected = 100) => ({ date, present, late: 1, absent: expected - present, expected, rate: expected ? (present / expected) * 100 : null });

describe('staff comparison helpers', () => {
  it('shifts ISO dates across month boundaries', () => {
    expect(shiftIso('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftIso('2026-09-19', -7)).toBe('2026-09-12');
    expect(weekdayShort('2026-09-18')).toBe('Ju');
  });

  it('skips non-working days for the previous-day comparison', () => {
    // 2026-09-21 Dushanba; 20 — yakshanba (kutilgan 0).
    const daily = [day('2026-09-14', 80), day('2026-09-19', 70), day('2026-09-20', 0, 0), day('2026-09-21', 90)];
    const cmp = staffComparison(daily, '2026-09-21');
    expect(cmp.previous?.date).toBe('2026-09-19');
    expect(cmp.previousLabel).toBe('shanbaga nisbatan');
    expect(cmp.lastWeek?.date).toBe('2026-09-14');
    expect(cmp.lastWeekLabel).toBe("o'tgan dushanbaga nisbatan");
    expect(staffComparison(daily, '2026-09-20').previousLabel).toBe('kechaga nisbatan');
  });

  it('builds a working-day series up to the date', () => {
    const daily = [day('2026-09-19', 70), day('2026-09-20', 0, 0), day('2026-09-21', 90), day('2026-09-22', 95)];
    expect(dailySeries(daily, '2026-09-21', (d) => d.present)).toEqual([70, 90]);
  });
});

describe('rankUnits', () => {
  const unit = (id: string, rate: number | null, present = 10, over: Partial<RankableUnit> = {}): RankableUnit => ({
    id,
    name: id,
    unassigned: false,
    staffTotal: 12,
    present,
    late: 0,
    absent: 2,
    notYet: 0,
    rate,
    ...over,
  });
  it('splits top and bottom without overlap and drops tiny / unassigned units', () => {
    const units = [unit('a', 90), unit('b', 50), unit('c', 70), unit('d', null), unit('e', 99, 1, { absent: 0 }), unit('f', 100, 10, { unassigned: true })];
    const r = rankUnits(units, 2);
    expect(r.top.map((u) => u.id)).toEqual(['a', 'c']);
    expect(r.bottom.map((u) => u.id)).toEqual(['b']);
    expect(r.ranked).toBe(3);
  });
});
