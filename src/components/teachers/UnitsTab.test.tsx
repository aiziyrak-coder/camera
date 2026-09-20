// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KafedraStat } from '../../lib/situationApi';
import type { Loader } from './useLoader';

vi.mock('../../lib/situationApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/situationApi')>();
  return { ...original, getAnalyticsUnits: vi.fn(async () => []), getLessons: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 500, totalPages: 1, date: '2026-09-20', counts: { upcoming: 0, ongoing: 0, finished: 0 } })) };
});
// Qidiruv auth/permissions provayderlarini talab qiladi — bu testda kerak emas.
vi.mock('./TeacherSearch', () => ({ TeacherSearch: () => null }));

import { UnitsTab } from './UnitsTab';

function unit(partial: Partial<KafedraStat>): KafedraStat {
  return {
    id: 'u1',
    name: 'Normal anatomiya kafedrasi',
    kind: 'kafedra',
    building: null,
    unassigned: false,
    staffTotal: 0,
    enrolled: 0,
    present: 0,
    late: 0,
    absent: 0,
    dayOff: 0,
    notYet: 0,
    noData: 0,
    rate: null,
    lessonsToday: 0,
    teacherLateLessons: 0,
    teacherMissedLessons: 0,
    ...partial,
  };
}

function loaderFor(rows: KafedraStat[]): Loader<KafedraStat[]> {
  return { data: rows, loading: false, refreshing: false, error: null, reload: () => {} };
}

function renderTab(rows: KafedraStat[]) {
  return render(
    <MemoryRouter>
      <UnitsTab loader={loaderFor(rows)} date="2026-09-20" isToday withDate={(path) => path} />
    </MemoryRouter>,
  );
}

describe("UnitsTab — «Xodimlar keldi» plitkasi", () => {
  // 20 xodimdan 8 tasining yuzi ro'yxatdan o'tmagan: backend foizi
  // 10 / (10 + 2) = 83,3%, "jami 20 xodimning 50%" EMAS. Plitka avval
  // present/staffTotal ni hisoblab, har bir karta halqasidan boshqa foiz
  // ko'rsatardi.
  it('uses the same denominator as the unit cards and names it', async () => {
    renderTab([unit({ staffTotal: 20, enrolled: 12, present: 10, late: 2, absent: 2, noData: 8, rate: 83.3 })]);
    const hint = await screen.findByText(/Holati aniq/);
    expect(hint.textContent).toContain('Holati aniq 12 xodimdan');
    expect(hint.textContent).toContain("yuzi ro'yxatdan o'tmagan");
    expect(hint.textContent).not.toContain('20 xodimning');
  });

  it('counts people who have not arrived yet, not the ones with no face enrolled', async () => {
    renderTab([unit({ staffTotal: 10, enrolled: 9, present: 4, absent: 1, notYet: 4, noData: 1, rate: 44.4 })]);
    const hint = await screen.findByText(/Holati aniq/);
    expect(hint.textContent).toContain('Holati aniq 9 xodimdan');
  });
});

describe('UnitsTab — bo\'linma yorlig\'i', () => {
  // Bo'linma sahifasi bu qatorni "Biriktirilmagan" deb ataydi; karta
  // "Lavozim" derdi — bitta bo'linma ikki xil nomlanardi.
  it('labels the unassigned pseudo-unit the same way as its own page', async () => {
    renderTab([unit({ id: 'unassigned', name: "Lavozim bo'yicha (bo'linmasi ko'rsatilmagan)", kind: 'lavozim', unassigned: true, staffTotal: 139, present: 100, absent: 39, rate: 71.9 })]);
    await waitFor(() => expect(screen.getByText('Biriktirilmagan')).toBeTruthy());
    expect(screen.queryByText('Lavozim')).toBeNull();
  });
});
