import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cpu, DoorOpen, Eye, FileUp, Layers, MapPin, MapPinned, Plus, Settings2, Video, VideoOff, Wrench } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import AddCameraModal from '../../components/admin/AddCameraModal';
import CameraImportModal from '../../components/admin/CameraImportModal';
import CameraConfigDetailModal from '../../components/admin/CameraConfigDetailModal';
import CameraModulesModal from '../../components/admin/CameraModulesModal';
import CameraZoneModal from '../../components/admin/CameraZoneModal';
import CameraLocationModal from '../../components/admin/CameraLocationModal';
import CameraLocationEditModal from '../../components/admin/CameraLocationEditModal';
import CameraRolesImportModal from '../../components/admin/CameraRolesImportModal';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SelectFilter from '../../components/ui/SelectFilter';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/apiClient';
import { formatModuleSummary } from '../../lib/cameraModules';
import { ROOM_TYPE_LABELS, ROOM_TYPE_OPTIONS } from '../../lib/cameraRoles';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useCameraModuleOptions } from '../../lib/useCameraModuleOptions';
import { useServerPage } from '../../lib/useServerPage';
import { useBuildings } from '../../lib/useBuildings';
import { useCameraZones } from '../../lib/useCameraZones';
import type { CameraConfig, CameraSummary } from '../../types';

const STATUS_TONE: Record<CameraConfig['status'], 'green' | 'slate' | 'amber'> = {
  faol: 'green',
  nofaol: 'slate',
  tamirda: 'amber',
};

const STATUS_LABEL: Record<CameraConfig['status'], string> = {
  faol: 'Faol',
  nofaol: 'Nofaol',
  tamirda: "Ta'mirda",
};

type StatusFilter = 'barchasi' | CameraConfig['status'];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'barchasi', label: 'Barchasi' },
  { value: 'faol', label: 'Faol' },
  { value: 'nofaol', label: 'Nofaol' },
  { value: 'tamirda', label: "Ta'mirda" },
];

const UNASSIGNED_FLOOR = 'none';
const PAGE_SIZE = 10;

