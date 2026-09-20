import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EnrollMissing, EnrollmentCode } from '../../lib/situationApi';

const missing: EnrollMissing = {
  group: 'DI-2301',
  total: 3,
  missing: [{ id: 'a', fullName: 'Aliyev Anvar', initials: 'AA', biometricsStatus: 'yoq' }],
  enrollUrl: 'https://cam.example/royxatdan-otish?guruh=DI-2301&kod=ABC123',
  enrollCode: 'ABC123',
};

const regenerate = vi.fn(
  async (): Promise<EnrollmentCode> => ({ scope: 'guruh', unitName: 'DI-2301', code: 'XYZ999', createdAt: null, expiresAt: null }),
);

vi.mock('../../lib/situationApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/situationApi')>();
  return {
    ...original,
    getEnrollmentMissing: vi.fn(async () => missing),
    regenerateEnrollmentCode: (...args: unknown[]) => regenerate(...(args as [])),
  };
});
vi.mock('./EnrollQrCard', () => ({ EnrollQrCard: () => null, EnrollPrintPortal: () => null }));

import { GroupEnrollDrawer } from './GroupEnrollDrawer';

function renderDrawer() {
  return render(
    <MemoryRouter>
      <GroupEnrollDrawer target={{ name: 'DI-2301', faculty: 'Davolash ishi' }} onClose={() => {}} withDate={(p) => p} />
    </MemoryRouter>,
  );
}

describe('GroupEnrollDrawer — guruh kodi', () => {
  beforeEach(() => regenerate.mockClear());

  it('kodni yangilash avval tasdiq so\'raydi', async () => {
    // Ilgari bitta bosish darhol yangi kod olardi va chop etilgan kartalar
    // ogohlantirishsiz yaroqsiz bo'lib qolardi.
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ABC123')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Kodni yangilash' }));
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.getByText('Guruh kodini yangilash')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yangi kod olish' }));
    await waitFor(() => expect(screen.getByText('XYZ999')).toBeInTheDocument());
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it('bekor qilinsa kod o\'zgarmaydi', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ABC123')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Kodni yangilash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });
});
