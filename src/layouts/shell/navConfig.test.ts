import { describe, expect, it } from 'vitest';
import { findActive, homeForRole, isPathAllowedForRole, matchesPath, usesViewDate, visibleSections } from './navConfig';
import { legacyRedirect } from '../legacyRoutes';

describe('navConfig', () => {
  it('matches nested paths but not prefixes of other words', () => {
    expect(matchesPath('/reestr/x', '/reestr')).toBe(true);
    expect(matchesPath('/reestrlar', '/reestr')).toBe(false);
    expect(matchesPath('/', '/')).toBe(true);
  });

  it('finds the active item and its section', () => {
    expect(findActive('/reestr')?.item.label).toBe('Yuzlar bazasi');
    expect(findActive('/sozlamalar/tizim')?.section.label).toBe('Sozlamalar');
    // Platforma tozalandi (2026-11-12): davomat, kamera, hodisalar yo'q.
    expect(findActive('/talabalar')).toBeNull();
    expect(findActive('/sozlamalar/kameralar')).toBeNull();
  });

  it('restricts the camera steward role to its pages', () => {
    expect(homeForRole('kamera-masuli')).toBe('/tuzilma');
    expect(homeForRole('admin')).toBe('/');
    expect(isPathAllowedForRole('kamera-masuli', '/tuzilma')).toBe(true);
    expect(isPathAllowedForRole('kamera-masuli', '/reestr')).toBe(false);
    expect(isPathAllowedForRole('admin', '/reestr')).toBe(true);

    const sections = visibleSections(() => true, 'kamera-masuli');
    expect(sections.flatMap((s) => s.items.map((i) => i.to))).toEqual(['/tuzilma']);
  });

  it('filters the menu by permission and drops empty sections', () => {
    const sections = visibleSections((key) => key === 'registerPeople', 'admin');
    expect(sections.map((s) => s.id)).toEqual(['malumotlar']);
    expect(sections[0].items.map((i) => i.to)).toEqual(['/reestr', '/tuzilma']);
  });

  it('has no date-picker pages any more', () => {
    expect(usesViewDate('/')).toBe(false);
    expect(usesViewDate('/reestr')).toBe(false);
  });
});

describe('legacyRedirect', () => {
  it('maps old admin URLs and keeps query strings', () => {
    expect(legacyRedirect('/admin')).toBe('/');
    expect(legacyRedirect('/admin/')).toBe('/');
    expect(legacyRedirect('/admin/students-staff', '?search=00+12')).toBe('/reestr?search=00+12');
    expect(legacyRedirect('/admin/reset-password', '?token=abc')).toBe('/parolni-tiklash?token=abc');
    expect(legacyRedirect('/admin/system-log', '?tab=x&q=1')).toBe('/sozlamalar/tizim?tab=jurnal&q=1');
    // Olib tashlangan sahifalar bosh sahifaga.
    expect(legacyRedirect('/admin/events', '?id=42')).toBe('/?id=42');
    expect(legacyRedirect('/admin/nomalum')).toBe('/');
  });
});
