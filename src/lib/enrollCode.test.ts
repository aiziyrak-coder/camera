import { describe, expect, it } from 'vitest';
import { ENROLL_CODE_LENGTH, isEnrollCodeComplete, normalizeEnrollCode } from './enrollCode';

describe('normalizeEnrollCode', () => {
  it("kichik harfni kattaga o'tkazadi", () => {
    expect(normalizeEnrollCode('k7m2xr')).toBe('K7M2XR');
  });

  it("bo'sh joy va chiziqchani tashlaydi", () => {
    // Kartadan ko'chirganda kod ko'pincha "K7M-2XR" yoki " K7M 2XR " ko'rinishida keladi.
    expect(normalizeEnrollCode(' K7M-2XR ')).toBe('K7M2XR');
  });

  it('alifboda yo\'q belgilarni qabul qilmaydi', () => {
    // O, 0, I, 1 kodda umuman uchramaydi — ular tashlab yuboriladi.
    expect(normalizeEnrollCode('K0O7I1M2XR')).toBe('K7M2XR');
  });

  it("uzunlikni cheklaydi", () => {
    expect(normalizeEnrollCode('ABCDEFGHJK')).toHaveLength(ENROLL_CODE_LENGTH);
  });

  it("bo'sh qiymatlar bo'sh satr beradi", () => {
    expect(normalizeEnrollCode('')).toBe('');
    expect(normalizeEnrollCode(null)).toBe('');
    expect(normalizeEnrollCode(undefined)).toBe('');
  });
});

describe('isEnrollCodeComplete', () => {
  it("faqat to'liq terilgan kod uchun rost", () => {
    expect(isEnrollCodeComplete('K7M2X')).toBe(false);
    expect(isEnrollCodeComplete('K7M2XR')).toBe(true);
    expect(isEnrollCodeComplete('k7m 2xr')).toBe(true);
  });
});
