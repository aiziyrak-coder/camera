import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CourseBlock, Counts, FacultyDetail, GroupStat } from '../../lib/situationApi';

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 10, enrolled: 10, present: 5, late: 1, absent: 3, dayOff: 0, notYet: 2, noData: 0, rate: 50, ...over,
});

const group = (name: string, rate: number, over: Partial<Counts> = {}): GroupStat => ({
  ...counts({ rate, ...over }), name, facultyId: 'f1', faculty: 'Davolash ishi', course: 1, curator: null,
});

// Nom bo'yicha A→C, lekin foiz bo'yicha C→A: saralash ishlayotganini ko'rsatadi.
const groups = [group('DI-2301', 30), group('DI-2302', 90), group('DI-2303', 60)];
const course: CourseBlock = { course: 1, label: '1-kurs', groups, totals: counts({ total: 30, enrolled: 30 }) };

let detail: FacultyDetail = {
  id: 'f1', name: 'Davolash ishi', date: '2026-09-20', isToday: true,
  totals: counts({ total: 30, enrolled: 30 }), courses: [course],
};

vi.mock('../../lib/situationApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/situationApi')>();
  return { ...original, getFaculty: vi.fn(async () => detail), getGroups: vi.fn(async () => []) };
});
vi.mock('../../components/students/EnrollmentCampaign', () => ({
  EnrollmentCampaign: () => <div data-testid="kampaniya" />,
}));

import FacultyPage from './FacultyPage';

function renderPage(initial = '/talabalar/fakultet/f1') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/talabalar/fakultet/:facultyId" element={<FacultyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Jadval sarlavhasidagi saralash tugmasi. */
function sortHeader(name: RegExp) {
  const table = screen.getByRole('table', { name: 'Guruhlar' });
  return within(within(table).getByRole('columnheader', { name })).getByRole('button');
}

/** Jadvaldagi guruh nomlari — ko'ringan tartibda. */
function tableGroupNames(): string[] {
  const table = screen.getByRole('table', { name: 'Guruhlar' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent ?? '');
}

describe('Fakultet sahifasi', () => {
  beforeEach(() => {
    localStorage.clear();
    detail = { id: 'f1', name: 'Davolash ishi', date: '2026-09-20', isToday: true, totals: counts({ total: 30, enrolled: 30 }), courses: [course] };
  });

  it('jadval sarlavhasini bosish qatorlarni haqiqatan qayta saralaydi', async () => {
    // Ilgari jadval `manualSort` bilan chizilardi: strelka aylanardi, lekin
    // qatorlar joyida qolardi — bosish hech narsa qilmasdi.
    localStorage.setItem('talabalar.fakultet.korinish', JSON.stringify('table'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('table', { name: 'Guruhlar' })).toBeInTheDocument());
    expect(tableGroupNames()).toEqual(['DI-2301', 'DI-2302', 'DI-2303']);

    fireEvent.click(sortHeader(/Kelganlar ulushi/));
    expect(tableGroupNames()).toEqual(['DI-2301', 'DI-2303', 'DI-2302']);

    fireEvent.click(sortHeader(/Kelganlar ulushi/));
    expect(tableGroupNames()).toEqual(['DI-2302', 'DI-2303', 'DI-2301']);
  });

  it("talabasi yo'q fakultet «Yuz topshirish» bilan ochilmaydi", async () => {
    // enrolledPct(0/0) = null → hasAttendanceData false edi, shuning uchun
    // bo'sh fakultet kampaniya ko'rinishida (u esa hech narsa chizmasdi) ochilardi.
    detail = {
      id: 'f1', name: 'Yangi fakultet', date: '2026-09-20', isToday: true,
      totals: counts({ total: 0, enrolled: 0, present: 0, late: 0, absent: 0, notYet: 0, rate: null }),
      courses: [],
    };
    renderPage();
    await waitFor(() => expect(screen.getByText("Bu fakultetda guruh yo'q")).toBeInTheDocument());
    expect(screen.queryByTestId('kampaniya')).not.toBeInTheDocument();
  });

  it("o'tgan sanada sarlavhada «bugun» deyilmaydi", async () => {
    renderPage('/talabalar/fakultet/f1?sana=2020-05-04');
    await waitFor(() => expect(screen.getByText('Davolash ishi')).toBeInTheDocument());
    const subtitle = screen.getByText(/nechta talaba kelgani/);
    expect(subtitle.textContent).toContain('shu kuni');
    expect(subtitle.textContent).not.toContain('bugun');
  });
});
