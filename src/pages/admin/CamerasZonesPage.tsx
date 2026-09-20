import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cpu, DoorOpen, Eye, FileUp, Layers, MapPin, MapPinned, Plus, ScanFace, Settings2, Video, VideoOff, Wrench, type LucideIcon } from 'lucide-react';
import AddCameraModal from '../../components/admin/AddCameraModal';
import CameraImportModal from '../../components/admin/CameraImportModal';
import CameraConfigDetailModal from '../../components/admin/CameraConfigDetailModal';
import CameraModulesModal from '../../components/admin/CameraModulesModal';
import CameraZoneModal from '../../components/admin/CameraZoneModal';
import CameraLocationModal from '../../components/admin/CameraLocationModal';
import CameraLocationEditModal from '../../components/admin/CameraLocationEditModal';
import CameraRolesImportModal from '../../components/admin/CameraRolesImportModal';
import { AttendanceCamerasPanel } from '../../components/admin/AttendanceCamerasPanel';
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
  useUrlTab,
  type DataTableColumn,
  type TabItem,
  type FilterFieldEntry,
  type Tone,
} from '../../ui';
import { api } from '../../lib/apiClient';
import { formatModuleSummary } from '../../lib/cameraModules';
import { ROOM_TYPE_LABELS, ROOM_TYPE_OPTIONS } from '../../lib/cameraRoles';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useCameraModuleOptions } from '../../lib/useCameraModuleOptions';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
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

type CameraTabId = 'royxat' | 'tanish';

const CAMERA_TABS: TabItem<CameraTabId>[] = [
  { id: 'royxat', label: "Kameralar ro'yxati", icon: Video },
  // Ilgari «Xodimlar va o'qituvchilar» bo'limida turgan tashxis paneli:
  // u xodimlar haqida emas, kameralar haqida.
  { id: 'tanish', label: 'Kameralar odamlarni tanidimi', icon: ScanFace },
];

