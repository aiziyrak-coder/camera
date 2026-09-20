// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA: "Ish vaqti" sahifasi.
 *
 * Ilgari sahifada saqlashdan oldingi tekshiruv umuman yo'q edi: vaqt
 * maydonini tozalab yoki barcha ish kunlarini o'chirib "Saqlash" bosilsa,
 * so'rov serverga ketardi va tost'da pydantic'ning inglizcha xatosi
 * chiqardi. Yon tarafdagi "Qanday hisoblanadi" kartasi esa "NaN:NaN"
 * ko'rsatardi. Shuningdek "Saqlash" hech nima o'zgarmaganda ham faol edi.
 */

const savePolicy = vi.fn();

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ token: 't', role: 'super-admin', userName: 'Admin' }),
}));

vi.mock('../../lib/permissions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/permissions')>();
  return { ...original, usePermissions: () => ({ can: () => true, matrix: {}, toggle: () => {}, saveError: null, clearSaveError: () => {} }) };
});

vi.mock('../../lib/attendancePolicyApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/attendancePolicyApi')>();
  return {
    ...original,
    getAttendancePolicy: () =>
      Promise.resolve({
        staffStart: '08:30',
        studentStart: '08:00',
        graceMinutes: 15,
        workEnd: '17:00',
        workDays: [1, 2, 3, 4, 5],
        trackLastSeen: true,
        staffLateAfter: '08:45',
        studentLateAfter: '08:15',
      }),
    saveAttendancePolicy: (...args: unknown[]) => savePolicy(...args),
  };
});

import WorkHoursPage from './WorkHoursPage';

async function renderPage() {
  render(
    <MemoryRouter>
      <WorkHoursPage />
    </MemoryRouter>,
  );
  await screen.findByLabelText(/Xodimlar ish boshlanishi/);
}

beforeEach(() => {
  savePolicy.mockReset();
  savePolicy.mockResolvedValue({ recomputed: 0 });
});

describe('WorkHoursPage', () => {
  it("hech nima o'zgarmaganda «Saqlash» nofaol", async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: /Saqlash/ })).toBeDisabled();
  });

  it("bo'sh ish boshlanish vaqti bilan saqlanmaydi va sabab ko'rsatiladi", async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Xodimlar ish boshlanishi/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));

    await screen.findByText(/Ish boshlanish vaqtini kiriting/);
    expect(savePolicy).not.toHaveBeenCalled();
  });

  it("bo'sh vaqtda «NaN:NaN» emas, «—» ko'rsatiladi", async () => {
    await renderPage();
    expect(screen.queryByText(/NaN/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Xodimlar ish boshlanishi/), { target: { value: '' } });
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("barcha ish kunlari o'chirilsa saqlanmaydi", async () => {
    await renderPage();
    for (const day of ['Du', 'Se', 'Ch', 'Pa', 'Ju']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await screen.findByText(/Kamida bitta ish kunini belgilang/);
    expect(savePolicy).not.toHaveBeenCalled();
  });

  it("ish tugashi boshlanishidan oldin bo'lsa saqlanmaydi", async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Ish tugashi/), { target: { value: '07:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await screen.findByText(/keyin bo'lishi kerak/);
    expect(savePolicy).not.toHaveBeenCalled();
  });

  it("to'g'ri qiymat saqlanadi", async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Ish tugashi/), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(savePolicy).toHaveBeenCalledTimes(1));
    expect(savePolicy.mock.calls[0][1]).toMatchObject({ workEnd: '18:00' });
  });
});
