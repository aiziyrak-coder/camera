import { useMemo } from 'react';
import { Circle, GripVertical, Plus, RefreshCw, Search, X } from 'lucide-react';
import { floorOptions, isCameraOnline, type WallCameraFilters, type WallStatusFilter } from '../../lib/videoWall';
import type { CameraFeed } from '../../types';
import { DRAG_CAMERA } from './WallTile';

/** Ro'yxat juda uzun bo'lsa DOM'ni og'irlashtirmaslik uchun — qidiruv
 * bilan toraytirish taklif qilinadi. */
const MAX_ROWS = 300;

const STATUS_OPTIONS: Array<{ value: WallStatusFilter; label: string }> = [
  { value: 'all', label: 'Hammasi' },
  { value: 'live', label: 'Onlayn' },
  { value: 'offline', label: 'Oflayn' },
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
}) {
  const buildings = useMemo(
    () => [...new Set(cameras.map((camera) => camera.building).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [cameras],
  );
  const floors = useMemo(() => floorOptions(cameras, filters.building), [cameras, filters.building]);
  const onlineCount = useMemo(() => cameras.filter(isCameraOnline).length, [cameras]);
  const set = (patch: Partial<WallCameraFilters>) => onFiltersChange({ ...filters, ...patch });

  const selectClass =
    'w-full min-w-0 rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-400';

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-2 overflow-hidden rounded-xl bg-slate-900 p-2.5 text-white ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Kameralar</p>
          <p className="text-[11px] text-white/50">
            {cameras.length} ta · <span className="text-emerald-400">{onlineCount} onlayn</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReload}
            aria-label="Ro'yxatni yangilash"
            title="Ro'yxatni yangilash"
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yon panelni yopish"
            title="Yon panelni yopish"
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={filters.search}
          onChange={(event) => set({ search: event.target.value })}
          placeholder="Nom, zona yoki bino..."
          aria-label="Kameralarni qidirish"
          className="w-full rounded-lg border border-white/10 bg-slate-800 py-1.5 pl-8 pr-7 text-xs text-white outline-none placeholder:text-white/35 focus:border-indigo-400"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => set({ search: '' })}
            aria-label="Qidiruvni tozalash"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/50 hover:text-white"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={filters.building}
          onChange={(event) => set({ building: event.target.value, floor: '' })}
          aria-label="Bino"
          className={selectClass}
        >
          <option value="">Barcha binolar</option>
          {buildings.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={filters.floor} onChange={(event) => set({ floor: event.target.value })} aria-label="Qavat" className={selectClass}>
          <option value="">Barcha qavatlar</option>
          {floors.map((floor) => (
            <option key={floor ?? 'none'} value={floor === null ? 'none' : String(floor)}>
              {floor === null ? 'Qavat belgilanmagan' : `${floor}-qavat`}
            </option>
          ))}
        </select>
      </div>

      <div role="tablist" aria-label="Holat" className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filters.status === option.value}
            onClick={() => set({ status: option.value })}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
              filters.status === option.value ? 'bg-indigo-600 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-200">{error}</p>}

      <p className="text-[10px] text-white/40">
        {filtered.length} ta mos keldi · katakka torting yoki bosing
      </p>

      <ul className="-mr-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {loading && cameras.length === 0 &&
          Array.from({ length: 8 }).map((_, index) => <li key={index} className="h-9 animate-pulse rounded-lg bg-white/5" />)}
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
                className={`group flex w-full cursor-grab items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors active:cursor-grabbing ${
                  placed ? 'bg-indigo-500/15' : 'hover:bg-white/5'
                }`}
              >
                <GripVertical size={12} className="shrink-0 text-white/20 group-hover:text-white/50" />
                <Circle
                  size={7}
                  className={`shrink-0 ${
                    online ? 'fill-emerald-400 text-emerald-400' : noVideo ? 'fill-amber-400 text-amber-400' : 'fill-slate-500 text-slate-500'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{camera.name}</span>
                  <span className="block truncate text-[10px] text-white/40">
                    {[camera.building, camera.floor != null ? `${camera.floor}-qavat` : null, camera.zone].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {placed ? (
                  <span className="shrink-0 text-[9px] font-semibold text-indigo-300">DEVORDA</span>
                ) : (
                  <Plus size={13} className="shrink-0 text-white/30 group-hover:text-white" />
                )}
              </button>
            </li>
          );
        })}
        {filtered.length > MAX_ROWS && (
          <li className="px-2 py-1.5 text-center text-[10px] text-white/40">
            Yana {filtered.length - MAX_ROWS} ta — qidiruv yoki filtr bilan toraytiring
          </li>
        )}
        {!loading && filtered.length === 0 && (
          <li className="px-2 py-6 text-center text-[11px] text-white/40">Mos kamera topilmadi</li>
        )}
      </ul>
    </aside>
  );
}
