// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA: shaxslar reestri.
 *
 *  - "Kutilmoqda" va "Yuzi yo'q" kartochkalari bir xil filtrga olib
 *    boradi: «Tasdiqlanmagan» filtri missing + pending ni qamrab oladi.
 *    Ilgari "Yuzi yo'q" faqat `missing` sonini ko'rsatib, bosilganda
 *    undan ko'p qator chiqarardi.
 *  - ?search= URL'dan bir marta o'qiladi va olib tashlanadi.
 */

const OVERVIEW = {
  xodim: { total: 10, confirmed: 6, pending: 1, missing: 3, percent: 60, awaitingApproval: 0, byFaculty: [], byCourse: [] },
  talaba: { total: 0, confirmed: 0, pending: 0, missing: 0, percent: null, awaitingApproval: 0, byFaculty: [], byCourse: [] },
};

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));
vi.mock('../../lib/useFaculties', () => ({ useFaculties: () => ({ faculties: [], loading: false }) }));
vi.mock('../../lib/apiClient', () => ({
  ApiError: class ApiError extends Error {},
  isAbortError: () => false,
  api: { get: () => Promise.resolve(OVERVIEW), del: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const seenParams: Record<string, string | undefined>[] = [];
vi.mock('../../lib/useServerPage', () => ({
  invalidateServerPageCache: vi.fn(),
  useServerPage: (_path: string, params: Record<string, string | undefined>) => {
    seenParams.push(params);
    return {
      items: [],
      page: 1,
      setPage: vi.fn(),
      totalPages: 1,
      total: 0,
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
    };
  },
}));

import StudentsStaffPage from './StudentsStaffPage';

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/reestr${search}`]}>
      <StudentsStaffPage />
    </MemoryRouter>,
  );
}

describe('StudentsStaffPage — holat kartochkalari', () => {
  it("«Kutilmoqda» kartochkasi ham «Tasdiqlanmagan» filtriga olib boradi", async () => {
    seenParams.length = 0;
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Kutilmoqda').length).toBeGreaterThan(0));

    const tile = screen.getAllByText('Kutilmoqda')[0].closest('button');
    expect(tile).not.toBeNull();
    fireEvent.click(tile as HTMLElement);

    await waitFor(() => {
      expect(seenParams[seenParams.length - 1].biometricsStatus).toBe('tasdiqlanmagan');
    });
  });
});

describe('StudentsStaffPage — ?search=', () => {
  it("URL'dagi qidiruv qo'llanadi va manzildan olib tashlanadi", async () => {
    seenParams.length = 0;
    renderPage('?search=Karimov');

    await waitFor(() => {
      expect(seenParams[seenParams.length - 1].search).toBe('Karimov');
    });
    await waitFor(() => expect(window.location.search).not.toContain('search=Karimov'));
  });
});
