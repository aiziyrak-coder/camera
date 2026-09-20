import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Counts } from '../../lib/situationApi';
import { CountsLegend } from './CountsBreakdown';

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 10, enrolled: 10, present: 5, late: 2, absent: 3, dayOff: 0, notYet: 2, noData: 0, rate: 50, ...over,
});

describe('CountsLegend', () => {
  it('"Keldi" = present − late', () => {
    render(<CountsLegend counts={counts()} />);
    expect(screen.getByTitle('Keldi: 3')).toBeInTheDocument();
    expect(screen.getByTitle('Kech keldi: 2')).toBeInTheDocument();
  });

  it("buzuq ma'lumotda ham manfiy son chiqmaydi", () => {
    // late > present bo'lib qolsa (serverdagi nomuvofiqlik) chiziq 0 dan
    // boshlanardi, izohda esa "-1 keldi" yozilardi.
    render(<CountsLegend counts={counts({ present: 1, late: 2 })} />);
    expect(screen.getByTitle('Keldi: 0')).toBeInTheDocument();
    expect(screen.queryByText('-1')).not.toBeInTheDocument();
  });

  it("dam olish va ma'lumotsiz kunlar bitta qatorda", () => {
    render(<CountsLegend counts={counts({ noData: 2, dayOff: 3 })} />);
    expect(screen.getByTitle("Ma'lumot yo'q: 5")).toBeInTheDocument();
  });
});
