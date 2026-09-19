/**
 * Qavat rejasi geometriyasi — sof funksiyalar (React'siz), vitest bilan
 * tekshiriladi (floorPlan.test.ts).
 *
 * Koordinata tizimlari:
 * - "reja" (plan): nisbiy 0..1, rasmning chap-yuqori burchagidan. Bazada
 *   aynan shu saqlanadi (cameras.plan_x/plan_y), shuning uchun rasm
 *   almashtirilsa ham, ekran o'lchami o'zgarsa ham kamera joyida qoladi.
 * - "ekran": reja konteynerining chap-yuqori burchagidan CSS pikselda.
 *
 * Ko'rinish (Viewport) — rasm konteynerda qanday turgani: `scale`
 * (1 = rasmning tabiiy o'lchami) va `x`/`y` siljish. Rasm qatlami CSS'da
 * `translate(x, y) scale(scale)` (transform-origin 0 0) bilan chiziladi,
 * markerlar esa ekran koordinatasida — kattalashtirilganda ular
 * kattalashmaydi, faqat joyi o'zgaradi.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

/** Kattalashtirish chegaralari "fit" masshtabiga nisbatan emas, mutlaq:
 *  juda katta chizmada fit 0.05 bo'lishi mumkin, shuning uchun pastki
 *  chegara fit'dan ham kichik bo'lishiga yo'l qo'yiladi (clampScale). */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Reja koordinatasi har doim 0..1 oralig'ida saqlanadi. */
export function clampUnit(point: Point): Point {
  return { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
}

/** Istalgan burchakni butun 0..359 gradusga keltiradi (bazadagi cheklov). */
export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return (((Math.round(degrees) % 360) + 360) % 360) || 0;
}

/** Markazdan ko'rsatkichgacha bo'lgan yo'nalish burchagi: 0° — tepaga
 *  (shimol), soat mili bo'yicha oshadi. Ekranda y pastga o'sgani uchun
 *  atan2 argumentlari shunday tanlangan. */
