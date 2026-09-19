import { Camera as CameraIcon, ChevronLeft, ChevronRight, Pencil, VideoOff } from 'lucide-react';
import CameraThumbnail from './CameraThumbnail';
import { EmptyState, IconButton, Skeleton, cn } from '../../../ui';
import type { CameraFeed } from '../../../types';

/** 3-daraja: qavatdagi kameralar gridi.
 *
 * Har karta — jonli oqim emas, davriy yangilanadigan kadr
 * (CameraThumbnail). Operator kartani bosganda o'sha kamera ustki
 * ko'rinishda jonli ochiladi — bir vaqtning o'zida bitta oqim.
 *
 * Grid sahifalangan: qavatda 50 ta kamera bo'lsa ham bir marta 12 tasi
 * yuklanadi. */
function cameraState(camera: CameraFeed): { label: string; dot: string; ring: string } {
  if (camera.status !== 'live') return { label: 'oflayn', dot: 'bg-subtle', ring: 'border-border' };
  if (camera.hasVideo === false) return { label: 'tasvirsiz', dot: 'bg-warning', ring: 'border-warning/50' };
  return { label: 'jonli', dot: 'bg-success animate-pulse motion-reduce:animate-none', ring: 'border-border' };
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
  const gridClass = compact ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

  if (loading && cameras.length === 0) {
    return (
      <div className={cn('grid gap-3', gridClass)} aria-busy="true" aria-label="Yuklanmoqda">
        {Array.from({ length: compact ? 6 : 8 }).map((_, index) => (
          <Skeleton key={index} className={compact ? 'h-24 rounded-card' : 'aspect-[4/3] rounded-card'} />
        ))}
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <EmptyState
        compact
        icon={CameraIcon}
        title="Bu yerda kamera yo'q"
        description={emptyHint ?? "Qavatni almashtiring yoki kameralarni «Sozlamalar → Kameralar» bo'limida shu qavatga biriktiring."}
      />
    );
  }

  const first = (page - 1) * cameras.length + 1;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className={cn('grid gap-3', gridClass)}>
        {cameras.map((camera) => {
          const active = camera.id === activeId;
          const state = cameraState(camera);
          return (
            // Qalam tugmasi kartaning ICHIDA emas, yonida: tugma ichiga
            // tugma joylash HTML qoidasini buzadi va bosish hodisasi chalkashadi.
            <div key={camera.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(camera)}
                aria-pressed={active}
                className={cn(
                  'w-full overflow-hidden rounded-card border bg-surface text-left shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
                  active ? 'border-primary ring-2 ring-primary/40' : state.ring,
                )}
              >
                <span className="relative block">
                  {camera.status === 'live' ? (
                    <CameraThumbnail cameraId={camera.id} alt={`${camera.name} kadri`} className={compact ? 'h-16 w-full' : 'aspect-video w-full'} />
                  ) : (
                    <span className={cn('flex w-full items-center justify-center bg-neutral-900 text-white/40', compact ? 'h-16' : 'aspect-video')}>
                      <VideoOff size={compact ? 14 : 20} aria-hidden="true" />
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <span className={cn('h-1.5 w-1.5 rounded-full', state.dot)} aria-hidden="true" />
                    {state.label}
                  </span>
                </span>
                <span className="block px-2.5 py-2">
                  <span className={cn('block truncate text-[13px] font-medium', active ? 'text-primary' : 'text-fg')}>{camera.name}</span>
                  {!compact && <span className="block truncate text-xs text-muted">{camera.zone}</span>}
                </span>
              </button>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(camera)}
                  title="Kamera ma'lumotini to'g'rilash"
                  aria-label={`${camera.name} — ma'lumotini to'g'rilash`}
                  className="absolute right-1.5 top-1.5 rounded-control bg-black/55 p-1.5 text-white/85 opacity-90 transition hover:bg-primary hover:text-primary-fg hover:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60"
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-2 text-[13px] text-muted">
          <span className="tabular-nums">
            {total} ta kameradan {first}–{first + cameras.length - 1}
          </span>
          <span className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} size="sm" variant="secondary" label="Oldingi sahifa" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
            <span className="px-1 tabular-nums">
              {page} / {totalPages}
            </span>
            <IconButton icon={ChevronRight} size="sm" variant="secondary" label="Keyingi sahifa" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
          </span>
        </div>
      )}
    </div>
  );
}
