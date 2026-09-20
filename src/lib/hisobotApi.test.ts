import { describe, expect, it } from 'vitest';
import {
  courseOptions,
  drillPatch,
  formatCell,
  groupOptions,
  hisobotPaths,
  readState,
  writeState,
  type HisobotFilterOptions,
} from './hisobotApi';

const TODAY = '2026-09-19';

const OPTIONS: HisobotFilterOptions = {
  faculties: [],
  courses: [1, 2],
  units: [],
  unit_kinds: [],
  groups: [
    { faculty_id: 'di', course: 2, name: 'DI-2302', count: 3 },
    { faculty_id: 'di', course: 2, name: 'DI-2301', count: 5 },
    { faculty_id: 'di', course: 3, name: 'DI-2101', count: 4 },
    { faculty_id: 'pe', course: 1, name: 'PE-2501', count: 2 },
  ],
};

describe('readState', () => {
  it('defaults to staff, today', () => {
    const s = readState(new URLSearchParams(), TODAY);
    expect(s).toMatchObject({ section: 'xodimlar', preset: 'today', from: TODAY, to: TODAY, criterion: '' });
  });

  it('ignores the other section filters', () => {
    const s = readState(new URLSearchParams('bolim=xodimlar&fakultet=di&bolinma=u-1'), TODAY);
    expect(s.faculty).toBe('');
    expect(s.unit).toBe('u-1');
    const t = readState(new URLSearchParams('bolim=talabalar&fakultet=di&bolinma=u-1'), TODAY);
    expect(t.faculty).toBe('di');
    expect(t.unit).toBe('');
  });

  it('accepts a valid custom range and rejects a reversed one', () => {
    expect(readState(new URLSearchParams('davr=custom&dan=2026-09-01&gacha=2026-09-10'), TODAY)).toMatchObject({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-10',
    });
    expect(readState(new URLSearchParams('davr=custom&dan=2026-09-10&gacha=2026-09-01'), TODAY)).toMatchObject({
      preset: 'today',
      from: TODAY,
    });
  });
});

describe('writeState', () => {
  it('clears dependent filters on cascade', () => {
    const cur = new URLSearchParams('bolim=talabalar&fakultet=di&kurs=2&guruh=DI-2301');
    expect(writeState(cur, { course: '3' }).toString()).toBe('bolim=talabalar&fakultet=di&kurs=3');
    expect(writeState(cur, { faculty: 'pe' }).toString()).toBe('bolim=talabalar&fakultet=pe');
  });

  it('drops section-specific params when the section changes', () => {
    const cur = new URLSearchParams('bolim=talabalar&fakultet=di&mezon=uxlash&q=ali&davr=week');
    expect(writeState(cur, { section: 'xodimlar' }).toString()).toBe('davr=week');
    expect(writeState(cur, { section: 'talabalar' }).get('mezon')).toBe('uxlash');
  });

  it('stores custom dates only for the custom preset', () => {
    const cur = new URLSearchParams('davr=custom&dan=2026-09-01&gacha=2026-09-10');
    expect(writeState(cur, { preset: 'month', from: '2026-09-01', to: TODAY }).toString()).toBe('davr=month');
  });
});

describe('cascading options', () => {
  it('limits courses and groups to the chosen faculty/course', () => {
    expect(courseOptions(OPTIONS, 'di')).toEqual([2, 3]);
    expect(courseOptions(OPTIONS, '')).toEqual([1, 2, 3]);
    expect(groupOptions(OPTIONS, 'di', '2')).toEqual(['DI-2301', 'DI-2302']);
    expect(groupOptions(OPTIONS, 'pe', '')).toEqual(['PE-2501']);
  });
});

describe('drillPatch', () => {
  const base = readState(new URLSearchParams('bolim=talabalar'), TODAY);
  it('goes one level deeper', () => {
    expect(drillPatch(base, 'di')).toEqual({ faculty: 'di' });
    expect(drillPatch({ ...base, faculty: 'di' }, '2')).toEqual({ course: '2' });
    expect(drillPatch({ ...base, faculty: 'di' }, '0')).toBeNull();
    expect(drillPatch({ ...base, faculty: 'di', course: '2' }, 'DI-2301')).toEqual({ group: 'DI-2301' });
    expect(drillPatch({ ...base, faculty: 'di', course: '2', group: 'DI-2301' }, 'x')).toBeNull();
    const staff = readState(new URLSearchParams(), TODAY);
    expect(drillPatch(staff, 'u-1')).toEqual({ unit: 'u-1' });
  });
});

describe('misc', () => {
  it('builds the report path with only set filters', () => {
    const s = readState(new URLSearchParams('bolim=talabalar&fakultet=di&mezon=davomat'), TODAY);
    const path = hisobotPaths.report(s);
    expect(path).toContain('kind=talaba');
    expect(path).toContain('faculty=di');
    expect(path).not.toContain('unit=');
  });

  it('formats cells', () => {
    expect(formatCell(87.5, '%')).toBe('87,5%');
    expect(formatCell(3, '')).toBe('3');
    expect(formatCell(null, '%')).toBe('—');
  });
});
