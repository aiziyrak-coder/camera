import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cpu, DoorOpen, Eye, FileUp, MapPin, MapPinned, Plus, ScanFace, Settings2, Video, type LucideIcon } from 'lucide-react';
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
  Button,
  CodeText,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  IntelPanel,
  MicroLabel,
  Page,
  Readout,
  StatusLamp,
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
  type IntelStatus,
  type TabItem,
  type FilterFieldEntry,
  type Tone,
} from '../../ui';
import { buildReference, locationCode, recordCode } from './../../components/admin/registryCodes';
import { api } from '../../lib/apiClient';
import { branding } from '../../lib/branding';
import { RAG_LABEL, RAG_LETTER, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { formatModuleSummary } from '../../lib/cameraModules';
import { ROOM_TYPE_LABELS, ROOM_TYPE_OPTIONS } from '../../lib/cameraRoles';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useCameraModuleOptions } from '../../lib/useCameraModuleOptions';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { useBuildings } from '../../lib/useBuildings';
import { useCameraZones } from '../../lib/useCameraZones';
import type { CameraConfig, CameraSummary } from '../../types';

/** Holat chirog'i: rang yolg'iz emas — yonida doim so'z turadi. */
const CAMERA_STATUS_LAMP: Record<CameraConfig['status'], IntelStatus> = {
  faol: 'ok',
  nofaol: 'idle',
  tamirda: 'warn',
};