export default function CamerasZonesPage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  /** Kamera mas'uli faqat joylashuvni to'g'rilaydi: kamera qo'shish,
   * o'chirish, zona chizish va modul biriktirish unga ko'rinmaydi —
   * backend ham ularni rad etadi (editCameraLocation huquqi). */
  const canManage = can('manageCameras', role);
  const { buildings } = useBuildings();
  const { modules: moduleOptions } = useCameraModuleOptions();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('barchasi');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [editing, setEditing] = useState<CameraConfig | null>(null);
  // Xona turi/raqami — har kim uchun joylashuv oynasi (to'liq sozlama
  // oynasida bu maydonlar yo'q, u ulanishni tahrirlaydi).
  const [locating, setLocating] = useState<CameraConfig | null>(null);
  const [viewing, setViewing] = useState<CameraConfig | null>(null);
  const [drawingZone, setDrawingZone] = useState<CameraConfig | null>(null);
  const [drawingDoor, setDrawingDoor] = useState<CameraConfig | null>(null);
  const [editingModules, setEditingModules] = useState<CameraConfig | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locationOpen, setLocationOpen] = useState(false);

  const [summary, setSummary] = useState<CameraSummary | null>(null);
  const { zones } = useCameraZones(buildingFilter || undefined);

  const {
    items: cameras,
    page,
    setPage,
    totalPages,
    total,
    pageSize,
    loading,
    error,
    reload,
  } = useServerPage<CameraConfig>(
    '/api/cameras',
    {
      status: statusFilter === 'barchasi' ? undefined : statusFilter,
      building: buildingFilter || undefined,
      zone: zoneFilter || undefined,
      floor: floorFilter || undefined,
      roomType: roomTypeFilter || undefined,
      search: search.trim() || undefined,
    },
    PAGE_SIZE,
  );

  /** Ko'rsatkichlar — bitta so'rov. Ilgari ular har ro'yxat yangilanganda
   * uchta qo'shimcha so'rov bilan olinardi (`?status=...&pageSize=1`). */
  const loadSummary = useCallback(
    (signal?: AbortSignal) => {
      if (!token) return;
      api
        .get<CameraSummary>('/api/cameras/summary', token, { signal })
        .then(setSummary)
        .catch(() => {
          /* ko'rsatkichlarsiz ham sahifa ishlaydi */
        });
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  // Filtr o'zgarsa tanlov bekor qilinadi: ko'rinmayotgan kameraga
  // ommaviy amal qo'llash kutilmagan natija beradi.
  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, buildingFilter, floorFilter, zoneFilter, roomTypeFilter, search, page]);

  const floorOptions = useMemo(() => {
    const selectedBuilding = buildings.find((b) => b.name === buildingFilter);
    const highest = Math.max(
      selectedBuilding?.floors ?? 0,
      ...buildings.map((b) => b.floors ?? 0),
      5,
    );
    const options = Array.from({ length: highest }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1}-qavat`,
    }));
    return [...options, { value: UNASSIGNED_FLOOR, label: 'Qavat belgilanmagan' }];
  }, [buildings, buildingFilter]);

  const activeFilters =
    (statusFilter === 'barchasi' ? 0 : 1) +
    (buildingFilter ? 1 : 0) +
    (floorFilter ? 1 : 0) +
    (zoneFilter ? 1 : 0) +
    (roomTypeFilter ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setStatusFilter('barchasi');
    setBuildingFilter('');
    setFloorFilter('');
    setZoneFilter('');
    setRoomTypeFilter('');
    setSearch('');
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const everySelected = cameras.every((camera) => prev.has(camera.id));
      const next = new Set(prev);
      for (const camera of cameras) {
        if (everySelected) next.delete(camera.id);
        else next.add(camera.id);
      }
      return next;
    });
  }

  function handleModulesSaved(saved: CameraConfig) {
    reload();
    if (viewing?.id === saved.id) setViewing(saved);
  }

  return (
    <section className="glass p-6">
      <PageHeader
        title="Kameralar va Zonalar"
        subtitle="RTSP kamera konfiguratsiyasi, qavat, zona va AI modul bog‘lanishi"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setRolesOpen(true)} className="btn-glass flex items-center gap-1.5">
              <DoorOpen size={14} />
              Xona turlari (CSV)
            </button>
            {canManage && (
              <>
                <button onClick={() => setImportOpen(true)} className="btn-glass flex items-center gap-1.5">
                  <FileUp size={14} />
                  SADP&apos;dan import
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700"
                >
                  <Plus size={14} />
                  Yangi kamera qo&apos;shish
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Video size={20} />} value={summary?.faol ?? '—'} label="Faol kameralar" tone="green" />
        <StatCard icon={<VideoOff size={20} />} value={summary?.nofaol ?? '—'} label="Nofaol kameralar" tone="slate" />
        <StatCard icon={<Wrench size={20} />} value={summary?.tamirda ?? '—'} label="Ta'mirda" tone="amber" />
        <button
          type="button"
          onClick={() => setFloorFilter(UNASSIGNED_FLOOR)}
          title="Qavati belgilanmagan kameralarni ko'rish"
          className="text-left transition hover:-translate-y-0.5"
        >
          <StatCard
            icon={<Layers size={20} />}
            value={summary?.withoutFloor ?? '—'}
            label="Qavatsiz kameralar"
            tone={summary && summary.withoutFloor > 0 ? 'amber' : 'slate'}
          />
        </button>
      </div>

      <FilterBar activeCount={activeFilters} onReset={resetFilters}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Nom, zona yoki IP bo'yicha qidirish..."
          ariaLabel="Kameralarni qidirish"
        />
        <SegmentedControl
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Holat bo'yicha filtr"
          size="sm"
        />
        <SelectFilter
          label="Bino"
          value={buildingFilter}
          onChange={(value) => {
            setBuildingFilter(value);
            setZoneFilter('');
          }}
          options={buildings.map((b) => ({ value: b.name, label: b.name }))}
        />
        <SelectFilter label="Qavat" value={floorFilter} onChange={setFloorFilter} options={floorOptions} />
        <SelectFilter
          label="Xona turi"
          value={roomTypeFilter}
          onChange={setRoomTypeFilter}
          options={[...ROOM_TYPE_OPTIONS, { value: 'none', label: 'Belgilanmagan' }]}
        />
      </FilterBar>

      {zones.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center px-1 font-semibold uppercase tracking-wide text-slate-400">
            Xona/Zona:
          </span>
          {zones.map((z) => (
            <button
              key={z.zone}
              onClick={() => setZoneFilter((cur) => (cur === z.zone ? '' : z.zone))}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                zoneFilter === z.zone ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
              }`}
            >
              {z.zone} ({z.cameraCount})
            </button>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5">
          <span className="text-xs font-bold text-indigo-800">{selected.size} ta kamera tanlandi</span>
          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
          >
            <MapPin size={13} />
            Bino/qavat belgilash
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-indigo-700 hover:underline"
          >
            Tanlovni bekor qilish
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && cameras.length === 0 ? (
        <SkeletonTable rows={6} columns={7} />
      ) : cameras.length === 0 ? (
        <EmptyState
          icon={<Video size={18} />}
          title="Filtrlarga mos kamera topilmadi"
          description="Qidiruv yoki filtrlarni o'zgartiring."
          action={
            activeFilters > 0 ? (
              <button type="button" onClick={resetFilters} className="btn-glass text-xs">
                Filtrlarni tozalash
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Sahifadagi barcha kameralarni tanlash"
                    checked={cameras.length > 0 && cameras.every((camera) => selected.has(camera.id))}
                    onChange={toggleAllOnPage}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-4 py-3">Kamera nomi</th>
                <th className="px-4 py-3">IP / RTSP</th>
                <th className="px-4 py-3">Bino</th>
                <th className="px-4 py-3">Qavat</th>
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3">Xona turi</th>
                <th className="px-4 py-3">AI modullar</th>
                <th className="px-4 py-3">Ruxsat / FPS</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Aloqa</th>
                <th className="px-4 py-3">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {cameras.map((c) => {
                const moduleSummary = moduleOptions.length > 0 ? formatModuleSummary(moduleOptions, c) : '—';
                const hasCustomModules = (c.excludedModuleCodes?.length ?? 0) > 0;
                return (
                  <tr key={c.id} className="transition-colors hover:bg-white/40">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${c.name} kamerasini tanlash`}
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.ip}</td>
                    <td className="px-4 py-3 text-slate-600">{c.building}</td>
                    <td className="px-4 py-3">
                      {c.floor === null || c.floor === undefined ? (
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          title="Qavatni belgilash"
                          className="text-xs font-semibold text-amber-600 hover:underline"
                        >
                          belgilanmagan
                        </button>
                      ) : (
                        <span className="text-slate-600 tabular-nums">{c.floor}-qavat</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.zone}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setLocating(c)}
                        title="Xona turini belgilash"
                        className={`text-left text-xs hover:underline ${
                          c.effectiveRoomType ? 'text-slate-600' : 'font-semibold text-amber-600'
                        }`}
                      >
                        {c.effectiveRoomType ? (
                          <>
                            {ROOM_TYPE_LABELS[c.effectiveRoomType]}
                            {c.roomCode ? ` · ${c.roomCode}` : ''}
                            {!c.roomType && <span className="text-slate-400"> (bayroqdan)</span>}
                          </>
                        ) : (
                          'belgilanmagan'
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditingModules(c)}
                          title="AI modullarni sozlash"
                          className={`text-xs font-semibold hover:underline ${
                            hasCustomModules ? 'text-amber-600' : 'text-slate-600'
                          }`}
                        >
                          {moduleSummary}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">{moduleSummary}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.resolution} / {c.fps ? `${c.fps} fps` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== 'faol' ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span
                          title={
                            c.isReachable
                              ? 'Kamera oxirgi tekshiruvda topildi'
                              : "Kamera hozircha javob bermayapti — kabel/tarmoq muammosi bo'lishi mumkin"
                          }
                          className={`flex items-center gap-1.5 text-xs font-semibold ${
                            c.isReachable ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${c.isReachable ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {c.isReachable ? 'Ulangan' : "Javob yo'q"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => setViewing(c)}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          <Eye size={12} />
                          Ko&apos;rish
                        </button>
                        <button
                          onClick={() => setEditing(c)}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          <Settings2 size={12} />
                          Sozlash
                        </button>
                        {c.effectiveRoomType === 'kirish' && (
                          <button
                            onClick={() => setDrawingDoor(c)}
                            title="Eshik hududi — AI yuzni faqat shu yerda qidiradi"
                            className={`flex items-center gap-1 text-xs font-semibold hover:underline ${
                              c.faceRoi && c.faceRoi.length > 0 ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            <DoorOpen size={12} />
                            Eshik
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => setDrawingZone(c)}
                              title="Taqiqlangan zonani belgilash"
                              className={`flex items-center gap-1 text-xs font-semibold hover:underline ${
                                c.restrictedZonePolygon && c.restrictedZonePolygon.length > 0
                                  ? 'text-red-600'
                                  : 'text-indigo-600'
                              }`}
                            >
                              <MapPinned size={12} />
                              Zona
                            </button>
                            <button
                              onClick={() => setEditingModules(c)}
                              title="AI modullarni sozlash"
                              className={`flex items-center gap-1 text-xs font-semibold hover:underline ${
                                hasCustomModules ? 'text-amber-600' : 'text-indigo-600'
                              }`}
                            >
                              <Cpu size={12} />
                              Modullar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
          </div>
        </div>
      )}

      <AddCameraModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(cam) => {
          reload();
          loadSummary();
          setEditingModules(cam);
        }}
      />
      {/* Tahrirlash tugmasi huquqqa qarab ikki xil oyna ochadi: to'liq
          sozlama (admin) yoki faqat joylashuv (kamera mas'uli). */}
      {canManage ? (
        <AddCameraModal
          open={!!editing}
          camera={editing}
          onClose={() => setEditing(null)}
          onSave={() => {
            reload();
            loadSummary();
          }}
        />
      ) : (
        <CameraLocationEditModal
          camera={editing}
          onClose={() => setEditing(null)}
          onSave={() => {
            reload();
            loadSummary();
          }}
        />
      )}
      <CameraLocationEditModal
        camera={locating}
        onClose={() => setLocating(null)}
        onSave={() => {
          reload();
          loadSummary();
        }}
      />
      <CameraImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => reload()} />
      <CameraRolesImportModal open={rolesOpen} onClose={() => setRolesOpen(false)} onDone={() => reload()} />
      <CameraConfigDetailModal
        camera={viewing}
        onClose={() => setViewing(null)}
        onEditModules={() => {
          if (viewing) setEditingModules(viewing);
        }}
      />
      <CameraZoneModal
        open={!!drawingZone}
        camera={drawingZone}
        onClose={() => setDrawingZone(null)}
        onSave={() => reload()}
      />
      <CameraZoneModal
        mode="faceRoi"
        open={!!drawingDoor}
        camera={drawingDoor}
        onClose={() => setDrawingDoor(null)}
        onSave={() => reload()}
      />
      <CameraModulesModal
        open={!!editingModules}
        camera={editingModules}
        onClose={() => setEditingModules(null)}
        onSave={handleModulesSaved}
      />
      <CameraLocationModal
        open={locationOpen}
        cameraIds={[...selected]}
        onClose={() => setLocationOpen(false)}
        onSaved={(updated) => {
          setSelected(new Set());
          reload();
          loadSummary();
          toast.success(`${updated} ta kameraning joylashuvi yangilandi`);
        }}
      />
    </section>
  );
}
