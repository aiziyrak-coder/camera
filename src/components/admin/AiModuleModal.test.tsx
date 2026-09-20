// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * QA: modul sozlash oynasi.
 *
 * 1) Tegilmagan forma saqlanmasligi kerak — har PATCH audit jurnaliga
 *    "AI modulni sozladi" yozadi (camera-api/app/routers/ai_modules.py).
 * 2) Saqlash xatosi oyna ICHIDA ko'rinadi va oyna yopilmaydi.
 */

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));

const patch = vi.fn();
vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient');
  return { ...actual, api: { patch: (...a: unknown[]) => patch(...a) } };
});

import AiModuleModal from './AiModuleModal';
import { ApiError } from '../../lib/apiClient';
import type { AIModule } from '../../types';

const MODULE = {
  id: 'm1',
  code: 1,
  name: 'Begona shaxs',
  description: 'Tanilmagan yuz',
  method: 'ArcFace',
  threshold: 70,
  sensitivity: "o'rta",
  active: true,
  hasDetector: true,
} as AIModule;

beforeEach(() => vi.clearAllMocks());

describe('AiModuleModal', () => {
  it("o'zgarish bo'lmasa Saqlash faol emas", () => {
    render(<AiModuleModal open module={MODULE} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /^Saqlash$/ })).toBeDisabled();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '85' } });
    expect(screen.getByRole('button', { name: /^Saqlash$/ })).toBeEnabled();
  });

  it('xatoni oyna ichida ko\'rsatadi va yopmaydi', async () => {
    patch.mockRejectedValue(new ApiError(409, "Aniqlash logikasi yo'q"));
    const onClose = vi.fn();
    render(<AiModuleModal open module={MODULE} onClose={onClose} onSave={() => {}} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '85' } });
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Aniqlash logikasi yo'q/);
    expect(onClose).not.toHaveBeenCalled();

    // Qiymat qayta o'zgartirilsa eski xato yo'qoladi.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
