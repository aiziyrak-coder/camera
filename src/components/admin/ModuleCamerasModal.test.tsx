// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA: modulni kameralarga biriktirish oynasi.
 *
 * 1) Qidiruv yoqilganda "Hammasini yoqish" KO'RINMAYOTGAN kameralarni ham
 *    o'zgartirib yuborardi — endi faqat topilganlarga ta'sir qiladi.
 * 2) Server `roleAllowed=false` desa, modul o'sha kamerada baribir ishlamaydi
 *    (xona turi mos emas) — bu ilgari hech joyda ko'rinmasdi.
 * 3) O'zgarish bo'lmaganda "Saqlash" faol bo'lmasligi kerak (ilgari u
 *    "Yopish" deb turib, "Bekor qilish" bilan bir xil ish qilardi).
 */

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));

const get = vi.fn();
const patch = vi.fn();
vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient');
  return { ...actual, api: { get: (...a: unknown[]) => get(...a), patch: (...a: unknown[]) => patch(...a) } };
});

import ModuleCamerasModal from './ModuleCamerasModal';
import type { AIModule } from '../../types';

const MODULE = { id: 'm1', code: 5, name: 'Yong‘in', hasDetector: true } as AIModule;

const ASSIGNMENTS = {
  moduleCode: 5,
  moduleName: 'Yong‘in',
  cameras: [
    { cameraId: 'c1', cameraName: 'Kirish-1', building: '1-Bino', zone: 'Kirish', status: 'faol', enabled: false, roleAllowed: true },
    { cameraId: 'c2', cameraName: 'Koridor-2', building: '1-Bino', zone: 'Koridor', status: 'faol', enabled: false, roleAllowed: true },
    { cameraId: 'c3', cameraName: 'Hovli-3', building: '2-Bino', zone: 'Hovli', status: 'faol', enabled: true, roleAllowed: false, effectiveRoomType: 'tashqi' },
  ],
};

function renderModal() {
  return render(
    <MemoryRouter>
      <ModuleCamerasModal open module={MODULE} onClose={() => {}} onSaved={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(ASSIGNMENTS);
  patch.mockResolvedValue(ASSIGNMENTS);
});

describe('ModuleCamerasModal', () => {
  it('qidiruv yoqilganda faqat topilgan kameralarni yoqadi', async () => {
    renderModal();
    await screen.findByText('Kirish-1');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Koridor' } });
    fireEvent.click(screen.getByRole('button', { name: /Topilganlarni yoqish/i }));

    // Faqat bitta o'zgarish: Kirish-1 tegilmagan qoladi.
    expect(screen.getByText(/1 ta o‘zgarish/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0][1]).toEqual({ assignments: [{ cameraId: 'c2', enabled: true }] });
  });

  it('xona turi mos kelmagan kamerani ogohlantiradi', async () => {
    renderModal();
    expect(await screen.findByText(/Xona turi mos emas/)).toBeTruthy();
    expect(screen.getByText(/1 ta yoqilgan kamerada bu modul baribir ishlamaydi/)).toBeTruthy();
  });

  it("o'zgarish bo'lmasa Saqlash bosilmaydi", async () => {
    renderModal();
    await screen.findByText('Kirish-1');
    expect(screen.getByRole('button', { name: /^Saqlash$/ })).toBeDisabled();
    // O'zgarish yo'q — "Bekor qilish" o'rniga "Yopish" (X tugmasi ham shunday nomlanadi).
    expect(screen.queryByRole('button', { name: /Bekor qilish/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Yopish$/ }).length).toBeGreaterThan(0);
  });
});
