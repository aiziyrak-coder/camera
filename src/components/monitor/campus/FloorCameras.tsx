import { Camera as CameraIcon, ChevronLeft, ChevronRight, Pencil, VideoOff } from 'lucide-react';
import CameraThumbnail from './CameraThumbnail';
import EmptyState from '../../ui/EmptyState';
import { SkeletonBlock } from '../../ui/Skeleton';
import type { CameraFeed } from '../../../types';

/** 3-daraja: qavatdagi kameralar gridi.
 *
 * Har karta — jonli oqim emas, davriy yangilanadigan kadr
 * (CameraThumbnail). Operator kartani bosganda o'sha kamera ustki
 * ko'rinishda jonli ochiladi — bir vaqtning o'zida bitta oqim.
 *
 * Grid sahifalangan: qavatda 50 ta kamera bo'lsa ham bir marta 12 tasi
 * yuklanadi. */
function statusRing(camera: CameraFeed): string {
  if (camera.status !== 'live') return 'ring-slate-300';
  if (camera.hasVideo === false) return 'ring-amber-400';
  return 'ring-emerald-400';
}

export default function FloorCameras({
  cameras,
  loading,
  activeId,
  onSelect,
  page,
  totalPages,
  total,
  onPageChange,
  compact = false,
  emptyHint,
  onEdit,
}: {
  cameras: CameraFeed[];
  loading: boolean;
  activeId: string | null;
  onSelect: (camera: CameraFeed) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
  emptyHint?: string;
  /** Berilsa — kartada ma'lumotni to'g'rilash tugmasi chiqadi (faqat
   *  huquqi borlarga: kamera mas'uli va admin). */
  onEdit?: (camera: CameraFeed) => void;
}) {
  if (loading && cameras.length === 0) {
    return (
      <div className={`grid gap-3 ${compact ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {Array.from({ length: compact ? 6 : 8 }).map((_, index) => (
          <SkeletonBlock key={index} className={compact ? 'h-20 rounded-xl' : 'h-36 rounded-xl'} />
        ))}
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CameraIcon size={18} />}
        title="Bu yerda kamera yo'q"
        description={emptyHint ?? "Qavatni almashtiring yoki kameralarni admin panelida shu qavatga biriktiring."}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        className={`grid min-h-0 gap-3 overflow-y-auto pr-1 ${
          compact ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
        }`}
      >
        {cameras.map((camera) => {
          const active = camera.id === activeId;
          return (
            // Qalam tugmasi kartaning ICHIDA emas, yonida: tugma ichiga
            // tugma joylash HTML qoidasini buzadi va bosish hodisasi
            // chalkashadi.
            <div key={camera.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(camera)}
              aria-pressed={active}
              className={`group w-full overflow-hidden rounded-xl bg-white/70 text-left ring-2 transition hover:-translate-y-0.5 hover:shadow-md ${
                active ? 'ring-indigo-500' : statusRing(camera)
              }`}
            >
              <span className="relative block">
                {camera.status === 'live' ? (
                  <CameraThumbnail
                    cameraId={camera.id}
                    alt={`${camera.name} kadri`}
                    className={compact ? 'h-16 w-full' : 'aspect-video w-full'}
                  />
                ) : (
                  <span
                    className={`flex w-full items-center justify-center bg-slate-800 text-white/40 ${
                      compact ? 'h-16' : 'aspect-video'
                    }`}
                  >
                    <VideoOff size={compact ? 14 : 20} />
                  </span>
                )}
                <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      camera.status !== 'live'
                        ? 'bg-slate-400'
                        : camera.hasVideo === false
                          ? 'bg-amber-400'
                          : 'animate-pulse bg-emerald-400'
                    }`}
                  />
                  {camera.status !== 'live' ? 'oflayn' : camera.hasVideo === false ? 'tasvirsiz' : 'jonli'}
                </span>
              </span>
              <span className="block px-2 py-1.5">
                <span className="block truncate text-[11px] font-bold text-slate-800 group-hover:text-indigo-700">
                  {camera.name}
                </span>
                {!compact && (
                  <span className="block truncate text-[10px] text-slate-500">{camera.zone}</span>
                )}
              </span>
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(camera)}
                title="Kamera ma'lumotini to'g'rilash"
                aria-label={`${camera.name} — ma'lumotini to'g'rilash`}
                className="absolute right-1.5 top-1.5 rounded-lg bg-black/55 p-1.5 text-white/80 opacity-80 transition hover:bg-indigo-600 hover:text-white hover:opacity-100"
              >
                <Pencil size={12} />
              </button>
            )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
          <span className="tabular-nums">
            {total} ta kameradan {(page - 1) * cameras.length + 1}–{(page - 1) * cameras.length + cameras.length}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-white/70 bg-white/70 p-1 disabled:opacity-40"
              aria-label="Oldingi sahifa"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-white/70 bg-white/70 p-1 disabled:opacity-40"
              aria-label="Keyingi sahifa"
            >
              <ChevronRight size={14} />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
