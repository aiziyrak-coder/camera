import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VideoWallPage from '../../pages/admin/VideoWallPage';
import { WALL_MAX_LIVE } from '../../lib/videoWall';
import type { CameraFeed } from '../../types';
import { DRAG_CAMERA } from './WallTile';

const cameras: CameraFeed[] = Array.from({ length: 30 }, (_, index) => ({
  id: `cam-${index + 1}`,
  name: `Kamera ${index + 1}`,
  building: index < 20 ? '1-Bino' : '2-Bino',
  zone: `${100 + index}-xona`,
  status: index === 1 ? 'offline' : 'live',
  streamUrl: `https://cam.example/s0/cam-${index + 1}/index.m3u8`,
  floor: (index % 3) + 1,
}));

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/apiClient')>();
  return {
    ...original,
    fetchAllPages: vi.fn(async () => cameras),
    api: { ...original.api, blob: vi.fn(async () => Promise.reject(new Error('kadr yo‘q'))) },
  };
});
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ role: 'admin' }) }));
vi.mock('../../lib/permissions', () => ({ usePermissions: () => ({ can: () => false }) }));
vi.mock('../LiveVideoPlayer', () => ({
  default: ({ streamUrl }: { streamUrl?: string }) => <div data-testid="player" data-url={streamUrl} />,
}));

function renderWall() {
  return render(
    <MemoryRouter initialEntries={['/admin/video-wall']}>
      <VideoWallPage />
    </MemoryRouter>,
  );
}

const cells = () => screen.getAllByRole('gridcell');
const players = () => screen.queryAllByTestId('player');

async function loaded() {
  await waitFor(() => expect(screen.getByText(/30 ta ·/)).toBeInTheDocument());
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('Videodevor', () => {
  it("yon paneldan bosilgan kamera birinchi bo'sh katakka tushadi va jonli o'ynaydi", async () => {
    renderWall();
    await loaded();
    expect(cells()).toHaveLength(4);
    expect(players()).toHaveLength(0);

    fireEvent.click(screen.getByTitle(/Kamera 1 —/));
    expect(players()).toHaveLength(1);
    expect(players()[0]).toHaveAttribute('data-url', cameras[0].streamUrl);

    // Oflayn kamera pleyer ochmaydi — joy egallovchi ko'rsatiladi.
    fireEvent.click(screen.getByTitle(/Kamera 2 —/));
    expect(players()).toHaveLength(1);
    expect(screen.getByText('OFLAYN')).toBeInTheDocument();
  });

  it('klaviatura: 3 — 9 katak, 7 — 1+7', async () => {
    renderWall();
    await loaded();
    fireEvent.keyDown(window, { key: '3' });
    expect(cells()).toHaveLength(9);
    fireEvent.keyDown(window, { key: '7' });
    expect(cells()).toHaveLength(8);
  });

  it("ro'yxat rejimida 25 katakda jonli pleyerlar chegaralanadi, qolgani kadr", async () => {
    renderWall();
    await loaded();
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.click(screen.getByRole('button', { name: "Ro'yxat" }));
    expect(cells()).toHaveLength(25);
    // 25 ta kameradan bittasi oflayn: 16 jonli + 8 kadr.
    expect(players()).toHaveLength(WALL_MAX_LIVE);
    expect(screen.getAllByText('KADR')).toHaveLength(24 - WALL_MAX_LIVE);

    // → keyingi sahifa: qolgan 5 ta kamera.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(players()).toHaveLength(5);
  });

  it('ikki marta bosish — faqat bitta katak (kattalashtirish), Esc — qaytish', async () => {
    renderWall();
    await loaded();
    fireEvent.click(screen.getByTitle(/Kamera 1 —/));
    fireEvent.click(screen.getByTitle(/Kamera 3 —/));
    expect(players()).toHaveLength(2);
    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Kamera 3' }));
    expect(cells()).toHaveLength(1);
    expect(players()).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cells()).toHaveLength(4);
  });

  it('sudrab tashlash kamerani aniq katakka qo‘yadi', async () => {
    renderWall();
    await loaded();
    const target = cells()[3];
    const dataTransfer = {
      types: [DRAG_CAMERA],
      getData: (type: string) => (type === DRAG_CAMERA ? 'cam-5' : ''),
      dropEffect: 'none',
    };
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(within(cells()[3]).getByText('Kamera 5')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('videowall-current') ?? '{}').tiles).toEqual([null, null, null, 'cam-5']);
  });

  it("ko'rinishni saqlaydi va localStorage'ga yozadi", async () => {
    renderWall();
    await loaded();
    fireEvent.click(screen.getByTitle(/Kamera 4 —/));
    fireEvent.click(screen.getByTitle("Saqlangan ko'rinishlar"));
    fireEvent.change(screen.getByLabelText(/yangi ko'rinish sifatida saqlash/i), { target: { value: 'Kirishlar' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    });
    const saved = JSON.parse(localStorage.getItem('videowall-views') ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Kirishlar', layout: '2x2', tiles: ['cam-4', null, null, null] });
  });
});
