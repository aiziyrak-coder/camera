// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA: tashkiliy tuzilma sahifasi.
 *
 * Fakultet o'chirilganda backend uning guruhlarini ham o'chiradi
 * (student_groups.faculty_id ondelete="CASCADE") — tasdiq oynasi buni
 * aytadi, lekin ekrandagi ro'yxat yangilanmasdi va "Guruhlar" tabida
 * allaqachon o'chgan guruhlar ko'rinib turardi.
 */

const del = vi.fn().mockResolvedValue(undefined);

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));
vi.mock('../../lib/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../../lib/apiClient', () => ({
  ApiError: class ApiError extends Error {},
  isAbortError: () => false,
  api: {
    del: (...args: unknown[]) => del(...args),
    get: (path: string) => {
      if (path === '/api/buildings') return Promise.resolve([]);
      if (path === '/api/departments') return Promise.resolve([]);
      if (path === '/api/faculties') {
        return Promise.resolve([{ id: 'f1', name: 'Stomatologiya', courseCount: 5, studentCount: 10 }]);
      }
      return Promise.resolve([
        { id: 'g1', name: 'DI-2301', faculty: 'Stomatologiya', course: 2, studentCount: 10 },
      ]);
    },
  },
}));

import OrgStructurePage from './OrgStructurePage';

describe('OrgStructurePage — fakultet o’chirish', () => {
  it("fakultet bilan birga uning guruhlari ham ro'yxatdan chiqadi", async () => {
    render(
      <MemoryRouter initialEntries={['/tuzilma?tab=fakultetlar']}>
        <OrgStructurePage />
      </MemoryRouter>,
    );

    // Jadval ish stoli va telefon ko'rinishida ikki marta chiziladi.
    await waitFor(() => expect(screen.getAllByText('Stomatologiya').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByLabelText("«Stomatologiya» — o'chirish")[0]);
    // Tasdiq oynasi guruh yo'qolishini aytadi.
    expect(screen.getByText(/1 ta guruh/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: "O'chirish" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/faculties/f1', 't'));

    // Guruhlar tabiga o'tamiz — o'chgan guruh ko'rinmasligi kerak.
    fireEvent.click(screen.getAllByRole('tab', { name: /Guruhlar/ })[0]);
    await waitFor(() => expect(screen.queryByText('DI-2301')).toBeNull());
  });
});
