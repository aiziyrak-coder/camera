import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CampusOverview from './CampusOverview';
import BuildingFloors from './BuildingFloors';
import CameraThumbnail from './CameraThumbnail';
import FloorCameras from './FloorCameras';
import { api } from '../../../lib/apiClient';
import type { Campus, CameraFeed, CampusBuilding } from '../../../types';

const buildingFixture: CampusBuilding = {
  id: 'b1',
  name: '2-Bino',
  cameras: 5,
  live: 4,
  offline: 1,
  noVideo: 1,
  eventsToday: 2,
  floors: [
    { floor: 1, label: '1-qavat', cameras: 2, live: 2, offline: 0, noVideo: 0, eventsToday: 0 },
    { floor: 2, label: '2-qavat', cameras: 3, live: 2, offline: 1, noVideo: 1, eventsToday: 2 },
    { floor: null, label: 'Qavat belgilanmagan', cameras: 0, live: 0, offline: 0, noVideo: 0, eventsToday: 0 },
  ],
};

const campusFixture: Campus = {
  buildings: [buildingFixture],
  cameras: 5,
  live: 4,
  offline: 1,
  noVideo: 1,
  eventsToday: 2,
  generatedAt: '2026-09-16T08:00:00+00:00',
};

describe('CampusOverview', () => {
  it('binoni va uning qavatlarini ko’rsatadi, yuqori qavat tepada', () => {
    render(
      <CampusOverview campus={campusFixture} loading={false} onOpenBuilding={() => {}} onOpenFloor={() => {}} />,
    );
    expect(screen.getByText('2-Bino')).toBeInTheDocument();
    const floorLabels = screen
      .getAllByTitle(/qavat/i)
      .map((node) => node.textContent?.trim().split(/\s+/)[0]);
    expect(floorLabels[0]).toContain('Qavat');
    expect(screen.getByText('1-qavat')).toBeInTheDocument();
  });

  it('qavat plitasi bosilganda o’sha qavatni ochadi (binoga kirmasdan)', () => {
    const onOpenFloor = vi.fn();
    const onOpenBuilding = vi.fn();
    render(
      <CampusOverview
        campus={campusFixture}
        loading={false}
        onOpenBuilding={onOpenBuilding}
        onOpenFloor={onOpenFloor}
      />,
    );
    fireEvent.click(screen.getByText('2-qavat'));
    expect(onOpenFloor).toHaveBeenCalledTimes(1);
    expect(onOpenFloor.mock.calls[0][1].floor).toBe(2);
    expect(onOpenBuilding).not.toHaveBeenCalled();
  });

  it('bino sarlavhasi butun binoni ochadi', () => {
    const onOpenBuilding = vi.fn();
    render(
      <CampusOverview campus={campusFixture} loading={false} onOpenBuilding={onOpenBuilding} onOpenFloor={() => {}} />,
    );
    fireEvent.click(screen.getByText('2-Bino'));
    expect(onOpenBuilding).toHaveBeenCalledWith(buildingFixture);
  });
});

describe('BuildingFloors', () => {
  it('qavatlarni teskari tartibda (yuqoridan pastga) chizadi', () => {
    render(<BuildingFloors building={buildingFixture} onOpenFloor={() => {}} />);
    const labels = screen.getAllByRole('button').map((node) => node.textContent ?? '');
    expect(labels[0]).toContain('Qavat belgilanmagan');
    expect(labels[1]).toContain('2-qavat');
    expect(labels[2]).toContain('1-qavat');
  });

  it('tasvirsiz va signal belgilari qavat qatorida ko’rinadi', () => {
    render(<BuildingFloors building={buildingFixture} onOpenFloor={() => {}} />);
    expect(screen.getByText('1 tasvirsiz')).toBeInTheDocument();
    expect(screen.getByText('2 signal')).toBeInTheDocument();
  });

  it('kamerasi yo’q binoda nima qilish kerakligini aytadi', () => {
    render(
      <BuildingFloors building={{ ...buildingFixture, floors: [] }} onOpenFloor={() => {}} />,
    );
    expect(screen.getByText(/Bu binoda kamera yo/)).toBeInTheDocument();
  });
});

describe('FloorCameras', () => {
  const cameras: CameraFeed[] = [
    {
      id: 'cam-1',
      name: 'Kirish kamerasi',
      building: '2-Bino',
      zone: 'Kirish',
      status: 'offline',
      floor: 1,
    },
  ];

  function renderGrid(onEdit?: (camera: CameraFeed) => void) {
    const onSelect = vi.fn();
    render(
      <FloorCameras
        cameras={cameras}
        loading={false}
        activeId={null}
        onSelect={onSelect}
        page={1}
        totalPages={1}
        total={1}
        onPageChange={() => {}}
        onEdit={onEdit}
      />,
    );
    return onSelect;
  }

  it('huquq berilmasa tahrirlash tugmasi umuman chizilmaydi', () => {
    renderGrid();
    expect(screen.queryByLabelText(/ma’lumotini to’g’rilash|ma'lumotini to'g'rilash/)).toBeNull();
  });

  it('huquq berilganda kartada tahrirlash tugmasi chiqadi', () => {
    const onEdit = vi.fn();
    renderGrid(onEdit);
    fireEvent.click(screen.getByLabelText("Kirish kamerasi — ma'lumotini to'g'rilash"));
    expect(onEdit).toHaveBeenCalledWith(cameras[0]);
  });

  it('tahrirlash tugmasi kamerani tanlab yubormaydi', () => {
    const onEdit = vi.fn();
    const onSelect = renderGrid(onEdit);
    fireEvent.click(screen.getByLabelText("Kirish kamerasi — ma'lumotini to'g'rilash"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('CameraThumbnail', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kadr');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kadrni token bilan oladi va rasm sifatida chizadi', async () => {
    const blob = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    render(<CameraThumbnail cameraId="cam-1" alt="Kirish kadri" />);
    await waitFor(() => expect(screen.getByAltText('Kirish kadri')).toBeInTheDocument());
    expect(blob).toHaveBeenCalledWith('/api/public/cameras/cam-1/thumbnail');
    expect(screen.getByAltText('Kirish kadri')).toHaveAttribute('src', 'blob:kadr');
  });

  it('kadr hali yo’q bo’lsa xato emas, holat ko’rsatiladi', async () => {
    vi.spyOn(api, 'blob').mockRejectedValue(new Error('404'));
    render(<CameraThumbnail cameraId="cam-2" />);
    await waitFor(() => expect(screen.getByText("Kadr yo'q")).toBeInTheDocument());
  });
});