export function angleBetween(center: Point, pointer: Point): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  if (dx === 0 && dy === 0) return 0;
  return normalizeRotation((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** `angleBetween` ning teskarisi: burchak bo'yicha markazdan `distance`
 *  uzoqlikdagi nuqta (aylantirish tutqichining joyi). */
export function pointAtAngle(center: Point, degrees: number, distance: number): Point {
  const rad = (degrees * Math.PI) / 180;
  return { x: center.x + Math.sin(rad) * distance, y: center.y - Math.cos(rad) * distance };
}

export function clampScale(scale: number, fitScale = MIN_SCALE): number {
  return clamp(scale, Math.min(MIN_SCALE, fitScale), MAX_SCALE);
}

/** Rasmni konteynerga to'liq sig'dirib, markazga qo'yadi. */
export function fitViewport(container: Size, image: Size, padding = 16): Viewport {
  if (image.width <= 0 || image.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const availableW = Math.max(1, container.width - padding * 2);
  const availableH = Math.max(1, container.height - padding * 2);
  const scale = Math.min(availableW / image.width, availableH / image.height, MAX_SCALE);
  return {
    scale,
    x: (container.width - image.width * scale) / 2,
    y: (container.height - image.height * scale) / 2,
  };
}

/** Ekran nuqtasi -> nisbiy reja koordinatasi (cheklanmagan: rasmdan
 *  tashqaridagi nuqta 0..1 dan chiqadi — chaqiruvchi hal qiladi). */
export function screenToPlan(screen: Point, viewport: Viewport, image: Size): Point {
  return {
    x: (screen.x - viewport.x) / (image.width * viewport.scale),
    y: (screen.y - viewport.y) / (image.height * viewport.scale),
  };
}

export function planToScreen(plan: Point, viewport: Viewport, image: Size): Point {
  return {
    x: viewport.x + plan.x * image.width * viewport.scale,
    y: viewport.y + plan.y * image.height * viewport.scale,
  };
}

export function isInsidePlan(plan: Point): boolean {
  return plan.x >= 0 && plan.x <= 1 && plan.y >= 0 && plan.y <= 1;
}

/** `anchor` (ekran nuqtasi, masalan sichqoncha ostidagi joy) qimirlamay
 *  qoladigan qilib masshtabni o'zgartiradi. */
export function zoomAt(viewport: Viewport, nextScale: number, anchor: Point, fitScale?: number): Viewport {
  const scale = clampScale(nextScale, fitScale);
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
}

/** Sichqoncha g'ildiragi -> masshtab ko'paytuvchisi. Eksponensial: har
 *  "chiqish" bir xil nisbatda kattalashtiradi, trackpad'ning mayda
 *  qadamlari ham silliq ishlaydi. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  // deltaMode 1 — qatorlar (Firefox), 2 — sahifalar.
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(clamp(-pixels, -400, 400) * 0.0015);
}

/** Rasm butunlay ko'rinmay ketmasin: har tomondan kamida `margin`
 *  pikseli konteyner ichida qoladi. */
export function clampPan(viewport: Viewport, container: Size, image: Size, margin = 64): Viewport {
  const w = image.width * viewport.scale;
  const h = image.height * viewport.scale;
  const minVisibleX = Math.min(margin, w);
  const minVisibleY = Math.min(margin, h);
  return {
    scale: viewport.scale,
    x: clamp(viewport.x, minVisibleX - w, container.width - minVisibleX),
    y: clamp(viewport.y, minVisibleY - h, container.height - minVisibleY),
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Ikki barmoq bilan kattalashtirish/siljitish: boshlanish holatidagi
 *  barmoqlar ostidagi reja nuqtasi hozirgi barmoqlar ostida qoladi. */
export function pinchViewport(
  start: Viewport,
  startA: Point,
  startB: Point,
  nowA: Point,
  nowB: Point,
  fitScale?: number,
): Viewport {
  const startDistance = Math.max(1, distance(startA, startB));
  const scale = clampScale(start.scale * (distance(nowA, nowB) / startDistance), fitScale);
  const startMid = midpoint(startA, startB);
  const nowMid = midpoint(nowA, nowB);
  // Boshlanishdagi o'rta nuqta ostidagi rasm nuqtasi (rasm pikselida).
  const imageX = (startMid.x - start.x) / start.scale;
  const imageY = (startMid.y - start.y) / start.scale;
  return { scale, x: nowMid.x - imageX * scale, y: nowMid.y - imageY * scale };
}

/** Ko'rish konusi (FOV) uchun SVG yo'li: markaz (cx, cy), tepaga qaragan,
 *  `fovDegrees` kenglikda. Burilish CSS transform bilan qo'shiladi. */
export function fovConePath(cx: number, cy: number, radius: number, fovDegrees = 70): string {
  const half = clamp(fovDegrees, 1, 179) / 2;
  const left = pointAtAngle({ x: cx, y: cy }, -half, radius);
  const right = pointAtAngle({ x: cx, y: cy }, half, radius);
  const f = (n: number) => Number(n.toFixed(2));
  return `M ${f(cx)} ${f(cy)} L ${f(left.x)} ${f(left.y)} A ${f(radius)} ${f(radius)} 0 0 1 ${f(right.x)} ${f(right.y)} Z`;
}

// ---------------------------------------------------------------------------
// Tahrir holati
// ---------------------------------------------------------------------------

/** Kameraning rejadagi joyi; null — rejada yo'q. */
export interface PlanPosition {
  x: number;
  y: number;
  rotation: number | null;
}

export type PositionMap = Record<string, PlanPosition | null>;

export interface PositionUpdate {
  cameraId: string;
  planX: number | null;
  planY: number | null;
  planRotation: number | null;
}

const EPSILON = 1e-6;

function samePosition(a: PlanPosition | null | undefined, b: PlanPosition | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON && (a.rotation ?? null) === (b.rotation ?? null);
}

/** Saqlash uchun faqat o'zgargan kameralar (PUT /api/floor-plans/{id}/cameras). */
export function diffPositions(original: PositionMap, draft: PositionMap): PositionUpdate[] {
  const updates: PositionUpdate[] = [];
  for (const [cameraId, next] of Object.entries(draft)) {
    if (samePosition(original[cameraId], next)) continue;
    updates.push(
      next
        ? {
            cameraId,
            planX: clamp(next.x, 0, 1),
            planY: clamp(next.y, 0, 1),
            planRotation: next.rotation === null ? null : normalizeRotation(next.rotation),
          }
        : { cameraId, planX: null, planY: null, planRotation: null },
    );
  }
  return updates;
}

export function isDirty(original: PositionMap, draft: PositionMap): boolean {
  return diffPositions(original, draft).length > 0;
}

// ---------------------------------------------------------------------------
// Marker holati
// ---------------------------------------------------------------------------

export type MarkerTone = 'online' | 'noVideo' | 'offline';

/** Monitoring devori bilan bir xil ma'no: oflayn — qizil, javob beradi
 *  lekin tasvir yo'q — sariq, hammasi joyida — yashil. */
export function markerTone(camera: { online: boolean; videoFlowing: boolean }): MarkerTone {
  if (!camera.online) return 'offline';
  if (!camera.videoFlowing) return 'noVideo';
  return 'online';
}

export const MARKER_TONE_LABEL: Record<MarkerTone, string> = {
  online: 'Jonli',
  noVideo: "Tasvir yo'q",
  offline: 'Oflayn',
};

/** SVG/inline ranglar — Tailwind palitrasidan (emerald-500, amber-500, red-500). */
export const MARKER_TONE_COLOR: Record<MarkerTone, string> = {
  online: '#10b981',
  noVideo: '#f59e0b',
  offline: '#ef4444',
};

/** Rejadagi kamera tartibi ro'yxatda: avval muammolilar (signal bor,
 *  oflayn, tasvirsiz), keyin nomi bo'yicha. */
export function cameraAttentionRank(camera: { online: boolean; videoFlowing: boolean; openEvents: number }): number {
  if (camera.openEvents > 0) return 0;
  const tone = markerTone(camera);
  return tone === 'offline' ? 1 : tone === 'noVideo' ? 2 : 3;
}