/** Hujjat qachon ekranga chiqarilgani. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

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
      // Qurilma kodi — reestrdagi asbobni nomisiz ko'rsatish uchun.
      key: 'code',
      header: 'Kod',
      width: '6.5rem',
      mono: true,
      cell: (c) => <CodeText className="text-[12px] text-subtle">{recordCode('KM', c.id)}</CodeText>,
    },
    {
      key: 'name',
      header: 'Kamera / IP',
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg">{c.name}</p>
          <CodeText className="block truncate text-[11px] text-muted">{c.ip}</CodeText>
        </div>
      ),
    },
    {
      // Joylashuv kodi: bino belgisi + qavat (2OQ·Q03). Qavati yo'q
      // kamera bino sxemasida ko'rinmaydi — shuning uchun u yerda
      // kodning o'rniga to'g'rilash havolasi turadi.
      key: 'location',
      header: 'Joylashuv',
      width: '11rem',
      cell: (c) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          {c.floor === null || c.floor === undefined ? (
            <CellLink tone="warning" title="Qavatni belgilash" onClick={() => setEditing(c)}>
              Qavat belgilanmagan
            </CellLink>
          ) : (
            <CodeText className="text-[12px] text-fg">{locationCode(c.building, c.floor)}</CodeText>
          )}
          <span className="max-w-[10rem] truncate text-[11px] text-muted" title={c.building || undefined}>
            {c.building || "Bino ko'rsatilmagan"}
          </span>
        </span>
      ),
    },
    {
      key: 'zone',
      header: 'Zona',
      cell: (c) => (
        <span className="block max-w-[9rem] truncate text-[13px] text-muted" title={c.zone || undefined}>
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
      mono: true,
      cell: (c) => (
        <CodeText className="whitespace-nowrap text-[12px] text-muted">
          {c.resolution} / {c.fps ? `${c.fps} fps` : '—'}
        </CodeText>
      ),
    },
    {
      key: 'status',
      header: 'Holati va aloqasi',
      mobileLabel: 'Holat',
      width: '10rem',
      cell: (c) => (
        <div className="inline-flex flex-col items-end gap-0.5 md:items-start">
          <StatusLamp status={CAMERA_STATUS_LAMP[c.status]} label={CAMERA_STATUS_LABEL[c.status]} />
          {/* «Faol» — operator NIYATI; javob berish esa oxirgi
              tekshiruvdagi HAQIQAT. Ikkinchisi svetofor bilan. */}
          {c.status === 'faol' && (
            <span
              title={
                c.isReachable
                  ? 'Oxirgi tekshiruvda kamera javob berdi'
                  : "Kamera javob bermayapti — kabel uzilgan, elektr yo'q yoki tarmoq sozlamasi noto'g'ri bo'lishi mumkin"
              }
            >
              <StatusLamp status={c.isReachable ? 'ok' : 'alert'} pulse={!c.isReachable} label={c.isReachable ? 'Ulangan' : "Javob yo'q"} />
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
  // Ishlayotgan kameralarning ULUSHI — foiz, ya'ni svetofor qo'llanadi.
  // Xom sanoqlar (nofaol, ta'mirda, qavatsiz) hukmsiz qoladi: ular
  // yaxshimi yoki yomonmi, parkning hajmini bilmasdan aytib bo'lmaydi.
  const reachablePercent = summary && summary.faol > 0 ? Math.round((summary.reachable / summary.faol) * 100) : null;
  const reachableRag = rag(reachablePercent, RATE_RAG);

  // Reestr varag'ining raqami — filtrlardan, vaqtdan emas.
  const reference = buildReference('KAM', [tab, buildingFilter || 'BARCHA'], [
    statusFilter,
    floorFilter,
    zoneFilter,
    roomTypeFilter,
    search.trim(),
  ]);
  const generatedAt = stamp();

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
      {/* 1. Hujjat blanki: qurilma reestri, qaysi kesim, qanday holatda. */}
      <DocumentHeader
        org={branding.orgFullName}
        title="Kameralar reestri"
        reference={reference}
        generatedAt={generatedAt}
        readouts={[
          { label: 'Qamrov', value: buildingFilter || 'Barcha binolar', title: buildingFilter || undefined },
          { label: 'Ekranda', value: `${formatNumber(total)} ta kamera`, title: 'Joriy filtrga mos qurilmalar' },
          {
            label: 'Ishlatilmoqda',
            value: summary ? `${formatNumber(summary.faol)} ta` : '—',
            title: 'Operator «Faol» deb belgilagan kameralar',
          },
          {
            label: 'Aloqa',
            title: `Oxirgi tekshiruvda javob bergan faol kameralar ulushi — ${RAG_LABEL[reachableRag]}`,
            value: (
              <span className={cn('inline-flex items-baseline gap-1.5', RAG_TEXT[reachableRag])}>
                {reachablePercent === null ? '—' : `${reachablePercent}%`}
                <span className="text-[10px] font-bold">{RAG_LETTER[reachableRag]}</span>
              </span>
            ),
          },
        ]}
      />

      <IntelPanel
        title="Park holati"
        code={reference}
        right={
          summary && summary.reachable < summary.faol ? (
            <StatusLamp status="alert" pulse label={`${formatNumber(summary.faol - summary.reachable)} ta javob bermadi`} />
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-3 py-2.5 sm:grid-cols-3 xl:grid-cols-5">
          {/* «Faol» — operator NIYATI, `reachable` esa oxirgi tekshiruvda
              kamera haqiqatan javob bergani. Ikkalasi alohida turadi:
              ilgari faqat niyat ko'rinardi va 40 ta kamera soatlab
              javob bermasa ham katak yashil turardi. */}
          <Readout label="Ishlatilmoqda" value={summary ? formatNumber(summary.faol) : '—'} title="Tizim ulardan tasvir oladi" />
          <Readout
            label="Javob bermoqda"
            title={`Oxirgi tekshiruv — ${RAG_LABEL[reachableRag]}`}
            value={
              <span className={cn('inline-flex items-baseline gap-1.5', RAG_TEXT[reachableRag])}>
                {summary ? formatNumber(summary.reachable) : '—'}
                <span className="text-[10px] font-bold">{RAG_LETTER[reachableRag]}</span>
              </span>
            }
          />
          <Readout label="O'chirib qo'yilgan" value={summary ? formatNumber(summary.nofaol) : '—'} title="Tizim ularga umuman ulanmaydi" />
          <Readout label="Ta'mirda" value={summary ? formatNumber(summary.tamirda) : '—'} title="Vaqtincha ishlatilmaydi" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <MicroLabel>Qavati ko&apos;rsatilmagan</MicroLabel>
            {/* Bosish filtrni YOQADI VA O'CHIRADI: ilgari uni orqaga
                qaytarish uchun filtr panelidan qidirish kerak edi. */}
            <button
              type="button"
              onClick={() => setFloorFilter(floorFilter === UNASSIGNED_FLOOR ? '' : UNASSIGNED_FLOOR)}
              title={
                floorFilter === UNASSIGNED_FLOOR
                  ? "Quyidagi ro'yxatda faqat shular ko'rsatilmoqda — filtrni olib tashlash uchun bosing"
                  : "Bunday kameralar bino sxemasida ko'rinmaydi. Ro'yxatni ochish uchun bosing"
              }
              className={cn(
                'intel-code w-fit text-[13px] font-semibold underline decoration-dotted underline-offset-2',
                withoutFloor > 0 ? 'text-warning' : 'text-fg',
                focusRing,
              )}
            >
              {summary ? formatNumber(withoutFloor) : '—'}
            </button>
          </div>
        </div>
      </IntelPanel>

      {selected.size > 0 && (
        /* Buyruq qatori — qalqib turgan tugmalar emas. */
        <div role="status" className="flex flex-wrap items-center gap-2 border border-border-strong bg-surface-2 px-3 py-1.5">
          <MicroLabel>Tanlandi</MicroLabel>
          <CodeText className="text-[13px] font-semibold text-fg">{formatNumber(selected.size)}</CodeText>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <Button size="sm" variant="primary" icon={MapPin} onClick={() => setLocationOpen(true)}>
            Bino/qavat belgilash
          </Button>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>
            Bekor qilish
          </Button>
        </div>
      )}

      <IntelPanel title="Qurilmalar ro'yxati" code={reference} right={<MicroLabel>{formatNumber(total)} ta yozuv</MicroLabel>} brackets={false}>
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
      </IntelPanel>

      <DocumentFooter
        note={`Xizmat uchun. Varaq ${reference} raqami bilan tizimda tuzilgan. Qurilma kodi (KM-…) va joylashuv kodi (bino·qavat) ro'yxatdagi kamerani nomisiz ko'rsatadi.`}
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
