import { describe, expect, it } from 'vitest';
import { buildReference, buildingAbbr, locationCode, recordCode, refHash, unitCode } from './registryCodes';

describe('registryCodes', () => {
  it('iz bir xil holatda bir xil, boshqa holatda boshqacha', () => {
    expect(refHash(['a', 'b'])).toBe(refHash(['a', 'b']));
    expect(refHash(['a', 'b'])).not.toBe(refHash(['b', 'a']));
    // Bo'sh qismlar chalkashmaydi: ['ab'] va ['a','b'] boshqa iz beradi.
    expect(refHash(['ab'])).not.toBe(refHash(['a', 'b']));
    expect(refHash(['x'])).toMatch(/^[0-9A-F]{4}$/);
  });

  it('birlik kodi ikki xonali', () => {
    expect(unitCode('FAK', 0)).toBe('FAK-01');
    expect(unitCode('BIN', 1)).toBe('BIN-02');
    expect(unitCode('KAF', 11)).toBe('KAF-12');
  });

  it('yozuv kodi identifikatorning oxiridan olinadi', () => {
    expect(recordCode('SH', '3f2a17e0-1c4b-4a9d-9f21-7b6c5d4e3f2a')).toBe('SH-4E3F2A');
    // Qisqa identifikator ham 6 belgiga to'ldiriladi va barqaror qoladi.
    expect(recordCode('KM', '7')).toBe(recordCode('KM', '7'));
    expect(recordCode('KM', '7')).toMatch(/^KM-[0-9A-Z]{6}$/);
  });

  it('hujjat raqamida bo‘sh kesimlar tushib qoladi', () => {
    expect(buildReference('HOD', ['navbat', '', null], ['a'])).toBe(`HOD/NAVBAT/${refHash(['a'])}`);
  });

  it('joylashuv kodi qavatsiz kamerani ochiq ko‘rsatadi', () => {
    expect(buildingAbbr("2-o'quv korpusi")).toBe('2OQ');
    expect(locationCode("2-o'quv korpusi", 3)).toBe('2OQ·Q03');
    expect(locationCode(null, null)).toBe('---·Q--');
  });
});
