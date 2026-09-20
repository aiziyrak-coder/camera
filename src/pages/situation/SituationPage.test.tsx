import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Counts, Overview } from '../../lib/situationApi';

/**
 * Sahifa haqiqatan chiziladimi — shu tekshiriladi.
 *
 * 2026-09-20: kataklar takrorlanmasin deb ular o'zgaruvchiga chiqarilgan
 * edi, lekin JSX ichida `{camerasTile}` deb yozilgani uchun React'ga
 * element emas, `{camerasTile: ...}` OBYEKTI berildi. Natijada ochilish
 * sahifasi butunlay "Kutilmagan xatolik" ekraniga aylandi (React #31).
 * `tsc` ham, boshqa testlar ham buni ushlamadi — chunki bu sahifa
 * hech qachon chizilmagan edi.
 */

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 10, enrolled: 10, present: 6, late: 1, absent: 2, dayOff: 0, notYet: 1, noData: 0, rate: 60, ...over,
});

const overview: Overview = {
  date: '2026-09-20',
  isToday: true,
  generatedAt: '2026-09-20T08:30:00',
  students: counts(),
  staff: counts({ total: 20, enrolled: 18 }),
  teachers: { scheduled: 5, onTime: 4, late: 1, absent: 0, unknown: 0 },
  lessons: { total: 4, finished: 1, ongoing: 2, upcoming: 1, avgAttention: 71 },
  cameras: { total: 90, active: 84, online: 80, videoFlowing: 78 },
  events: { open: 3, today: 7, highOpen: 1, overdue: 2 },
  byFaculty: [],
  studentsDataAvailable: true,
  studentsEnrolledPct: 100,
  arrivalsByHour: [{ hour: 8, students: 6, staff: 4 }],
  lastArrivals: [],
};

vi.mock('../../lib/situationApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/situationApi')>();
  return {
    ...original,
    getOverview: vi.fn(async () => overview),
    getAnalyticsSummary: vi.fn(async () => null),
    getAnalyticsChronic: vi.fn(async () => []),
    getEnrollment: vi.fn(async () => null),
    getGroups: vi.fn(async () => []),
    getKafedras: vi.fn(async () => []),
    getLessons: vi.fn(async () => []),
  };
});

vi.mock('../../lib/realtime', () => ({
  useLiveAttendance: () => 'off',
  useLiveEvents: () => 'off',
}));

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));

vi.mock('../../lib/permissions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/permissions')>();
  return { ...original, usePermissions: () => ({ can: () => true }) };
});

import SituationPage from './SituationPage';

describe('SituationPage', () => {
  it('ochilish sahifasi xatosiz chiziladi (React #31 qaytmasin)', async () => {
    render(
      <MemoryRouter>
        <SituationPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Institut holati')).toBeInTheDocument();
    // Kameralar qatori — aynan shu o'zgaruvchi obyekt bo'lib ketgan edi.
    // Yorliq qisqardi ("Ishlab turgan kameralar" → "Kameralar"), lekin
    // tekshirilayotgan xulq o'sha: ko'rsatkichlar jadvali chiziladi.
    expect((await screen.findAllByText('Kameralar')).length).toBeGreaterThan(0);
  });
});
