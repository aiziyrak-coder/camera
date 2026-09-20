import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cpu, DoorOpen, Eye, FileUp, Layers, MapPin, MapPinned, Plus, Settings2, Video, VideoOff, Wrench, type LucideIcon } from 'lucide-react';
import AddCameraModal from '../../components/admin/AddCameraModal';
import CameraImportModal from '../../components/admin/CameraImportModal';
import CameraConfigDetailModal from '../../components/admin/CameraConfigDetailModal';
import CameraModulesModal from '../../components/admin/CameraModulesModal';
import CameraZoneModal from '../../components/admin/CameraZoneModal';
import CameraLocationModal from '../../components/admin/CameraLocationModal';
import CameraLocationEditModal from '../../components/admin/CameraLocationEditModal';
import CameraRolesImportModal from '../../components/admin/CameraRolesImportModal';
import { Checkbox, pagerFooter } from '../../components/settings/kit';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Page,
  StatTile,
  StatusDot,
  TONE_TEXT,
  FilterBar,
  filterActiveCount,
  resetFilterFields,
  cn,
  focusRing,
  formatNumber,
  useToast,
  type DataTableColumn,
  type FilterFieldEntry,
  type Tone,
} from '../../ui';
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

const CAMERA_STATUS_TONE: Record<CameraConfig['status'], Tone> = {
  faol: 'success',
  nofaol: 'neutral',
  tamirda: 'warning',
};

const CAMERA_STATUS_LABEL: Record<CameraConfig['status'], string> = {
  faol: 'Faol',
  nofaol: 'Nofaol',
  tamirda: "Ta'mirda",
};

const STATUS_OPTIONS: { value: CameraConfig['status']; label: string }[] = [
  { value: 'faol', label: 'Faol' },
  { value: 'nofaol', label: 'Nofaol' },
  { value: 'tamirda', label: "Ta'mirda" },
];

const ROOM_FILTER_OPTIONS = [...ROOM_TYPE_OPTIONS, { value: 'none', label: 'Belgilanmagan' }];

const UNASSIGNED_FLOOR = 'none';
const PAGE_SIZE = 10;

/** Qator oxiridagi kichik amal tugmasi: ikonka rangi holatni bildiradi
 *  (masalan zona chizilgan — danger, modullar maxsus — warning). */
