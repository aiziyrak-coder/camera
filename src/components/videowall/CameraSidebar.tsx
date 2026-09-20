import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, GripVertical, Layers, ListVideo, Plus, RefreshCw, X } from 'lucide-react';
import { IconButton, SearchInput, Skeleton, StatusDot, Tabs, cn, focusRing } from '../../ui';
import {
  buildingGroups,
  floorGroups,
  isCameraOnline,
  type CameraGroup,
  type WallCameraFilters,
  type WallStatusFilter,
} from '../../lib/videoWall';
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

/** Videodevorning yon paneli — kamera tanlagich.
 *
 * Ikki yo'l bitta panelda:
 * - daraxt: bino → qavat → kamera (avval alohida "Bino va qavat bo'yicha"
 *   ekrani edi; ikkala ekran ham oxir-oqibat jonli kamera ochardi);
 * - qidiruv/holat filtri — nom, zona yoki bino bo'yicha, daraxtning
 *   qaysi darajasida turganidan qat'i nazar.
 *
 * Tanlov `WallCameraFilters`da turadi, shuning uchun devorning "Ro'yxat"
 * rejimi ham aynan shu ro'yxat bo'yicha sahifalaydi. */
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
  const onlineCount = useMemo(() => cameras.filter(isCameraOnline).length, [cameras]);
  const set = (patch: Partial<WallCameraFilters>) => onFiltersChange({ ...filters, ...patch });

  // "Barcha kameralar" — qavatni tanlamay turib binoning butun ro'yxatini
  // ko'rish. Bino almashsa daraxtga qaytamiz.
  const [flat, setFlat] = useState(false);
  useEffect(() => setFlat(false), [filters.building]);

  const searching = filters.search.trim().length > 0;
  const buildings = useMemo(() => buildingGroups(cameras, filters), [cameras, filters]);
  const floors = useMemo(() => (filters.building ? floorGroups(cameras, filters) : []), [cameras, filters]);
  const level: 'binolar' | 'qavatlar' | 'kameralar' =
    searching || flat || filters.floor ? 'kameralar' : filters.building ? 'qavatlar' : 'binolar';

  const crumbClass = (current: boolean) =>
    cn(
      'rounded-control px-1.5 py-0.5 text-[11px] font-medium transition-colors',
      focusRing,
      current ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
    );

  const groupRow = (group: CameraGroup, icon: typeof Building2, onOpen: () => void) => {
    const Icon = icon;
    return (
      <li key={group.key || 'yoq'}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'group flex w-full items-center gap-2 rounded-control px-1.5 py-2 text-left transition-colors hover:bg-surface-2',
            focusRing,
          )}
        >
          <Icon size={15} aria-hidden="true" className="shrink-0 text-subtle group-hover:text-fg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{group.label}</span>
            <span className="block truncate text-xs text-muted">
              {group.total} ta kamera · <span className="text-success">{group.online} tasi tasvir bermoqda</span>
            </span>
          </span>
          <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-subtle group-hover:text-fg" />
        </button>
      </li>
    );
  };

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

      <nav aria-label="Bino va qavat" className="flex flex-wrap items-center gap-0.5">
        <button
          type="button"
          aria-current={level === 'binolar' ? 'page' : undefined}
          onClick={() => {
            setFlat(false);
            set({ building: '', floor: '' });
          }}
          className={crumbClass(level === 'binolar')}
        >
          Barcha binolar
        </button>
        {filters.building && (
          <>
            <ChevronRight size={12} aria-hidden="true" className="text-subtle" />
            <button
              type="button"
              aria-current={level === 'qavatlar' ? 'page' : undefined}
              onClick={() => {
                setFlat(false);
                set({ floor: '' });
              }}
              className={crumbClass(level === 'qavatlar')}
            >
              {filters.building}
            </button>
          </>
        )}
        {filters.building && filters.floor && (
          <>
            <ChevronRight size={12} aria-hidden="true" className="text-subtle" />
            <span aria-current="page" className={crumbClass(true)}>
              {floors.find((floor) => floor.key === filters.floor)?.label ?? filters.floor}
            </span>
          </>
        )}
      </nav>

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

      {level === 'binolar' ? (
        <p className="text-xs text-muted">{buildings.length} ta bino · binoni tanlang</p>
      ) : level === 'qavatlar' ? (
        <p className="text-xs text-muted">{floors.length} ta qavat · qavatni tanlang</p>
      ) : (
        <p className="text-xs text-muted">{filtered.length} ta mos keldi · katakka torting yoki bosing</p>
      )}

      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {loading && cameras.length === 0 &&
          Array.from({ length: 8 }).map((_, index) => (
            <li key={index}>
              <Skeleton className="h-10 w-full" />
            </li>
          ))}

        {level !== 'kameralar' && (
          <li>
            <button
              type="button"
              onClick={() => setFlat(true)}
              className={cn('flex w-full items-center gap-2 rounded-control px-1.5 py-2 text-left text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg', focusRing)}
            >
              <ListVideo size={15} aria-hidden="true" className="shrink-0" />
              {level === 'qavatlar' ? 'Binodagi barcha kameralar' : 'Barcha kameralar'}
              <span className="ml-auto tabular-nums text-xs text-muted">{filtered.length}</span>
            </button>
          </li>
        )}

        {level === 'binolar' &&
          buildings.map((group) =>
            groupRow(group, Building2, () => {
              setFlat(false);
              set({ building: group.key, floor: '' });
            }),
          )}

        {level === 'qavatlar' && floors.map((group) => groupRow(group, Layers, () => set({ floor: group.key })))}

        {level === 'kameralar' &&
          filtered.slice(0, MAX_ROWS).map((camera) => {
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

        {level === 'kameralar' && filtered.length > MAX_ROWS && (
          <li className="px-2 py-1.5 text-center text-xs text-muted">
            Yana {filtered.length - MAX_ROWS} ta — qidiruv yoki filtr bilan toraytiring
          </li>
        )}
        {!loading && level === 'kameralar' && filtered.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-muted">
            {cameras.length === 0 ? "Kameralar ro'yxati bo'sh" : 'Mos kamera topilmadi'}
          </li>
        )}
        {!loading && level === 'binolar' && buildings.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-muted">
            {cameras.length === 0 ? "Kameralar ro'yxati bo'sh" : 'Mos bino topilmadi'}
          </li>
        )}
      </ul>
    </aside>
  );
}
