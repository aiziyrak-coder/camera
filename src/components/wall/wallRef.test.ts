import { describe, expect, it } from 'vitest';
import type { WallConfig } from '../../lib/wallApi';
import { wallReference } from './wallRef';

const config = (over: Partial<WallConfig> = {}): WallConfig => ({
  panels: ['A', 'B', 'C'],
  rotate: 15,
  cameras: [],
  ...over,
});

describe('wallReference', () => {
  it('bir xil sozlama — bir xil kod (vaqtga bog\'liq emas)', () => {
    const a = wallReference({ date: '2026-09-20', config: config() });
    const b = wallReference({ date: '2026-09-20', config: config() });
    expect(a).toBe(b);
    expect(a).toMatch(/^FERMI\/DEV\/20260920\/PNL-\d{4}$/);
  });

  it('panellar tartibi kodni o\'zgartirmaydi, tarkibi esa o\'zgartiradi', () => {
    expect(wallReference({ date: '2026-09-20', config: config({ panels: ['C', 'A', 'B'] }) })).toBe(
      wallReference({ date: '2026-09-20', config: config() }),
    );
    expect(wallReference({ date: '2026-09-20', config: config({ panels: ['A', 'B'] }) })).not.toBe(
      wallReference({ date: '2026-09-20', config: config() }),
    );
    expect(wallReference({ date: '2026-09-20', config: config({ rotate: 30 }) })).not.toBe(
      wallReference({ date: '2026-09-20', config: config() }),
    );
  });

  it("kun hali kelmagan bo'lsa ham kod buziladigan bo'sh joy qoldirmaydi", () => {
    expect(wallReference({ date: null, config: config() })).toMatch(/^FERMI\/DEV\/00000000\/PNL-\d{4}$/);
  });
});
