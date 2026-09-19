import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { ImageOff, Maximize, Minus, Plus } from 'lucide-react';
import {
  angleBetween,
  clampPan,
  clampUnit,
  fitViewport,
  isInsidePlan,
  pinchViewport,
  planToScreen,
  screenToPlan,
  wheelZoomFactor,
  zoomAt,
  type PlanPosition,
  type Point,
  type Size,
  type Viewport,
} from '../../lib/floorPlan';
import CameraMarker, { type MarkerData } from './CameraMarker';

export interface CanvasMarker extends MarkerData {
  position: PlanPosition;
}

export interface FloorPlanCanvasHandle {
  /** Sahifa koordinatasi -> reja nuqtasi; rasmdan tashqarida bo'lsa null. */
  clientToPlan: (clientX: number, clientY: number) => Point | null;
  fit: () => void;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; startVp: Viewport; moved: boolean; markerId: string | null }
  | { kind: 'pinch'; ids: [number, number]; a0: Point; b0: Point; startVp: Viewport }
  | { kind: 'move'; pointerId: number; markerId: string; start: Point; offset: Point; moved: boolean }
  | { kind: 'rotate'; pointerId: number; markerId: string };

// Bosish bilan sudrashni ajratish chegarasi (px) — barmoq ham bosganda
// bir-ikki piksel qimirlaydi.
const DRAG_THRESHOLD = 4;
const BUTTON_ZOOM = 1.35;
const CONTROL_BTN =
  'flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface text-fg shadow-card transition-colors hover:bg-surface-2 hover:text-primary';

