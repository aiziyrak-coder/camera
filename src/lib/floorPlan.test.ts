import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  angleBetween,
  cameraAttentionRank,
  clamp,
  clampPan,
  clampUnit,
  diffPositions,
  fitViewport,
  fovConePath,
  isDirty,
  isInsidePlan,
  markerTone,
  normalizeRotation,
  pinchViewport,
  planToScreen,
  pointAtAngle,
  screenToPlan,
  wheelZoomFactor,
  zoomAt,
  type PositionMap,
  type Viewport,
} from './floorPlan';

const image = { width: 2000, height: 1000 };

function close(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('clamp / normalizeRotation', () => {
  it('clamps values and NaN', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
    expect(clampUnit({ x: 1.2, y: -0.1 })).toEqual({ x: 1, y: 0 });
  });

  it('keeps rotation an integer in 0..359', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(359.6)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-0.4)).toBe(0);
    expect(normalizeRotation(725)).toBe(5);
    expect(normalizeRotation(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('angles', () => {
  const c = { x: 100, y: 100 };
  it('0 is up, clockwise', () => {
    expect(angleBetween(c, { x: 100, y: 50 })).toBe(0);
    expect(angleBetween(c, { x: 150, y: 100 })).toBe(90);
    expect(angleBetween(c, { x: 100, y: 150 })).toBe(180);
    expect(angleBetween(c, { x: 50, y: 100 })).toBe(270);
    expect(angleBetween(c, c)).toBe(0);
  });

  it('pointAtAngle is the inverse of angleBetween', () => {
    for (const deg of [0, 45, 90, 135, 200, 315]) {
      expect(angleBetween(c, pointAtAngle(c, deg, 40))).toBe(deg);
    }
    close(pointAtAngle(c, 90, 10), { x: 110, y: 100 });
  });
});

describe('viewport', () => {
  it('fits and centers the image', () => {
    const vp = fitViewport({ width: 1000, height: 1000 }, image, 0);
    expect(vp.scale).toBeCloseTo(0.5);
    expect(vp.x).toBeCloseTo(0);
    expect(vp.y).toBeCloseTo(250);
  });

  it('does not exceed MAX_SCALE for tiny images', () => {
    const vp = fitViewport({ width: 1000, height: 1000 }, { width: 10, height: 10 }, 0);
    expect(vp.scale).toBe(MAX_SCALE);
  });

  it('handles empty sizes', () => {
    expect(fitViewport({ width: 0, height: 0 }, image)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('screenToPlan and planToScreen are inverse under zoom/pan', () => {
    const vp: Viewport = { scale: 1.7, x: -320, y: 45 };
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.25, y: 0.8 },
    ]) {
      close(screenToPlan(planToScreen(p, vp, image), vp, image), p);
    }
    close(screenToPlan({ x: 0, y: 250 }, { scale: 0.5, x: 0, y: 250 }, image), { x: 0, y: 0 });
    close(screenToPlan({ x: 500, y: 500 }, { scale: 0.5, x: 0, y: 250 }, image), { x: 0.5, y: 0.5 });
  });

  it('isInsidePlan', () => {
    expect(isInsidePlan({ x: 0, y: 1 })).toBe(true);
    expect(isInsidePlan({ x: -0.01, y: 0.5 })).toBe(false);
    expect(isInsidePlan({ x: 0.5, y: 1.01 })).toBe(false);
  });

  it('zoomAt keeps the anchor point fixed', () => {
    const vp: Viewport = { scale: 1, x: 10, y: 20 };
    const anchor = { x: 300, y: 200 };
    const before = screenToPlan(anchor, vp, image);
    const next = zoomAt(vp, 2.5, anchor);
    expect(next.scale).toBe(2.5);
    close(screenToPlan(anchor, next, image), before);
  });

  it('zoomAt clamps the scale', () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.0001, { x: 0, y: 0 }).scale).toBeGreaterThan(0);
    // fit juda kichik bo'lsa, undan pastga ham tushsa bo'ladi.
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.005, { x: 0, y: 0 }, 0.005).scale).toBeCloseTo(0.005);
  });

  it('wheelZoomFactor zooms in on negative delta and handles line mode', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48));
    expect(wheelZoomFactor(-100000)).toBeCloseTo(Math.exp(0.6));
  });

  it('clampPan keeps part of the image visible', () => {
    const container = { width: 800, height: 600 };
    const far = clampPan({ scale: 1, x: 5000, y: -5000 }, container, image, 64);
    expect(far.x).toBe(800 - 64);
    expect(far.y).toBe(64 - 1000);
    const ok: Viewport = { scale: 1, x: -100, y: -50 };
    expect(clampPan(ok, container, image)).toEqual(ok);
  });

  it('pinch zoom keeps the plan point under the fingers', () => {
    const start: Viewport = { scale: 1, x: 0, y: 0 };
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 100 };
    const planPoint = screenToPlan({ x: 150, y: 100 }, start, image);
    // Barmoqlar ikki barobar uzoqlashdi va o'ngga siljidi.
    const a1 = { x: 150, y: 120 };
    const b1 = { x: 350, y: 120 };
    const next = pinchViewport(start, a0, b0, a1, b1);
    expect(next.scale).toBeCloseTo(2);
    close(screenToPlan({ x: 250, y: 120 }, next, image), planPoint);
  });
});

