import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KafedraStat } from '../../lib/situationApi';
import { UnitsRanking } from './UnitsRanking';

const unit = (id: string, rate: number): KafedraStat => ({
  id,
  name: `Kafedra ${id}`,
  kind: 'kafedra',
  building: null,
  unassigned: false,
  staffTotal: 10,
  enrolled: 10,
  present: 8,
  late: 1,
  absent: 2,
  dayOff: 0,
  notYet: 0,
  noData: 0,
  rate,
  lessonsToday: 0,
  teacherLateLessons: 0,
  teacherMissedLessons: 0,
});

const show = (props: Partial<Parameters<typeof UnitsRanking>[0]>) =>
  render(
    <MemoryRouter>
      <UnitsRanking units={null} loading={false} error={null} onRetry={() => {}} linkFor={null} isToday {...props} />
    </MemoryRouter>,
  );

describe('UnitsRanking', () => {
  it("yuklanayotganda '0 ta bo'linma saralandi' deyilmaydi", () => {
    show({ loading: true });
    expect(screen.queryByText(/0 ta bo'linma/)).toBeNull();
    expect(screen.getByText(/yuklanmoqda/i)).toBeInTheDocument();
  });

  it("eski ma'lumot ustida xato bo'lsa — jim qolinmaydi", () => {
    show({ units: [unit('a', 90), unit('b', 70)], error: 'Tarmoq xatosi' });
    expect(screen.getByText(/Oxirgi yangilanish muvaffaqiyatsiz/)).toBeInTheDocument();
    expect(screen.getByText(/Tarmoq xatosi/)).toBeInTheDocument();
  });

  it("ma'lumot bor va xato yo'q bo'lsa ogohlantirish chiqmaydi", () => {
    show({ units: [unit('a', 90), unit('b', 70)] });
    expect(screen.queryByText(/Oxirgi yangilanish muvaffaqiyatsiz/)).toBeNull();
    expect(screen.getByText(/2 ta bo'linma/)).toBeInTheDocument();
  });
});
