import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Circle, Loader2, Maximize2, Minimize2, Plus, VideoOff, X } from 'lucide-react';
import LiveVideoPlayer from '../LiveVideoPlayer';
import CameraThumbnail from '../monitor/campus/CameraThumbnail';
import PtzControls from '../ptz/PtzControls';
import { usePtzAvailability } from '../ptz/usePtzAvailability';
import type { TilePlayback } from '../../lib/videoWall';
import type { CameraFeed } from '../../types';

/** Sudrab tashlash ma'lumoti turlari — yon paneldan kamera yoki boshqa katak. */
export const DRAG_CAMERA = 'application/x-videodevor-camera';
export const DRAG_TILE = 'application/x-videodevor-tile';

/** Katak ekranda ko'rinyaptimi — ko'rinmayotgan katak pleyer ochmaydi
 * (masalan kichik oynada devor sahifa ichida qisman scroll bo'lganda). */
function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setInView(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: '50px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

export default function WallTile({
  index,
  cameraId,
  camera,
  playback,
  style,
  startDelayMs,
  selected,
  maximized,
  editable,
  compact,
  pending = false,
  onSelect,
  onToggleMaximize,
  onRemove,
  onDropCamera,
  onDropTile,
}: {
  index: number;
  cameraId: string | null;
  /** null — katak bo'sh YOKI kamera ro'yxatda topilmadi (o'chirilgan). */
  camera: CameraFeed | null;
  playback: TilePlayback;
  style: CSSProperties;
  startDelayMs: number;
  selected: boolean;
  maximized: boolean;
  editable: boolean;
  compact: boolean;
  /** Kameralar ro'yxati hali yuklanmoqda — "topilmadi" deyish erta. */
  pending?: boolean;
  onSelect: (index: number) => void;
  onToggleMaximize: (index: number) => void;
  onRemove: (index: number) => void;
  onDropCamera: (index: number, cameraId: string) => void;
  onDropTile: (from: number, to: number) => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [dragOver, setDragOver] = useState(false);
  const ptzAvailable = usePtzAvailability(maximized && camera && playback === 'live' ? camera.id : null, camera?.ptzEnabled);

  function handleDragOver(event: DragEvent) {
    if (!editable) return;
    const types = event.dataTransfer.types;
    if (types.includes(DRAG_CAMERA) || types.includes(DRAG_TILE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = types.includes(DRAG_TILE) ? 'move' : 'copy';
      setDragOver(true);
    }
  }

  function handleDrop(event: DragEvent) {
    setDragOver(false);
    if (!editable) return;
    event.preventDefault();
    const droppedCamera = event.dataTransfer.getData(DRAG_CAMERA);
    if (droppedCamera) {
      onDropCamera(index, droppedCamera);
      return;
    }
    const from = Number(event.dataTransfer.getData(DRAG_TILE));
    if (Number.isInteger(from) && event.dataTransfer.getData(DRAG_TILE) !== '') onDropTile(from, index);
  }

  const isLive = camera?.status === 'live';
  const noVideo = isLive && camera?.hasVideo === false;
  const showLive = playback === 'live' && inView && Boolean(camera?.streamUrl);

  return (
    <div
      ref={ref}
      style={style}
      role="gridcell"
      aria-label={camera ? camera.name : cameraId ? "Noma'lum kamera" : "Bo'sh katak"}
      tabIndex={-1}
      draggable={editable && Boolean(cameraId) && !maximized}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TILE, String(index));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => onSelect(index)}
      onDoubleClick={() => cameraId && onToggleMaximize(index)}
      className={`group relative min-h-0 min-w-0 overflow-hidden bg-slate-900 outline-none ${
        selected && !maximized ? 'ring-2 ring-inset ring-indigo-400' : ''
      } ${dragOver ? 'ring-2 ring-inset ring-emerald-400' : ''}`}
    >
      {!cameraId && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-white/10 text-white/25">
          <Plus size={compact ? 14 : 20} />
          {!compact && <span className="px-2 text-center text-[10px] font-medium">Kamerani shu yerga torting</span>}
        </div>
      )}

      {cameraId && !camera && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/40">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <VideoOff size={18} />}
          <span className="text-[10px] font-medium">{pending ? 'Yuklanmoqda...' : 'Kamera topilmadi'}</span>
        </div>
      )}

      {camera && showLive && (
        <LiveVideoPlayer
          streamUrl={camera.streamUrl}
          priority
          startDelayMs={startDelayMs}
          fit={maximized ? 'contain' : 'cover'}
        />
      )}

      {camera && (playback === 'snapshot' || (playback === 'live' && !showLive)) && (
        <CameraThumbnail cameraId={camera.id} alt={camera.name} className="h-full w-full" refreshMs={10_000} />
      )}

      {camera && playback === 'offline' && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-900 text-white/40">
          <VideoOff size={compact ? 16 : 24} />
          <span className="text-[10px] font-bold tracking-wide">{noVideo ? 'TASVIRSIZ' : 'OFLAYN'}</span>
        </div>
      )}

      {camera && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent px-2 py-1">
            <Circle
              size={7}
              className={
                isLive && !noVideo ? 'fill-emerald-400 text-emerald-400' : noVideo ? 'fill-amber-400 text-amber-400' : 'fill-slate-500 text-slate-500'
              }
            />
            <span className={`truncate font-semibold text-white ${compact ? 'text-[10px]' : 'text-xs'}`}>{camera.name}</span>
            {playback === 'snapshot' && (
              <span className="ml-auto shrink-0 rounded bg-black/50 px-1 text-[9px] font-medium text-white/60" title="Jonli oqimlar chegarasiga yetildi — kadr har 10 soniyada yangilanadi">
                KADR
              </span>
            )}
          </div>
          {!compact && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[10px] text-white/70">
              {[camera.building, camera.floor != null ? `${camera.floor}-qavat` : null, camera.zone].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      )}

      {cameraId && (
        <div className="absolute right-1 top-1 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMaximize(index);
            }}
            aria-label={maximized ? 'Kichraytirish' : 'Kattalashtirish'}
            title={maximized ? 'Kichraytirish (Esc)' : "Kattalashtirish (ikki marta bosish)"}
            className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {editable && !maximized && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(index);
              }}
              aria-label="Katakdan olib tashlash"
              title="Katakdan olib tashlash"
              className="rounded-md bg-black/60 p-1 text-white hover:bg-rose-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {maximized && camera && ptzAvailable && (
        <PtzControls key={camera.id} cameraId={camera.id} globalKeyboard className="absolute bottom-3 right-3 z-30" />
      )}
    </div>
  );
}