function RowAction({ icon: Icon, label, title, tone, onClick }: { icon: LucideIcon; label: string; title?: string; tone?: Tone; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={title ? `${label} — ${title}` : label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-surface-2',
        tone ? TONE_TEXT[tone] : 'text-muted hover:text-fg',
        focusRing,
      )}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

/** Jadval katagidagi bosiladigan matn (masalan "belgilanmagan"). */
function CellLink({ children, title, tone, onClick }: { children: ReactNode; title: string; tone?: Tone; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn(
        'inline-block max-w-[13rem] truncate rounded align-middle text-left text-[13px] hover:underline',
        tone ? cn('font-medium', TONE_TEXT[tone]) : 'text-fg',
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

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

  const [statusFilter, setStatusFilter] = useState('');
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
      status: statusFilter || undefined,
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

  const zoneOptions = useMemo(() => {
    const options = zones.map((z) => ({ value: z.zone, label: `${z.zone} (${z.cameraCount})` }));
    // Tanlangan zona boshqa bino tanlanganda ro'yxatdan tushib qolsa ham ko'rinsin.
    if (zoneFilter && !zones.some((z) => z.zone === zoneFilter)) options.unshift({ value: zoneFilter, label: zoneFilter });
    return options;
  }, [zones, zoneFilter]);

  const filterFields: FilterFieldEntry[] = [
    {
      kind: 'search',
      value: search,
      onChange: setSearch,
      placeholder: "Nom, zona yoki IP bo'yicha…",
      ariaLabel: 'Kameralarni qidirish',
    },
    {
      kind: 'select',
      value: statusFilter,
      onChange: setStatusFilter,
      options: STATUS_OPTIONS,
      placeholder: 'Barcha holatlar',
      ariaLabel: "Holat bo'yicha filtr",
    },
    {
      kind: 'select',
      value: buildingFilter,
      // Bino almashsa zona filtri ma'nosini yo'qotadi.
      onChange: (value) => {
        setBuildingFilter(value);
        setZoneFilter('');
      },
      options: buildings.map((b) => ({ value: b.name, label: b.name })),
      placeholder: 'Barcha binolar',
      ariaLabel: "Bino bo'yicha filtr",
    },
    {
      kind: 'select',
      value: floorFilter,
      onChange: setFloorFilter,
      options: floorOptions,
      placeholder: 'Barcha qavatlar',
      ariaLabel: "Qavat bo'yicha filtr",
    },
    {
      kind: 'select',
      value: roomTypeFilter,
      onChange: setRoomTypeFilter,
      options: ROOM_FILTER_OPTIONS,
      placeholder: 'Barcha xona turlari',
      ariaLabel: "Xona turi bo'yicha filtr",
    },
    zoneOptions.length > 0 && {
      kind: 'select',
      value: zoneFilter,
      onChange: setZoneFilter,
      options: zoneOptions,
      placeholder: 'Barcha zonalar',
      ariaLabel: "Xona/zona bo'yicha filtr",
      className: 'sm:max-w-[16rem]',
    },
  ];
  const activeFilters = filterActiveCount(filterFields);

  function resetFilters() {
    resetFilterFields(filterFields);
    // Zona tanlagichi bino o'zgarganda ro'yxatdan chiqib ketishi mumkin —
    // ko'rinmasa ham qiymati qolib ketmasin.
    setZoneFilter('');
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

  function afterLocationChange() {
    reload();
    loadSummary();
  }

  const allOnPageSelected = cameras.length > 0 && cameras.every((camera) => selected.has(camera.id));

  const columns: DataTableColumn<CameraConfig>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          aria-label="Sahifadagi barcha kameralarni tanlash"
          checked={allOnPageSelected}
          onChange={toggleAllOnPage}
        />
      ),
      mobileLabel: 'Tanlash',
      width: '2.75rem',
      cell: (c) => (
        <div onClick={(event) => event.stopPropagation()} className="flex items-center">
          <Checkbox aria-label={`${c.name} kamerasini tanlash`} checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Kamera / IP',
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{c.name}</p>
          <p className="truncate font-mono text-xs text-muted">{c.ip}</p>
        </div>
      ),
    },
    {
      key: 'building',
      header: 'Bino',
      cell: (c) => (
        <span className="block max-w-[10rem] truncate text-muted" title={c.building || undefined}>
          {c.building || '—'}
        </span>
      ),
    },
    {
      key: 'floor',
      header: 'Qavat',
      cell: (c) =>
        c.floor === null || c.floor === undefined ? (
          <CellLink tone="warning" title="Qavatni belgilash" onClick={() => setEditing(c)}>
            belgilanmagan
          </CellLink>
        ) : (
          <span className="whitespace-nowrap tabular-nums text-muted">{c.floor}-qavat</span>
        ),
    },
    {
      key: 'zone',
      header: 'Zona',
      cell: (c) => (
        <span className="block max-w-[9rem] truncate text-muted" title={c.zone || undefined}>
          {c.zone || '—'}
        </span>
      ),
    },
    {
      key: 'roomType',
      header: 'Xona turi',
      cell: (c) => (
        <CellLink tone={c.effectiveRoomType ? undefined : 'warning'} title="Xona turini belgilash" onClick={() => setLocating(c)}>
          {c.effectiveRoomType ? (
            <>
              {ROOM_TYPE_LABELS[c.effectiveRoomType]}
              {c.roomCode ? ` · ${c.roomCode}` : ''}
              {!c.roomType && <span className="text-subtle"> (bayroqdan)</span>}
            </>
          ) : (
            'belgilanmagan'
          )}
        </CellLink>
      ),
    },
    {
      key: 'modules',
      header: 'AI modullar',
      hideOnMobile: true,
      cell: (c) => {
        const moduleSummary = moduleOptions.length > 0 ? formatModuleSummary(moduleOptions, c) : '—';
        const custom = (c.excludedModuleCodes?.length ?? 0) > 0;
        return canManage ? (
          <CellLink tone={custom ? 'warning' : undefined} title="AI modullarni sozlash" onClick={() => setEditingModules(c)}>
            {moduleSummary}
          </CellLink>
        ) : (
          <span className="text-[13px] text-muted">{moduleSummary}</span>
        );
      },
    },
    {
      key: 'video',
      header: 'Ruxsat / FPS',
      hideOnMobile: true,
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums text-muted">
          {c.resolution} / {c.fps ? `${c.fps} fps` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holat / aloqa',
      mobileLabel: 'Holat',
      cell: (c) => (
        <div className="inline-flex flex-col items-end gap-1 md:items-start">
          <Badge tone={CAMERA_STATUS_TONE[c.status]} dot>
            {CAMERA_STATUS_LABEL[c.status]}
          </Badge>
          {c.status === 'faol' && (
            <span
              title={
                c.isReachable
                  ? 'Kamera oxirgi tekshiruvda topildi'
                  : "Kamera hozircha javob bermayapti — kabel/tarmoq muammosi bo'lishi mumkin"
              }
              className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', c.isReachable ? 'text-success' : 'text-danger')}
            >
              <StatusDot tone={c.isReachable ? 'success' : 'danger'} className="scale-75" />
              {c.isReachable ? 'Ulangan' : "Javob yo'q"}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      mobileLabel: 'Amallar',
      cell: (c) => {
        const custom = (c.excludedModuleCodes?.length ?? 0) > 0;
        const hasZone = (c.restrictedZonePolygon?.length ?? 0) > 0;
        const hasDoor = (c.faceRoi?.length ?? 0) > 0;
        return (
          <div onClick={(event) => event.stopPropagation()} className="flex justify-end gap-0.5">
            <RowAction icon={Eye} label="Ko'rish" onClick={() => setViewing(c)} />
            <RowAction icon={Settings2} label="Sozlash" onClick={() => setEditing(c)} />
            {c.effectiveRoomType === 'kirish' && (
              <RowAction
                icon={DoorOpen}
                label="Eshik"
                title={hasDoor ? 'Eshik hududi belgilangan — AI yuzni faqat shu yerda qidiradi' : 'Eshik hududi belgilanmagan — AI yuzni faqat shu yerda qidiradi'}
                tone={hasDoor ? 'success' : 'warning'}
                onClick={() => setDrawingDoor(c)}
              />
            )}
            {canManage && (
              <>
                <RowAction
                  icon={MapPinned}
                  label="Zona"
                  title={hasZone ? 'Taqiqlangan zona belgilangan' : 'Taqiqlangan zonani belgilash'}
                  tone={hasZone ? 'danger' : undefined}
                  onClick={() => setDrawingZone(c)}
                />
                <RowAction
                  icon={Cpu}
                  label="Modullar"
                  title={custom ? 'AI modullar — maxsus sozlama' : 'AI modullarni sozlash'}
                  tone={custom ? 'warning' : undefined}
                  onClick={() => setEditingModules(c)}
                />
              </>
            )}
          </div>
        );
      },
    },
  ];

  const withoutFloor = summary?.withoutFloor ?? 0;

  return (
    <Page
      title="Kameralar"
      subtitle="RTSP kamera konfiguratsiyasi, bino, qavat, zona va AI modul bog'lanishi."
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Kameralar' }]}
      actions={
        <>
          <Button icon={DoorOpen} onClick={() => setRolesOpen(true)}>
            Xona turlari (CSV)
          </Button>
          {canManage && (
            <>
              <Button icon={FileUp} onClick={() => setImportOpen(true)}>
                SADP import
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
                Kamera qo&apos;shish
              </Button>
            </>
          )}
        </>
      }
      toolbar={<FilterBar fields={filterFields} onReset={resetFilters} />}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon={Video} tone="success" label="Faol kameralar" value={formatNumber(summary?.faol ?? 0)} loading={!summary} />
        <StatTile icon={VideoOff} tone="neutral" label="Nofaol kameralar" value={formatNumber(summary?.nofaol ?? 0)} loading={!summary} />
        <StatTile icon={Wrench} tone="warning" label="Ta'mirda" value={formatNumber(summary?.tamirda ?? 0)} loading={!summary} />
        <StatTile
          icon={Layers}
          tone={withoutFloor > 0 ? 'warning' : 'neutral'}
          label="Qavatsiz kameralar"
          value={formatNumber(withoutFloor)}
          hint={floorFilter === UNASSIGNED_FLOOR ? 'Filtr qo\'llangan' : "Ko'rish uchun bosing"}
          loading={!summary}
          onClick={() => setFloorFilter(UNASSIGNED_FLOOR)}
        />
      </div>

      {selected.size > 0 && (
        <Card padding="sm" className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-fg">
            <span className="tabular-nums">{selected.size}</span> ta kamera tanlandi
          </span>
          <Button size="sm" variant="primary" icon={MapPin} onClick={() => setLocationOpen(true)}>
            Bino/qavat belgilash
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bekor qilish
          </Button>
        </Card>
      )}

      <DataTable
        ariaLabel="Kameralar"
        columns={columns}
        rows={cameras}
        rowKey={(c) => c.id}
        onRowClick={setViewing}
        selectedKey={viewing?.id ?? null}
        mobileTitleKey="name"
        dense
        loading={loading && cameras.length === 0}
        error={error}
        onRetry={reload}
        emptyTitle={activeFilters > 0 ? 'Filtrlarga mos kamera topilmadi' : "Hali kamera qo'shilmagan"}
        emptyDescription={
          activeFilters > 0
            ? "Qidiruv yoki filtrlarni o'zgartiring."
            : canManage
              ? "Kamerani qo'lda qo'shing yoki SADP'dan import qiling."
              : "Administrator kamera qo'shgandan keyin bu yerda ko'rinadi."
        }
        emptyAction={
          activeFilters > 0 ? (
            <Button size="sm" onClick={resetFilters}>
              Filtrlarni tozalash
            </Button>
          ) : canManage ? (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              Kamera qo&apos;shish
            </Button>
          ) : undefined
        }
        footer={pagerFooter({ page, totalPages, total, pageSize, onChange: setPage })}
      />

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
        <AddCameraModal open={!!editing} camera={editing} onClose={() => setEditing(null)} onSave={afterLocationChange} />
      ) : (
        <CameraLocationEditModal camera={editing} onClose={() => setEditing(null)} onSave={afterLocationChange} />
      )}
      <CameraLocationEditModal camera={locating} onClose={() => setLocating(null)} onSave={afterLocationChange} />
      <CameraImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => reload()} />
      <CameraRolesImportModal open={rolesOpen} onClose={() => setRolesOpen(false)} onDone={() => reload()} />
      <CameraConfigDetailModal
        camera={viewing}
        onClose={() => setViewing(null)}
        onEditModules={
          canManage
            ? () => {
                if (viewing) setEditingModules(viewing);
              }
            : undefined
        }
      />
      <CameraZoneModal open={!!drawingZone} camera={drawingZone} onClose={() => setDrawingZone(null)} onSave={() => reload()} />
      <CameraZoneModal mode="faceRoi" open={!!drawingDoor} camera={drawingDoor} onClose={() => setDrawingDoor(null)} onSave={() => reload()} />
      <CameraModulesModal open={!!editingModules} camera={editingModules} onClose={() => setEditingModules(null)} onSave={handleModulesSaved} />
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
    </Page>
  );
}
