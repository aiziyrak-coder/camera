import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FloorPlanCanvas, { type CanvasMarker } from './FloorPlanCanvas';

// jsdom'da maket yo'q: konteyner o'lchami 0, ya'ni ko'rinish {scale 1,
// x 0, y 0} bo'lib qoladi — reja nuqtasi (0.5, 0.5) ekranda (500, 250).
const image = { width: 1000, height: 500 };

const marker: CanvasMarker = {
  id: 'cam-1',
  name: 'Kirish',
  zone: 'Foye',
  tone: 'online',
  openEvents: 3,
  pulsing: false,
  ptzEnabled: false,
  position: { x: 0.5, y: 0.5, rotation: 90 },
};

function renderCanvas(overrides: Partial<Parameters<typeof FloorPlanCanvas>[0]> = {}) {
  const props = {
    planKey: 'p1',
    imageUrl: 'https://s3.test/plan.png',
    imageSize: image,
    markers: [marker],
    editing: false,
    selectedId: null,
    placing: false,
    onMarkerActivate: vi.fn(),
    onMarkerMove: vi.fn(),
    onMarkerRotate: vi.fn(),
    onPlaceAt: vi.fn(),
    ...overrides,
  };
  render(<FloorPlanCanvas {...props} />);
  return props;
}

function pointer(el: Element, type: 'pointerDown' | 'pointerMove' | 'pointerUp', x: number, y: number) {
  fireEvent[type](el, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: x, clientY: y });
}

describe('FloorPlanCanvas', () => {
  it('shows the open-events badge and activates a marker on click', () => {
    const props = renderCanvas();
    const button = screen.getByRole('button', { name: /Kirish/ });
    expect(button.textContent).toContain('3');
    pointer(button, 'pointerDown', 500, 250);
    pointer(button, 'pointerUp', 500, 250);
    expect(props.onMarkerActivate).toHaveBeenCalledWith('cam-1');
    expect(props.onMarkerMove).not.toHaveBeenCalled();
  });

  it('does not move markers outside edit mode (drag pans instead)', () => {
    const props = renderCanvas();
    const button = screen.getByRole('button', { name: /Kirish/ });
    pointer(button, 'pointerDown', 500, 250);
    pointer(button, 'pointerMove', 560, 300);
    pointer(button, 'pointerUp', 560, 300);
    expect(props.onMarkerMove).not.toHaveBeenCalled();
    expect(props.onMarkerActivate).not.toHaveBeenCalled();
  });

  it('drags a marker in edit mode, clamped to the plan', () => {
    const props = renderCanvas({ editing: true });
    const button = screen.getByRole('button', { name: /Kirish/ });
    pointer(button, 'pointerDown', 500, 250);
    pointer(button, 'pointerMove', 750, 125);
    expect(props.onMarkerMove).toHaveBeenLastCalledWith('cam-1', { x: 0.75, y: 0.25 });
    pointer(button, 'pointerMove', 5000, -100);
    expect(props.onMarkerMove).toHaveBeenLastCalledWith('cam-1', { x: 1, y: 0 });
    pointer(button, 'pointerUp', 5000, -100);
    expect(props.onMarkerActivate).not.toHaveBeenCalled();
  });

  it('rotates with the handle of the selected marker', () => {
    const props = renderCanvas({ editing: true, selectedId: 'cam-1' });
    const handle = document.querySelector('[data-rotate-id="cam-1"]')!;
    pointer(handle, 'pointerDown', 552, 250);
    pointer(handle, 'pointerMove', 500, 300); // markazdan pastga
    expect(props.onMarkerRotate).toHaveBeenLastCalledWith('cam-1', 180);
  });

  it('places the armed camera where the plan is clicked', () => {
    const props = renderCanvas({ editing: true, placing: true, markers: [] });
    const canvas = screen.getByRole('application');
    pointer(canvas, 'pointerDown', 100, 400);
    pointer(canvas, 'pointerUp', 100, 400);
    expect(props.onPlaceAt).toHaveBeenCalledWith({ x: 0.1, y: 0.8 });
  });

  it('ignores clicks outside the image when placing', () => {
    const props = renderCanvas({ editing: true, placing: true, markers: [] });
    const canvas = screen.getByRole('application');
    pointer(canvas, 'pointerDown', 1200, 100);
    pointer(canvas, 'pointerUp', 1200, 100);
    expect(props.onPlaceAt).not.toHaveBeenCalled();
  });
});