export default function FloorPlanCanvas({
  ref,
  planKey,
  imageUrl,
  imageSize,
  markers,
  editing,
  selectedId,
  placing,
  onMarkerActivate,
  onMarkerMove,
  onMarkerRotate,
  onPlaceAt,
  className = '',
}: {
  ref?: Ref<FloorPlanCanvasHandle>;
  /** Reja almashganda ko'rinish qaytadan rasmga sig'diriladi. */
  planKey: string;
  imageUrl: string | null;
  imageSize: Size;
  markers: CanvasMarker[];
  editing: boolean;
  selectedId: string | null;
  /** Ro'yxatdan kamera tanlangan — rejaga bosish uni o'sha joyga qo'yadi. */
  placing: boolean;
  onMarkerActivate: (id: string) => void;
  onMarkerMove?: (id: string, point: Point) => void;
  onMarkerRotate?: (id: string, degrees: number) => void;
  onPlaceAt?: (point: Point) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [imageFailed, setImageFailed] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const containerSizeRef = useRef(container);
  containerSizeRef.current = container;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const fittedFor = useRef<string | null>(null);

  const fitScale = fitViewport(container, imageSize).scale;
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;

  // Konteyner o'lchami — ResizeObserver: yon panel ochilsa/yopilsa ham.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainer({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    setViewport(fitViewport(containerSizeRef.current, imageSize));
  }, [imageSize]);

  // Yangi reja (yoki birinchi o'lchash) — rasmni to'liq ko'rsatamiz.
  useEffect(() => {
    if (container.width === 0 || container.height === 0) return;
    const key = `${planKey}:${imageSize.width}x${imageSize.height}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    setViewport(fitViewport(container, imageSize));
  }, [planKey, imageSize, container]);

  useEffect(() => setImageFailed(false), [imageUrl]);

  const toLocal = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  }, []);

  const setClampedViewport = useCallback(
    (next: Viewport) => setViewport(clampPan(next, containerSizeRef.current, imageSize)),
    [imageSize],
  );

  useImperativeHandle(
    ref,
    () => ({
      clientToPlan(clientX, clientY) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
        const point = screenToPlan(toLocal(clientX, clientY), viewportRef.current, imageSize);
        return isInsidePlan(point) ? point : null;
      },
      fit,
    }),
    [fit, imageSize, toLocal],
  );

  // G'ildirak — passiv bo'lmagan tinglovchi, aks holda preventDefault
  // ishlamaydi va sahifa ham aylanib ketadi.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const anchor = toLocal(e.clientX, e.clientY);
      setClampedViewport(zoomAt(vp, vp.scale * wheelZoomFactor(e.deltaY, e.deltaMode), anchor, fitScaleRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setClampedViewport, toLocal]);

  function zoomBy(factor: number) {
    const center = { x: container.width / 2, y: container.height / 2 };
    setClampedViewport(zoomAt(viewport, viewport.scale * factor, center, fitScale));
  }

  const markerById = useCallback((id: string) => markers.find((m) => m.id === id) ?? null, [markers]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-canvas-control]')) return;
    const local = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, local);
    containerRef.current?.setPointerCapture?.(e.pointerId);

    // Ikkinchi barmoq — har qanday boshqa ishorani to'xtatib, pinch.
    if (pointers.current.size === 2) {
      const [[idA, a], [idB, b]] = [...pointers.current.entries()];
      gesture.current = { kind: 'pinch', ids: [idA, idB], a0: a, b0: b, startVp: viewportRef.current };
      return;
    }
    if (pointers.current.size > 2) return;

    const rotateId = target.closest<HTMLElement>('[data-rotate-id]')?.dataset.rotateId;
    if (rotateId && editing) {
      gesture.current = { kind: 'rotate', pointerId: e.pointerId, markerId: rotateId };
      return;
    }
    const markerId = target.closest<HTMLElement>('[data-marker-id]')?.dataset.markerId ?? null;
    const marker = markerId ? markerById(markerId) : null;
    if (marker && editing) {
      const center = planToScreen(marker.position, viewportRef.current, imageSize);
      gesture.current = {
        kind: 'move',
        pointerId: e.pointerId,
        markerId: marker.id,
        start: local,
        offset: { x: local.x - center.x, y: local.y - center.y },
        moved: false,
      };
      return;
    }
    gesture.current = { kind: 'pan', pointerId: e.pointerId, start: local, startVp: viewportRef.current, moved: false, markerId };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const local = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, local);
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      const a = pointers.current.get(g.ids[0]);
      const b = pointers.current.get(g.ids[1]);
      if (a && b) setClampedViewport(pinchViewport(g.startVp, g.a0, g.b0, a, b, fitScaleRef.current));
      return;
    }
    if (e.pointerId !== g.pointerId) return;

    if (g.kind === 'pan') {
      const dx = local.x - g.start.x;
      const dy = local.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      setClampedViewport({ ...g.startVp, x: g.startVp.x + dx, y: g.startVp.y + dy });
    } else if (g.kind === 'move') {
      if (!g.moved && Math.hypot(local.x - g.start.x, local.y - g.start.y) < DRAG_THRESHOLD) return;
      g.moved = true;
      const point = screenToPlan({ x: local.x - g.offset.x, y: local.y - g.offset.y }, viewportRef.current, imageSize);
      onMarkerMove?.(g.markerId, clampUnit(point));
    } else if (g.kind === 'rotate') {
      const marker = markerById(g.markerId);
      if (!marker) return;
      const center = planToScreen(marker.position, viewportRef.current, imageSize);
      onMarkerRotate?.(g.markerId, angleBetween(center, local));
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const local = pointers.current.get(e.pointerId) ?? toLocal(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      // Bitta barmoq qoldi — qolgan barmoq bilan siljitishni davom ettiramiz.
      const rest = [...pointers.current.entries()][0];
      gesture.current = rest
        ? { kind: 'pan', pointerId: rest[0], start: rest[1], startVp: viewportRef.current, moved: true, markerId: null }
        : null;
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    gesture.current = null;
    if (e.type === 'pointercancel') return;

    if (g.kind === 'move' && !g.moved) onMarkerActivate(g.markerId);
    if (g.kind === 'pan' && !g.moved) {
      if (g.markerId) onMarkerActivate(g.markerId);
      else if (placing && onPlaceAt) {
        const point = screenToPlan(local, viewportRef.current, imageSize);
        if (isInsidePlan(point)) onPlaceAt(point);
      }
    }
  }

  const layerStyle = {
    width: imageSize.width,
    height: imageSize.height,
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
    transformOrigin: '0 0',
  } as const;

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-card border border-border bg-surface-2 ${
        placing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
      } ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="application"
      aria-label="Qavat rejasi: g'ildirak yoki ikki barmoq bilan kattalashtiring, sudrab siljiting"
    >
      <div className="absolute left-0 top-0" style={layerStyle}>
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt="Qavat rejasi"
            draggable={false}
            onError={() => setImageFailed(true)}
            className="pointer-events-none h-full w-full max-w-none rounded-sm bg-white shadow-sm"
          />
        ) : (
          <div className="h-full w-full bg-white" />
        )}
      </div>

      {(!imageUrl || imageFailed) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-xs font-medium text-muted shadow-card">
            <ImageOff size={14} /> Reja rasmini yuklab bo'lmadi — markerlar baribir ko'rsatiladi
          </div>
        </div>
      )}

      {markers.map((marker) => {
        const pos = planToScreen(marker.position, viewport, imageSize);
        return (
          <CameraMarker
            key={marker.id}
            marker={marker}
            x={pos.x}
            y={pos.y}
            rotation={marker.position.rotation}
            selected={marker.id === selectedId}
            editing={editing}
            onKeyboardActivate={() => onMarkerActivate(marker.id)}
          />
        );
      })}

      <div data-canvas-control className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoomBy(BUTTON_ZOOM)} className={CONTROL_BTN} aria-label="Kattalashtirish" title="Kattalashtirish">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => zoomBy(1 / BUTTON_ZOOM)} className={CONTROL_BTN} aria-label="Kichiklashtirish" title="Kichiklashtirish">
          <Minus size={16} />
        </button>
        <button type="button" onClick={fit} className={CONTROL_BTN} aria-label="Ekranga sig'dirish" title="Ekranga sig'dirish">
          <Maximize size={15} />
        </button>
      </div>
      <div data-canvas-control className="pointer-events-none absolute bottom-3 left-3 rounded-control bg-surface/90 px-2 py-1 text-[11px] font-medium tabular-nums text-muted shadow-card">
        {Math.round(viewport.scale * 100)}%
      </div>
      {placing && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg shadow-pop">
          Kamerani qo'yish uchun rejaga bosing
        </div>
      )}
    </div>
  );
}

