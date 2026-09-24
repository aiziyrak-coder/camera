import { describe, expect, it } from 'vitest';
import { clockLabel, defaultWindow, fromFraction, hourTicks, playableFrom, toFraction, visibleRanges } from './timeline';

const H = 3_600_000;
// 2026-09-24 00:00 Toshkent = 2026-09-23T19:00Z
const DAY_START = Date.parse('2026-09-23T19:00:00Z');

describe('defaultWindow', () => {
  it('bugun — oxirgi (saqlanish + 1) soat, hozirdan biroz keyingacha', () => {
    const now = new Date(DAY_START + 12 * H);
    const view = defaultWindow('2026-09-24', 4, now);
    expect(view.end).toBe(now.getTime() + 10 * 60_000);
    expect(view.end - view.start).toBe(5 * H);
  });

  it('o‘tgan kun — butun kun', () => {
    const view = defaultWindow('2026-09-20', 4, new Date(DAY_START + 12 * H));
    expect(view.end - view.start).toBe(24 * H);
  });
});

describe('kasr va vaqt', () => {
  const view = { start: 0, end: 1000 };
  it('ikki tomonga aylanadi va chegaradan chiqmaydi', () => {
    expect(toFraction(250, view)).toBe(0.25);
    expect(fromFraction(0.25, view)).toBe(250);
    expect(fromFraction(1.5, view)).toBe(1000);
  });
});

describe('visibleRanges', () => {
  it('oynadan tashqaridagini qirqadi', () => {
    const view = { start: DAY_START, end: DAY_START + 10 * H };
    const bars = visibleRanges(
      [
        { start: new Date(DAY_START - H).toISOString(), end: new Date(DAY_START + H).toISOString() },
        { start: new Date(DAY_START + 20 * H).toISOString(), end: new Date(DAY_START + 21 * H).toISOString() },
      ],
      view,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].left).toBe(0);
    expect(bars[0].width).toBeCloseTo(10);
  });
});

describe('playableFrom', () => {
  const ranges = [
    { start: new Date(1_000_000).toISOString(), end: new Date(2_000_000).toISOString() },
    { start: new Date(5_000_000).toISOString(), end: new Date(6_000_000).toISOString() },
  ];
  it('yozuv ichida — o‘sha lahza, bo‘shliqda — keyingi yozuv boshi', () => {
    expect(playableFrom(1_500_000, ranges)).toBe(1_500_000);
    expect(playableFrom(3_000_000, ranges)).toBe(5_000_000);
    expect(playableFrom(7_000_000, ranges)).toBeNull();
  });
});

describe('belgilar', () => {
  it('Toshkent vaqtida', () => {
    expect(clockLabel(Date.parse('2026-09-24T05:42:05Z'))).toBe('10:42:05');
    const ticks = hourTicks({ start: DAY_START, end: DAY_START + 24 * H });
    expect(ticks[0].label).toBe('00:00');
    expect(ticks[1].label).toBe('03:00');
  });
});