describe('fovConePath', () => {
  it('draws a closed wedge pointing up', () => {
    const path = fovConePath(50, 50, 40, 90);
    expect(path.startsWith('M 50 50 L ')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    // Chap va o'ng qirra markazdan yuqorida (y < 50).
    const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums[3]).toBeLessThan(50);
    expect(nums[2]).toBeLessThan(50);
    expect(nums[nums.length - 2]).toBeGreaterThan(50);
  });
});

describe('diffPositions', () => {
  const original: PositionMap = {
    a: { x: 0.1, y: 0.2, rotation: 90 },
    b: { x: 0.5, y: 0.5, rotation: null },
    c: null,
  };

  it('is clean when nothing changed', () => {
    expect(diffPositions(original, { ...original })).toEqual([]);
    expect(isDirty(original, { ...original, a: { x: 0.1 + 1e-9, y: 0.2, rotation: 90 } })).toBe(false);
  });

  it('reports moves, rotations, removals and placements', () => {
    const draft: PositionMap = {
      a: { x: 0.1, y: 0.2, rotation: 450 },
      b: null,
      c: { x: 1.3, y: -1, rotation: null },
      d: { x: 0.3, y: 0.3, rotation: 0 },
    };
    expect(diffPositions(original, draft)).toEqual([
      { cameraId: 'a', planX: 0.1, planY: 0.2, planRotation: 90 },
      { cameraId: 'b', planX: null, planY: null, planRotation: null },
      { cameraId: 'c', planX: 1, planY: 0, planRotation: null },
      { cameraId: 'd', planX: 0.3, planY: 0.3, planRotation: 0 },
    ]);
    expect(isDirty(original, draft)).toBe(true);
  });

  it('treats a missing entry as "not on plan"', () => {
    expect(diffPositions({ x: null }, { x: null, y: null })).toEqual([]);
  });
});

describe('marker tone', () => {
  it('maps health to colors', () => {
    expect(markerTone({ online: true, videoFlowing: true })).toBe('online');
    expect(markerTone({ online: true, videoFlowing: false })).toBe('noVideo');
    expect(markerTone({ online: false, videoFlowing: false })).toBe('offline');
    expect(markerTone({ online: false, videoFlowing: true })).toBe('offline');
  });

  it('ranks cameras needing attention first', () => {
    expect(cameraAttentionRank({ online: true, videoFlowing: true, openEvents: 2 })).toBe(0);
    expect(cameraAttentionRank({ online: false, videoFlowing: false, openEvents: 0 })).toBe(1);
    expect(cameraAttentionRank({ online: true, videoFlowing: false, openEvents: 0 })).toBe(2);
    expect(cameraAttentionRank({ online: true, videoFlowing: true, openEvents: 0 })).toBe(3);
  });
});