export default function CamerasZonesPage() {
  const [tab] = useUrlTab(CAMERA_TABS, { defaultTab: 'royxat' });
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
  const { zones, reload: reloadZones } = useCameraZones(buildingFilter || undefined);

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
    // Bino tanlangan bo'lsa — FAQAT o'sha binoning qavatlari. Ilgari
    // barcha binolarning maksimumi ham hisobga olinardi, shuning uchun
    // 2 qavatli binoni tanlaganda ham ro'yxatda 9-qavatgacha turardi va
    // mavjud bo'lmagan qavat bo'yicha filtrlash mumkin edi.
    const selectedBuilding = buildingFilter ? buildings.find((b) => b.name === buildingFilter) : undefined;
    const highest = buildingFilter
      ? Math.max(selectedBuilding?.floors ?? 0, 1)
      : Math.max(...buildings.map((b) => b.floors ?? 0), 5);
    const options = Array.from({ length: highest }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1}-qavat`,
    }));
    // Tanlangan qavat yangi ro'yxatga sig'masa ham tanlagichda ko'rinsin —
    // aks holda filtr ishlab turadi-yu, maydon bo'sh ko'rinadi.
    if (floorFilter && floorFilter !== UNASSIGNED_FLOOR && !options.some((o) => o.value === floorFilter)) {
      options.push({ value: floorFilter, label: `${floorFilter}-qavat` });
    }
    return [...options, { value: UNASSIGNED_FLOOR, label: 'Qavat belgilanmagan' }];
  }, [buildings, buildingFilter, floorFilter]);

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

  /** Ro'yxatni qayta oladi VA keshdagi eski sahifalarni tashlaydi.
   *  Faqat `reload()` bo'lsa, boshqa filtr kombinatsiyasiga o'tib
   *  qaytilganda keshdan o'zgarishdan OLDINGI ro'yxat chiqardi. */
  function refreshCameras() {
    invalidateServerPageCache('/api/cameras');
    reload();
    // Zona ro'yxati kameralardan yig'iladi: kamera qo'shilsa/o'chirilsa
    // yoki zonasi almashsa, filtr tanlagichi ham yangilanishi kerak.
    reloadZones();
  }

  function handleModulesSaved(saved: CameraConfig) {
    refreshCameras();
    if (viewing?.id === saved.id) setViewing(saved);
    toast.success(`${saved.name}: AI modullar saqlandi`);
  }

  function afterLocationChange() {
    refreshCameras();
    loadSummary();
  }

  /** Saqlanganini AYTAMIZ. Oyna yopilib ro'yxat jimgina yangilanardi —
   *  qator ko'rinmayotgan sahifada bo'lsa (yoki o'zgarish kichik bo'lsa)
   *  foydalanuvchi saqlandimi-yo'qmi bilmasdi va qayta-qayta bosardi. */
  function handleLocationSaved(saved: CameraConfig) {
    afterLocationChange();
    toast.success(`${saved.name}: joylashuv saqlandi`);
  }

  function handleZoneSaved(saved: CameraConfig, kind: 'zone' | 'door') {
    refreshCameras();
    const has = kind === 'zone' ? (saved.restrictedZonePolygon?.length ?? 0) > 0 : (saved.faceRoi?.length ?? 0) > 0;
    const what = kind === 'zone' ? 'Taqiqlangan zona' : 'Eshik hududi';
    toast.success(`${saved.name}: ${what} ${has ? 'saqlandi' : 'olib tashlandi'}`);
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
      header: 'Kamera nimani kuzatadi',
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
      header: 'Tasvir sifati',
      hideOnMobile: true,
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums text-muted">
          {c.resolution} / {c.fps ? `${c.fps} fps` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holati va aloqasi',
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
                  ? 'Oxirgi tekshiruvda kamera javob berdi'
                  : "Kamera javob bermayapti — kabel uzilgan, elektr yo'q yoki tarmoq sozlamasi noto'g'ri bo'lishi mumkin"
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
                // Ilgari ikkala holatda ham "AI yuzni faqat shu yerda
                // qidiradi" deb yozilardi — hudud belgilanmaganda bu
                // noto'g'ri: AI butun kadrni tekshiradi.
                title={
                  hasDoor
                    ? 'Eshik hududi belgilangan — AI yuzni faqat shu yerda qidiradi'
                    : "Eshik hududi belgilanmagan — AI butun kadrni tekshiradi. Hududni belgilash uchun bosing"
                }
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
      subtitle="Har bir kamera qaysi binoning qaysi qavatida va qanday xonada turgani. Joylashuv to'g'ri ko'rsatilsa, davomat va hodisalar to'g'ri hisoblanadi."
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Kameralar' }]}
      tabs={CAMERA_TABS}
      defaultTab="royxat"
      actions={
        tab === 'tanish' ? undefined : (
        <>
          <Button icon={DoorOpen} onClick={() => setRolesOpen(true)} title="Xona turlarini jadval fayli orqali bir vaqtda ko'plab kameraga belgilash">
            Xona turlarini fayldan yuklash
          </Button>
          {canManage && (
            <>
              <Button icon={FileUp} onClick={() => setImportOpen(true)} title="Kameralarni qidirish dasturi (SADP) saqlagan fayldan ro'yxatni yuklash">
                Kameralarni fayldan yuklash
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
                Kamera qo&apos;shish
              </Button>
            </>
          )}
        </>
        )
      }
      toolbar={tab === 'tanish' ? undefined : <FilterBar fields={filterFields} onReset={resetFilters} />}
    >
      {tab === 'tanish' ? (
        <AttendanceCamerasPanel />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {/* «Faol» — operator NIYATI, `reachable` esa oxirgi tekshiruvda
            kamera haqiqatan javob bergani. Ilgari bu yerda faqat niyat
            ko'rinardi: 40 ta kamera soatlab javob bermayotgan bo'lsa ham
            katak yashil turib, "hammasi joyida" degan taassurot berardi. */}
        <StatTile
          icon={Video}
          tone={summary && summary.reachable < summary.faol ? 'warning' : 'success'}
          label="Ishlatilayotgan kameralar"
          value={formatNumber(summary?.faol ?? 0)}
          hint={
            summary && summary.reachable < summary.faol
              ? `${formatNumber(summary.faol - summary.reachable)} tasi oxirgi tekshiruvda javob bermadi`
              : 'Tizim ulardan tasvir oladi'
          }
          loading={!summary}
        />
        <StatTile icon={VideoOff} tone="neutral" label="O'chirib qo'yilgan" value={formatNumber(summary?.nofaol ?? 0)} hint="Tizim ularga umuman ulanmaydi" loading={!summary} />
        <StatTile icon={Wrench} tone="warning" label="Ta'mirda turgan" value={formatNumber(summary?.tamirda ?? 0)} hint="Vaqtincha ishlatilmaydi" loading={!summary} />
        <StatTile
          icon={Layers}
          tone={withoutFloor > 0 ? 'warning' : 'neutral'}
          label="Qavati ko'rsatilmagan"
          value={formatNumber(withoutFloor)}
          hint={
            floorFilter === UNASSIGNED_FLOOR
              ? "Quyidagi ro'yxatda faqat shular ko'rsatilmoqda — filtrni olib tashlash uchun bosing"
              : "Bunday kameralar bino sxemasida ko'rinmaydi. Ro'yxatni ochish uchun bosing"
          }
          loading={!summary}
          // Bosish filtrni YOQADI VA O'CHIRADI: ilgari uni orqaga qaytarish
          // uchun filtr panelidan qidirish kerak edi.
          onClick={() => setFloorFilter(floorFilter === UNASSIGNED_FLOOR ? '' : UNASSIGNED_FLOOR)}
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
        // Keshni ham tozalaydi: aks holda "Qayta urinish" xato paytida
        // keshda qolgan eski sahifani qaytarib, muammo tuzalganday
        // ko'rsatishi mumkin edi.
        onRetry={refreshCameras}
        emptyTitle={activeFilters > 0 ? 'Filtrlarga mos kamera topilmadi' : "Hali kamera qo'shilmagan"}
        emptyDescription={
          activeFilters > 0
            ? "Qidiruv yoki filtrlarni o'zgartiring."
            : canManage
              ? "Kamerani qo'lda qo'shing yoki tayyor ro'yxatni fayldan yuklang."
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
        </>
      )}

      <AddCameraModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(cam) => {
          afterLocationChange();
          setEditingModules(cam);
        }}
      />
      {/* Tahrirlash tugmasi huquqqa qarab ikki xil oyna ochadi: to'liq
          sozlama (admin) yoki faqat joylashuv (kamera mas'uli). */}
      {canManage ? (
        <AddCameraModal open={!!editing} camera={editing} onClose={() => setEditing(null)} onSave={handleLocationSaved} />
      ) : (
        <CameraLocationEditModal camera={editing} onClose={() => setEditing(null)} onSave={handleLocationSaved} />
      )}
      <CameraLocationEditModal camera={locating} onClose={() => setLocating(null)} onSave={handleLocationSaved} />
      <CameraImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={afterLocationChange} />
      <CameraRolesImportModal open={rolesOpen} onClose={() => setRolesOpen(false)} onDone={afterLocationChange} />
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
      <CameraZoneModal
        open={!!drawingZone}
        camera={drawingZone}
        onClose={() => setDrawingZone(null)}
        onSave={(saved) => handleZoneSaved(saved, 'zone')}
      />
      <CameraZoneModal
        mode="faceRoi"
        open={!!drawingDoor}
        camera={drawingDoor}
        onClose={() => setDrawingDoor(null)}
        onSave={(saved) => handleZoneSaved(saved, 'door')}
      />
      <CameraModulesModal open={!!editingModules} camera={editingModules} onClose={() => setEditingModules(null)} onSave={handleModulesSaved} />
      <CameraLocationModal
        open={locationOpen}
        cameraIds={[...selected]}
        onClose={() => setLocationOpen(false)}
        onSaved={(updated, notFound) => {
          setSelected(new Set());
          afterLocationChange();
          const suffix = notFound > 0 ? ` · ${notFound} tasi topilmadi (o'chirilgan bo'lishi mumkin)` : '';
          if (notFound > 0) toast.error(`${updated} ta kameraning joylashuvi yangilandi${suffix}`);
          else toast.success(`${updated} ta kameraning joylashuvi yangilandi`);
        }}
      />
    </Page>
  );
}
