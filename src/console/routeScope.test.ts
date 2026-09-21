import { describe, expect, it } from 'vitest';
import { leavesScope } from './routeScope';

describe('leavesScope', () => {
  it('faqat ?filtr o‘zgarsa — qobiq ichida qoladi', () => {
    expect(leavesScope('/reestr', '?tur=talaba')).toBe(false);
    expect(leavesScope('/reestr', { pathname: '/reestr', search: '?tab=2' })).toBe(false);
  });

  it('oxiridagi qiyshiq chiziq farq qilmaydi', () => {
    expect(leavesScope('/reestr', '/reestr/')).toBe(false);
  });

  it('boshqa manzil — tashqariga chiqadi', () => {
    expect(leavesScope('/reestr', '/shaxs/42')).toBe(true);
    expect(leavesScope('/reestr', { pathname: '/tuzilma' })).toBe(true);
  });

  it('manzilsiz (faqat hash) o‘zgarish ichkarida', () => {
    expect(leavesScope('/reestr', { hash: '#pastga' })).toBe(false);
    expect(leavesScope('/reestr', '#pastga')).toBe(false);
  });
});
