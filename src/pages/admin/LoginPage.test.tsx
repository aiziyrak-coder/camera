// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authenticate = vi.fn(async () => ({ ok: false as const, error: "Login yoki parol noto'g'ri" }));
const login = vi.fn();

vi.mock('../../lib/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...original,
    useAuth: () => ({ role: null, userName: null, token: null, authenticate, login, logout: () => {} }),
  };
});

import LoginPage, { safeReturnPath } from './LoginPage';
import { RATE_LIMIT_MESSAGE } from '../../components/admin/authErrors';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/kirish']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

function submit(loginValue = 'admin', password = 'admin123') {
  fireEvent.change(screen.getByLabelText(/^Login$/i), { target: { value: loginValue } });
  fireEvent.change(screen.getByLabelText(/^Parol$/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^Kirish$/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    authenticate.mockReset();
    authenticate.mockImplementation(async () => ({ ok: false as const, error: "Login yoki parol noto'g'ri" }));
    login.mockReset();
  });

  it("chegaradan o'tilganda (429) nima qilish kerakligini aytadi", async () => {
    authenticate.mockImplementation(async () => ({ ok: false as const, error: "So'rov muvaffaqiyatsiz tugadi (429)" }));
    renderLogin();
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(RATE_LIMIT_MESSAGE));
  });

  it('server xatosi keyingi tahrirdan keyin ekranda qolib ketmaydi', async () => {
    renderLogin();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/^Parol$/i), { target: { value: 'boshqa-parol' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('login maydoni mobil klaviaturaning avto-kattalashtirishini o\'chiradi', () => {
    renderLogin();
    const input = screen.getByLabelText(/^Login$/i);
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocomplete')).toBe('username');
  });

  it("yuborish paytida tugma bosilmaydi (ikki marta yuborilmasin)", async () => {
    const pending: { release: () => void } = { release: () => {} };
    authenticate.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.release = () => resolve({ ok: false as const, error: 'x' });
        }),
    );
    renderLogin();
    submit();
    await waitFor(() => expect(screen.getByRole('button', { name: /Tekshirilmoqda/i })).toHaveProperty('disabled', true));
    pending.release();
  });
});

describe('safeReturnPath', () => {
  it('tashqi manzilni rad etadi', () => {
    expect(safeReturnPath('//evil.com')).toBeNull();
    expect(safeReturnPath('/\\evil.com')).toBeNull();
    expect(safeReturnPath('https://evil.com')).toBeNull();
  });
  it('ichki yo\'lni qaytaradi', () => {
    expect(safeReturnPath('/hodisalar?tab=all')).toBe('/hodisalar?tab=all');
  });
});
