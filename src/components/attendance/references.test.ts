import { describe, expect, it } from 'vitest';
import { dayReference, idToken, periodReference, unitCode, unitKindPrefix } from './references';

describe('unitCode', () => {
  it('pads the position to two digits', () => {
    expect(unitCode('FAK', 0)).toBe('FAK-01');
    expect(unitCode('KAF', 2)).toBe('KAF-03');
    expect(unitCode('GUR', 11)).toBe('GUR-12');
  });

  it('keeps growing past two digits instead of truncating', () => {
    expect(unitCode('GUR', 99)).toBe('GUR-100');
  });
});

describe('unitKindPrefix', () => {
  it('maps every known unit kind', () => {
    expect(unitKindPrefix('kafedra')).toBe('KAF');
    expect(unitKindPrefix('dekanat')).toBe('DEK');
    expect(unitKindPrefix('bolim')).toBe('BOL');
    expect(unitKindPrefix('lavozim')).toBe('LAV');
  });

  it('falls back for an unknown kind rather than throwing', () => {
    expect(unitKindPrefix('yangi-tur')).toBe('BOL');
  });
});

describe('idToken', () => {
  it('upper-cases and keeps only letters and digits', () => {
    expect(idToken('di-2301')).toBe('DI-2301');
    expect(idToken("Davolash ishi")).toBe('DAVOLASH');
  });

  it('never leaves a dangling separator', () => {
    expect(idToken('ab c')).toBe('AB-C');
    expect(idToken('abcdefg hij')).toBe('ABCDEFG');
  });

  it('names the missing id instead of producing an empty code', () => {
    expect(idToken(null)).toBe('YOQ');
    expect(idToken('')).toBe('YOQ');
    expect(idToken('—')).toBe('YOQ');
  });
});

describe('dayReference / periodReference', () => {
  it('is deterministic from page state alone', () => {
    expect(dayReference('TAL-FAK', '2026-09-20')).toBe('TAL-FAK/2026-09-20');
    expect(dayReference('TAL-FAK', '2026-09-20')).toBe(dayReference('TAL-FAK', '2026-09-20'));
  });

  it('collapses a one-day period', () => {
    expect(periodReference('SHX-P1', '2026-09-20', '2026-09-20')).toBe('SHX-P1/2026-09-20');
  });

  it('spells out a real period', () => {
    expect(periodReference('SHX-P1', '2026-09-01', '2026-09-20')).toBe('SHX-P1/2026-09-01..2026-09-20');
  });
});
