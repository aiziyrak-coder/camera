// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA: AI modullari sahifasi.
 *
 * 1) Rejim almashtirish rad etilsa (server 409: "kamida 30 ta baholangan
 *    signal kerak") — sabab TASDIQLASH DIALOGI ichida qolishi kerak. Ilgari
 *    xato toast'ga chiqib, dialog baribir yopilardi: foydalanuvchi nima uchun
 *    o'tmaganini bilmasdi.
 * 2) To'xtatilganlar ro'yxati yuklanmasa, "0 ta to'xtatilgan juftlik" deb
 *    ko'rsatish yolg'on — "—" bo'lishi kerak.
 */

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));
vi.mock('../../lib/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }),
}));

const get = vi.fn();
const patch = vi.fn();
const post = vi.fn();

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient');
  return { ...actual, api: { get: (...a: unknown[]) => get(...a), patch: (...a: unknown[]) => patch(...a), post: (...a: unknown[]) => post(...a) } };
});

import AIModulesPage from './AIModulesPage';
import { ApiError } from '../../lib/apiClient';
import type { AIModule } from '../../types';

const MODULE: AIModule = {
  id: 'm1',
  code: 1,
  group: 'A',
  name: 'Begona shaxs',
  description: 'Tanilmagan yuz aniqlanadi',
  method: 'ArcFace',
  accuracy: 0,
  threshold: 70,
  sensitivity: "o'rta",
  cameraCount: 3,
  active: true,
  hasDetector: true,
  measuredPrecision: null,
  reviewedEvents: 4,
  recentEvents: 10,
  maturity: 'sinov',
  maturityNote: 'Sinov rejimi',
  mode: 'sinov',
  promotionReady: true,
  trialUnreviewed: 2,
} as AIModule;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sozlamalar/ai']}>
      <AIModulesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((path: string) => {
    if (path === '/api/ai-modules') return Promise.resolve([MODULE]);
    if (path === '/api/ai-modules/suppressions') return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

describe('AIModulesPage — rejim almashtirish', () => {
  it('server rad etsa, sababni dialog ichida ko\'rsatadi va dialog ochiq qoladi', async () => {
    patch.mockRejectedValue(new ApiError(409, "Ishchi rejimga o'tkazish uchun kamida 30 ta baholangan sinov signali kerak"));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Ishchi rejimga$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Ishchi rejimga o'tkazish/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/kamida 30 ta baholangan/i);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("muvaffaqiyatli bo'lsa dialog yopiladi va ro'yxat qayta yuklanadi", async () => {
    patch.mockResolvedValue({ ...MODULE, mode: 'ishchi' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Ishchi rejimga$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Ishchi rejimga o'tkazish/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastSuccess).toHaveBeenCalled();
    // Rejim o'zgargach serverdagi sonlar qayta hisoblanadi — ro'yxat yangilanadi.
    await waitFor(() => expect(get.mock.calls.filter(([p]) => p === '/api/ai-modules').length).toBeGreaterThan(1));
  });
});

describe("AIModulesPage — to'xtatilganlar ko'rsatkichi", () => {
  it("ro'yxat yuklanmasa 0 emas, «—» ko'rsatadi", async () => {
    get.mockImplementation((path: string) => {
      if (path === '/api/ai-modules') return Promise.resolve([MODULE]);
      return Promise.reject(new ApiError(500, 'Server xatosi'));
    });
    renderPage();

    expect(await screen.findByText(/Ro'yxatni yuklab bo'lmadi/i)).toBeTruthy();
    const tile = screen.getByText("To'xtatilgan juftliklar").closest('div')?.parentElement;
    expect(tile?.textContent).not.toMatch(/\b0\b/);
  });
});
