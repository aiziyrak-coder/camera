import { describe, expect, it } from 'vitest';
import {
  buildingKey,
  campusListParams,
  floorKey,
  parseCampusRoute,
  withCampusRoute,
} from './campusNavigation';

const route = (query: string) => parseCampusRoute(new URLSearchParams(query));

describe('parseCampusRoute', () => {
  it('bo’sh URL — kampus darajasi', () => {
    expect(route('').level).toBe('campus');
  });

  it('bino tanlangan — bino darajasi', () => {
    expect(route('bino=b1').level).toBe('building');
  });

  it('qavat tanlangan — qavat darajasi', () => {
    const parsed = route('bino=b1&qavat=3');
    expect(parsed.level).toBe('floor');
    expect(parsed.floor).toBe('3');
  });

  it('qavat "yoq" ham daraja hisoblanadi (qavati belgilanmagan kameralar)', () => {
    expect(route('bino=b1&qavat=yoq').level).toBe('floor');
  });

  it('qidiruv boshqa darajalardan ustun', () => {
    expect(route('bino=b1&qavat=3&q=kirish').level).toBe('search');
  });

  it('faqat bo’shliqdan iborat qidiruv daraja o’zgartirmaydi', () => {
    expect(route('bino=b1&q=%20%20').level).toBe('building');
  });
});

describe('campusListParams', () => {
  it('kampus va bino darajasida kameralar so’ralmaydi', () => {
    expect(campusListParams(route(''))).toEqual({});
    expect(campusListParams(route('bino=b1'))).toEqual({});
  });

  it('qavat darajasida bino va qavat bo’yicha so’raladi', () => {
    expect(campusListParams(route('bino=b1&qavat=3'))).toEqual({ buildingId: 'b1', floor: '3' });
  });

  it('"yoq" guruhi API uchun "none" ga aylanadi', () => {
    expect(campusListParams(route('bino=yoq&qavat=yoq'))).toEqual({
      buildingId: 'none',
      floor: 'none',
    });
  });

  it('qidiruvda faqat matn yuboriladi', () => {
    expect(campusListParams(route('bino=b1&qavat=3&q=kirish'))).toEqual({ search: 'kirish' });
  });
});

describe('withCampusRoute', () => {
  it('kalitlarni qo’shadi va null bilan o’chiradi', () => {
    const next = withCampusRoute(new URLSearchParams('bino=b1&qavat=3&kamera=c9'), {
      qavat: '4',
      kamera: null,
    });
    expect(next.get('bino')).toBe('b1');
    expect(next.get('qavat')).toBe('4');
    expect(next.has('kamera')).toBe(false);
  });

  it('asl parametrlarni o’zgartirmaydi', () => {
    const original = new URLSearchParams('bino=b1');
    withCampusRoute(original, { bino: null });
    expect(original.get('bino')).toBe('b1');
  });
});

describe('kalitlar', () => {
  it('qavati yo’q kamera "yoq" guruhiga tushadi', () => {
    expect(floorKey(null)).toBe('yoq');
    expect(floorKey(undefined)).toBe('yoq');
    expect(floorKey(0)).toBe('0');
    expect(floorKey(3)).toBe('3');
  });

  it('binosi yo’q guruh "yoq" kaliti bilan', () => {
    expect(buildingKey({ id: '' })).toBe('yoq');
    expect(buildingKey({ id: 'b1' })).toBe('b1');
  });
});
