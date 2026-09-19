import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Camera as CameraIcon, Compass, GripVertical, MapPinOff, RotateCcw, RotateCw, Save, Undo2 } from 'lucide-react';
import { Badge, Button, cn } from '../../ui';
import { MARKER_TONE_COLOR, MARKER_TONE_LABEL, markerTone, normalizeRotation, type PlanPosition } from '../../lib/floorPlan';
import type { FloorPlanCamera } from '../../lib/floorPlansApi';

const DRAG_THRESHOLD = 5;

interface ListDrag {
  camera: FloorPlanCamera;
  pointerId: number;
  start: { x: number; y: number };
  now: { x: number; y: number };
  moved: boolean;
}

/** Tahrir rejimidagi yon panel: rejaga qo'yilmagan kameralar (sudrab
 *  tashlash yoki tanlab, keyin rejaga bosish), tanlangan kamera
 *  yo'nalishi va Saqlash/Bekor qilish. */
export default function FloorPlanEditPanel({
  unplaced,
  selected,
  selectedPosition,
  placingId,
  dirty,
  changeCount,
  saving,
  onArm,
  onDropAt,
  onRotate,
  onRemove,
  onSave,
  onCancel,
}: {
  unplaced: FloorPlanCamera[];
  selected: FloorPlanCamera | null;
  selectedPosition: PlanPosition | null;
  placingId: string | null;
  dirty: boolean;
  changeCount: number;
  saving: boolean;
  onArm: (id: string | null) => void;
  /** Ro'yxatdan sudralgan kamera qo'yib yuborildi; rejaga tushgan bo'lsa true. */
  onDropAt: (id: string, clientX: number, clientY: number) => boolean;
  onRotate: (id: string, rotation: number | null) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [drag, setDrag] = useState<ListDrag | null>(null);
  const dragRef = useRef<ListDrag | null>(null);

  function startDrag(e: ReactPointerEvent<HTMLElement>, camera: FloorPlanCamera) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next: ListDrag = {
      camera,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      now: { x: e.clientX, y: e.clientY },
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function moveDrag(e: ReactPointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const moved =
      current.moved || Math.hypot(e.clientX - current.start.x, e.clientY - current.start.y) >= DRAG_THRESHOLD;
    const next = { ...current, now: { x: e.clientX, y: e.clientY }, moved };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(e: ReactPointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (e.type === 'pointercancel') return;
    if (!current.moved) {
      // Oddiy bosish — "qo'yish" rejimi: endi rejaga bosish kifoya
      // (sensorli ekranda sudrashdan qulayroq).
      onArm(placingId === current.camera.id ? null : current.camera.id);
      return;
    }
    onDropAt(current.camera.id, e.clientX, e.clientY);
  }

  const rotation = selectedPosition?.rotation ?? null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tahrir rejimi</p>
          {dirty && (
            <Badge tone="warning">{`${changeCount} ta o'zgarish`}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={onSave} className="flex-1">
            Saqlash
          </Button>
          <Button icon={Undo2} onClick={onCancel} disabled={saving}>
            {dirty ? 'Bekor qilish' : 'Chiqish'}
          </Button>
        </div>
      </div>

      {selected && selectedPosition && (
        <div className="space-y-3 rounded-card border border-border bg-surface p-3 shadow-card">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[markerTone(selected)] }} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{selected.name}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[13px] font-medium text-muted">
              <span className="flex items-center gap-1">
                <Compass size={13} /> Qarash yo'nalishi
              </span>
              <span className="tabular-nums">{rotation === null ? 'belgilanmagan' : `${rotation}°`}</span>
            </div>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={rotation ?? 0}
              onChange={(e) => onRotate(selected.id, Number(e.target.value))}
              aria-label="Kamera yo'nalishi (gradus)"
              className="w-full accent-primary"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button size="sm" icon={RotateCcw} aria-label="15 gradus chapga" onClick={() => onRotate(selected.id, normalizeRotation((rotation ?? 0) - 15))}>
                15°
              </Button>
              <Button size="sm" icon={RotateCw} aria-label="15 gradus o'ngga" onClick={() => onRotate(selected.id, normalizeRotation((rotation ?? 0) + 15))}>
                15°
              </Button>
              {rotation !== null && (
                <Button size="sm" variant="ghost" onClick={() => onRotate(selected.id, null)}>
                  Yo&apos;nalishsiz
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">Rejadagi tutqichni sudrab ham burish mumkin.</p>
          </div>
          <Button variant="ghost" size="sm" icon={MapPinOff} fullWidth className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onRemove(selected.id)}>
            Rejadan olib tashlash
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-surface p-3 shadow-card">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Rejaga qo'yilmagan ({unplaced.length})
        </p>
        <p className="mb-2 text-xs leading-snug text-muted">
          Kamerani rejaga sudrab tashlang yoki bosib tanlang, so'ng rejadagi joyiga bosing.
        </p>
        {unplaced.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted">Hamma kamera rejada</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {unplaced.map((camera) => {
              const armed = placingId === camera.id;
              const tone = markerTone(camera);
              return (
                <li key={camera.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => startDrag(e, camera)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onArm(armed ? null : camera.id);
                      }
                    }}
                    className={cn(
                      'flex cursor-grab touch-pan-y items-center gap-2 rounded-control border px-2 py-1.5 text-left transition-colors active:cursor-grabbing focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
                      armed ? 'border-primary/40 bg-primary-soft' : 'border-transparent hover:bg-surface-2',
                    )}
                    title={MARKER_TONE_LABEL[tone]}
                  >
                    <GripVertical size={16} className="shrink-0 touch-none text-subtle" aria-hidden />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{camera.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {camera.zone}
                        {!camera.assigned && ' · qavatga biriktiriladi'}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {drag?.moved &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-fg shadow-pop"
            style={{ left: drag.now.x + 10, top: drag.now.y + 10 }}
          >
            <CameraIcon size={13} /> {drag.camera.name}
          </div>,
          document.body,
        )}
    </div>
  );
}
