import { describe, expect, it } from 'vitest';
import { defaultRange, previewSummary, type ImportResult } from './darsJadvaliApi';

const result = (over: Partial<ImportResult> = {}): ImportResult => ({
  imported: 0, skipped: 0, preview: true, withCamera: 0, withTeacher: 0, weeks: 0,
  rows: [], errors: [], unmatchedRooms: [], unmatchedTeachers: [], ...over,
});

describe('defaultRange', () => {
  it("joriy oyning 1-kunidan to'rt oy", () => {
    expect(defaultRange('2026-09-21')).toEqual({ from: '2026-09-01', to: '2027-01-01' });
  });

  it('yil chegarasidan sakraydi', () => {
    expect(defaultRange('2026-11-05').to).toBe('2027-03-01');
  });
});

describe('previewSummary', () => {
  it('nima yozilishini bir qatorda aytadi', () => {
    // ru formatida raqamlar ajratgichi — oddiy bo'shliq emas.
    expect(previewSummary(result({ imported: 1240, weeks: 16 })).replace(/\s/g, ' ')).toBe('1 240 dars · 16 hafta');
  });

  it('takrorlarni ham aytadi — jimgina tashlab ketilmasin', () => {
    expect(previewSummary(result({ imported: 10, weeks: 2, skipped: 4 }))).toContain('4 takror');
  });

  it("bo'sh natijada ham son ko'rsatiladi", () => {
    expect(previewSummary(result())).toBe('0 dars');
  });
});
