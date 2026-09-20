import { useMemo } from 'react';
import { GripVertical, Plus, RefreshCw, X } from 'lucide-react';
import { IconButton, SearchInput, Select, Skeleton, StatusDot, Tabs, cn } from '../../ui';
import { floorOptions, isCameraOnline, type WallCameraFilters, type WallStatusFilter } from '../../lib/videoWall';
import type { CameraFeed } from '../../types';
import { DRAG_CAMERA } from './WallTile';

/** Ro'yxat juda uzun bo'lsa DOM'ni og'irlashtirmaslik uchun — qidiruv
 * bilan toraytirish taklif qilinadi. */
const MAX_ROWS = 300;

const STATUS_TABS: Array<{ id: WallStatusFilter; label: string }> = [
  { id: 'all', label: 'Hammasi' },
  { id: 'live', label: 'Tasvir bor' },
  { id: 'offline', label: "Tasvir yo'q" },
];

export default function CameraSidebar({
  cameras,
  filtered,
  filters,
  onFiltersChange,
  onAdd,
  onClose,
  onReload,
  loading,
  error,
  onWall,
  className,
}: {
  cameras: CameraFeed[];
  filtered: CameraFeed[];
  filters: WallCameraFilters;
  onFiltersChange: (next: WallCameraFilters) => void;
  onAdd: (camera: CameraFeed) => void;
  onClose: () => void;
  onReload: () => void;
  loading: boolean;
  error: string | null;
  /** Hozir devorda turgan kameralar — ro'yxatda belgilanadi. */
  onWall: ReadonlySet<string>;
  className?: string;
}) {
  const buildings = useMemo(
    () => [...new Set(cameras.map((camera) => camera.building).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [cameras],
  );
  const floors = useMemo(() => floorOptions(cameras, filters.building), [cameras, filters.building]);
  const onlineCount = useMemo(() => cameras.filter(isCameraOnline).length, [cameras]);
  const set = (patch: Partial<WallCameraFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <aside
      aria-label="Kameralar"
      className={cn('flex h-full w-full shrink-0 flex-col gap-2.5 overflow-hidden rounded-card border border-border bg-surface p-3 text-fg shadow-card md:w-72', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Kameralar</p>
          <p className="text-xs text-muted">
            {cameras.length} ta · <span className="text-success">{onlineCount} tasi tasvir bermoqda</span>
          </p>
        </div>
        <div className="-mr-1 flex items-center">
          <IconButton icon={RefreshCw} size="sm" label="Ro'yxatni yangilash" onClick={onReload} loading={loading && cameras.length > 0} />
          <IconButton icon={X} size="sm" label="Yon panelni yopish" onClick={onClose} />
        </div>
      </div>

      <SearchInput
        size="sm"
        value={filters.search}
        onChange={(search) => set({ search })}
        placeholder="Nom, zona yoki bino..."
        ariaLabel="Kameralarni qidirish"
        className="sm:max-w-none"
      />

      <div className="grid grid-cols-2 gap-1.5">
        <Select
          size="sm"
          value={filters.building}
          onChange={(building) => set({ building, floor: '' })}
          ariaLabel="Bino"
          placeholder="Barcha binolar"
          options={buildings.map((name) => ({ value: name, label: name }))}
          highlightActive
          className="sm:w-full"
        />
        <Select
          size="sm"
          value={filters.floor}
          onChange={(floor) => set({ floor })}
          ariaLabel="Qavat"
          placeholder="Barcha qavatlar"
          options={floors.map((floor) => ({
            value: floor === null ? 'none' : String(floor),
            label: floor === null ? 'Qavat belgilanmagan' : `${floor}-qavat`,
          }))}
          highlightActive
          className="sm:w-full"
        />
      </div>

      <Tabs
        variant="segmented"
        size="sm"
        ariaLabel="Holat"
        tabs={STATUS_TABS}
        value={filters.status}
        onChange={(status) => set({ status })}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
      />

      {error && <p role="alert" className="rounded-control bg-danger-soft px-2.5 py-2 text-xs text-danger">{error}</p>}

      <p className="text-xs text-muted">{filtered.length} ta mos keldi · katakka torting yoki bosing</p>

      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {loading && cameras.length === 0 &&
          Array.from({ length: 8 }).map((_, index) => (
            <li key={index}>
              <Skeleton className="h-10 w-full" />
            </li>
          ))}
        {filtered.slice(0, MAX_ROWS).map((camera) => {
          const online = isCameraOnline(camera);
          const noVideo = camera.status === 'live' && camera.hasVideo === false;
          const placed = onWall.has(camera.id);
          return (
            <li key={camera.id}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_CAMERA, camera.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(camera)}
                title={`${camera.name} — bosing: devorga qo'shish, torting: kerakli katakka`}
                className={cn(
                  'group flex w-full cursor-grab items-center gap-2 rounded-control px-1.5 py-1.5 text-left transition-colors active:cursor-grabbing focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
                  placed ? 'bg-primary-soft' : 'hover:bg-surface-2',
                )}
              >
                <GripVertical size={14} aria-hidden="true" className="shrink-0 text-subtle opacity-60 group-hover:opacity-100" />
                <StatusDot tone={online ? 'success' : noVideo ? 'warning' : 'neutral'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{camera.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[camera.building, camera.floor != null ? `${camera.floor}-qavat` : null, camera.zone].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {placed ? (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">Devorda</span>
                ) : (
                  <Plus size={15} aria-hidden="true" className="shrink-0 text-subtle group-hover:text-fg" />
                )}
              </button>
            </li>
          );
        })}
        {filtered.length > MAX_ROWS && (
          <li className="px-2 py-1.5 text-center text-xs text-muted">
            Yana {filtered.length - MAX_ROWS} ta — qidiruv yoki filtr bilan toraytiring
          </li>
        )}
        {!loading && filtered.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-muted">
            {cameras.length === 0 ? "Kameralar ro'yxati bo'sh" : 'Mos kamera topilmadi'}
          </li>
        )}
      </ul>
    </aside>
  );
}
