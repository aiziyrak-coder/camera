import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  GraduationCap,
  Hourglass,
  Pencil,
  Plus,
  ScanFace,
  ShieldQuestion,
  Trash2,
  UserRoundX,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  IconButton,
  Page,
  ProgressBar,
  FilterBar,
  Select,
  filterActiveCount,
  resetFilterFields,
  SkeletonTiles,
  StatTile,
  Tabs,
  cn,
  focusRing,
  formatNumber,
  useToast,
  useUrlTab,
  type DataTableColumn,
  type FilterFieldEntry,
  type TabItem,
  type Tone,
} from '../../ui';
import AddStudentStaffModal from '../../components/admin/AddStudentStaffModal';
import EditStudentStaffModal from '../../components/admin/EditStudentStaffModal';
import BiometricsTimeLookupModal from '../../components/admin/BiometricsTimeLookupModal';
import ExportPeopleModal from '../../components/admin/ExportPeopleModal';
import SelfEnrollmentReviewModal from '../../components/admin/SelfEnrollmentReviewModal';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { NO_FACULTY_KEY, NO_FACULTY_LABEL, PERSON_LABELS, STATUS_FILTERS, type PersonType, type StatusFilter } from '../../lib/peopleFilters';
import { situationPaths } from '../../lib/situationApi';
import { usePersistedState } from '../../lib/usePersistedState';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import type { BiometricsCoverage, StudentStaffRecord } from '../../types';

/** name — F.I.Sh. (A–Z); faculty — fakultet, keyin F.I.Sh.; confirmed — oxirgi tasdiqlaganlar birinchi. */
type Sort = 'name' | 'faculty' | 'confirmed';
type Overview = Record<PersonType, BiometricsCoverage>;

const BIOMETRICS_META: Record<StudentStaffRecord['biometricsStatus'], { label: string; tone: Tone }> = {
  tasdiqlangan: { label: 'Tasdiqlangan', tone: 'success' },
  kutilmoqda: { label: 'Kutilmoqda', tone: 'warning' },
  yoq: { label: 'Tasdiqlanmagan', tone: 'neutral' },
};

const PAGE_SIZES = [10, 25, 50];
/** Backend: o'zini o'zi ro'yxatdan o'tkazib, tasdiq kutayotganlar. */
const AWAITING_APPROVAL_FILTER = 'tasdiq_kutmoqda';

const PERSON_TABS: TabItem<PersonType>[] = [
  { id: 'xodim', label: PERSON_LABELS.xodim, icon: Briefcase },
  { id: 'talaba', label: PERSON_LABELS.talaba, icon: GraduationCap },
];

interface CoverageRow {
  label: string;
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  percent: number | null;
}

function CoverageTable({ heading, rows }: { heading: string; rows: CoverageRow[] }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-[13px]">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="pb-2 pr-3 font-medium">
              {heading}
            </th>
            <th scope="col" className="pb-2 pr-3 text-right font-medium">
              Jami
            </th>
            <th scope="col" className="pb-2 pr-3 text-right font-medium">
              O&apos;tgan
            </th>
            <th scope="col" className="pb-2 pr-3 text-right font-medium">
              O&apos;tmagan
            </th>
            <th scope="col" className="w-40 pb-2 font-medium">
              Qamrov
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-2 pr-3 font-medium text-fg">{row.label}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted">{formatNumber(row.total)}</td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-success">{formatNumber(row.confirmed)}</td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-danger">{formatNumber(row.missing + row.pending)}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <ProgressBar value={row.percent} size="sm" className="flex-1" ariaLabel={`${row.label} qamrovi`} />
                  <span className="w-10 text-right tabular-nums text-muted">{row.percent === null ? '—' : `${row.percent}%`}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {formatNumber(from)}–{formatNumber(to)} / {formatNumber(total)} ta
        </span>
        <Select
          value={String(pageSize)}
          onChange={(value) => onPageSize(Number(value))}
          options={PAGE_SIZES.map((size) => ({ value: String(size), label: `${size} tadan` }))}
          ariaLabel="Sahifadagi yozuvlar soni"
          size="sm"
          className="w-auto"
        />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Oldingi sahifa" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} />
          <span className="px-2 font-medium tabular-nums text-fg">
            {page} / {totalPages}
          </span>
          <IconButton icon={ChevronRight} label="Keyingi sahifa" size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
        </div>
      )}
    </div>
  );
}

/** Qator ichidagi tugmalar (telefondagi kartada ham) — bosish qatorga o'tmasin. */
function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

export default function StudentsStaffPage() {
  const { token } = useAuth();
  const toast = useToast();
  // ?search=<matn>&tur=talaba|xodim — boshqa sahifalardan (turniket jurnali,
  // tanilmagan kartalar) aniq odamga havola. `tur` — sahifa tabi ham.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab] = useUrlTab(PERSON_TABS, { param: 'tur', defaultTab: 'xodim' });
  const [facultyFilter, setFacultyFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [sort, setSort] = useState<Sort>('name');
  const [pageSizeChoice, setPageSizeChoice] = usePersistedState<number>('odamlar.sahifaHajmi', 10);
  const [coverageOpen, setCoverageOpen] = usePersistedState<boolean>('odamlar.qamrovOchiq', false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentStaffRecord | null>(null);
  const [deleting, setDeleting] = useState<StudentStaffRecord | null>(null);
  const [reviewing, setReviewing] = useState<StudentStaffRecord | null>(null);
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [lookup, setLookup] = useState<{ open: boolean; person: StudentStaffRecord | null }>({ open: false, person: null });

  const isStudents = tab === 'talaba';
  const pageSize = PAGE_SIZES.includes(pageSizeChoice) ? pageSizeChoice : 10;

  // ?search= bir marta o'qiladi va URL'dan olib tashlanadi. Ilgari u faqat
  // birinchi renderda olinardi: komponent tirik turganda boshqa sahifadan
  // ikkinchi marta kelinsa qidiruv o'zgarmasdi; qidiruvni tozalagandan
  // keyin sahifa yangilansa esa eski so'z URL'dan qaytib kelardi.
  useEffect(() => {
    const fromUrl = searchParams.get('search');
    if (fromUrl === null) return;
    setSearch(fromUrl);
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Bo'lim almashganda bo'limga xos filtrlar tozalanadi. Holat filtri
  // ataylab saqlanadi: "ro'yxatdan o'tmaganlar"ni ikkala bo'limda ketma-ket
  // ko'rish tez-tez uchraydigan ish.
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    setFacultyFilter('');
    setCourseFilter(null);
    setSearch('');
  }, [tab]);

  const {
    items: records,
    page,
    setPage,
    totalPages,
    total,
    loading,
    refreshing,
    error,
    reload,
  } = useServerPage<StudentStaffRecord>(
    '/api/students-staff/search',
    {
      type: tab,
      faculty: facultyFilter || undefined,
      course: isStudents && courseFilter ? String(courseFilter) : undefined,
      biometricsStatus: awaitingOnly ? AWAITING_APPROVAL_FILTER : statusFilter || undefined,
      search: search.trim() || undefined,
      sort,
    },
    pageSize,
    { post: true },
  );

  // Qamrov ro'yxatdan MUSTAQIL: u filtrlangan sahifani emas, butun bo'limni
  // ko'rsatadi. Ikkala tur bitta so'rovda — tablardagi sonlar ham shundan.
  // Bekor qilish bayrog'i: sahifadan chiqilgandan keyin yoki yangi so'rov
  // ketgandan keyin kech kelgan javob eskirgan statistikani yozib
  // qo'ymasligi uchun. Ilgari har `refresh()` yangi so'rov ochar, javoblar
  // qaysi kelsa o'sha yozilardi.
  const overviewRun = useRef(0);
  const loadOverview = useCallback(() => {
    if (!token) return;
    const run = ++overviewRun.current;
    api
      .get<Overview>('/api/students-staff/overview', token)
      .then((data) => {
        if (run !== overviewRun.current) return;
        setOverview(data);
        setOverviewError(false);
      })
      .catch(() => {
        if (run === overviewRun.current) setOverviewError(true);
      });
  }, [token]);

  useEffect(() => {
    loadOverview();
    return () => {
      overviewRun.current += 1;
    };
  }, [loadOverview]);


  function refresh() {
    invalidateServerPageCache('/api/students-staff');
    reload();
    loadOverview();
  }

  const current = overview?.[tab] ?? null;
  const statusCount = (key: StatusFilter): number | undefined => {
    if (!current) return undefined;
    if (key === 'tasdiqlangan') return current.confirmed;
    if (key === 'tasdiqlanmagan') return current.missing + current.pending;
    return current.total;
  };
  const awaitingCount = current?.awaitingApproval ?? 0;

  const tabs = useMemo<TabItem<PersonType>[]>(
    () => PERSON_TABS.map((t) => ({ ...t, count: overview?.[t.id]?.total ?? null })),
    [overview],
  );

  function pickStatus(next: StatusFilter) {
    setAwaitingOnly(false);
    setStatusFilter(next);
  }

  const columns: DataTableColumn<StudentStaffRecord>[] = [
    {
      key: 'name',
      header: 'F.I.Sh.',
      sortValue: () => null,
      cell: (person) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={person.fullName} src={person.biometricPhotoUrl} size="sm" />
          <Link
            to={situationPaths.person(person.id)}
            onClick={(e) => e.stopPropagation()}
            className={cn('min-w-0 truncate rounded font-medium text-fg hover:text-primary hover:underline', focusRing)}
          >
            {person.fullName}
          </Link>
        </span>
      ),
    },
    {
      key: 'faculty',
      header: 'Fakultet',
      sortValue: () => null,
      cell: (person) => <span className="text-muted">{person.faculty || NO_FACULTY_LABEL}</span>,
    },
    ...(isStudents
      ? [
          {
            key: 'course',
            header: 'Kurs',
            cell: (person: StudentStaffRecord) => (person.course ? `${person.course}-kurs` : <span className="text-subtle">—</span>),
          },
          {
            key: 'group',
            header: 'Guruh',
            cell: (person: StudentStaffRecord) => {
              const group = person.group || (person.course ? null : person.groupOrPosition);
              if (!group) return <span className="text-subtle">—</span>;
              return person.group ? (
                <Link
                  to={situationPaths.group(person.group)}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('rounded text-fg hover:text-primary hover:underline', focusRing)}
                >
                  {group}
                </Link>
              ) : (
                group
              );
            },
          },
        ]
      : [
          {
            key: 'position',
            header: "Kafedra / Bo'lim",
            cell: (person: StudentStaffRecord) => <span className="text-muted">{person.groupOrPosition || '—'}</span>,
          },
        ]),
    {
      key: 'status',
      header: 'Yuz holati',
      cell: (person) =>
        person.awaitingApproval ? (
          <Badge tone="warning" dot>
            Tasdiq kutmoqda
          </Badge>
        ) : (
          <Badge tone={BIOMETRICS_META[person.biometricsStatus].tone} dot>
            {BIOMETRICS_META[person.biometricsStatus].label}
          </Badge>
        ),
    },
    {
      key: 'confirmed',
      header: 'Tasdiqlangan',
      sortValue: () => null,
      sortFirst: 'desc',
      hideOnMobile: true,
      cell: (person) =>
        person.confirmedLabel ? (
          <span className="whitespace-nowrap tabular-nums text-muted">{person.confirmedLabel}</span>
        ) : person.biometricsStatus === 'tasdiqlangan' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLookup({ open: true, person });
            }}
            title="Vaqt yozilmagan — yuz rasmi saqlangan paytdan tiklanadi"
            className={cn('rounded text-xs font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80', focusRing)}
          >
            Vaqtini aniqlash
          </button>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Amallar</span>,
      mobileLabel: 'Amallar',
      align: 'right',
      cell: (person) => (
        <RowActions>
          {person.awaitingApproval && (
            <Button size="sm" variant="soft" icon={ShieldQuestion} onClick={() => setReviewing(person)}>
              Ko&apos;rib chiqish
            </Button>
          )}
          <ButtonLink to={situationPaths.person(person.id)} size="sm" variant="ghost" icon={CalendarCheck} title="Davomat va profil">
            Davomat
          </ButtonLink>
          <IconButton icon={Pencil} label={`${person.fullName} — tahrirlash`} size="sm" onClick={() => setEditing(person)} />
          <IconButton icon={Trash2} label={`${person.fullName} — ro'yxatdan o'chirish`} size="sm" variant="danger" onClick={() => setDeleting(person)} />
        </RowActions>
      ),
    },
  ];

  const filterFields: FilterFieldEntry[] = [
    {
      kind: 'search',
      value: search,
      onChange: setSearch,
      placeholder: `${isStudents ? 'Talaba' : 'Xodim'} F.I.Sh. yoki JSHSHIR…`,
      ariaLabel: `${PERSON_LABELS[tab]}ni qidirish`,
    },
    {
      kind: 'select',
      value: facultyFilter,
      onChange: setFacultyFilter,
      placeholder: 'Barcha fakultetlar',
      ariaLabel: 'Fakultet',
      options: (current?.byFaculty ?? []).map((row) => ({
        value: row.faculty === NO_FACULTY_LABEL ? NO_FACULTY_KEY : row.faculty,
        label: `${row.faculty} (${formatNumber(row.total)})`,
      })),
    },
    // Kurs faqat talabalarda.
    isStudents && {
      kind: 'select',
      value: courseFilter ? String(courseFilter) : '',
      onChange: (value: string) => setCourseFilter(value ? Number(value) : null),
      placeholder: 'Barcha kurslar',
      ariaLabel: 'Kurs',
      options: (current?.byCourse ?? [])
        .filter((row) => row.courseNumber !== null)
        .map((row) => ({ value: String(row.courseNumber), label: `${row.course} (${formatNumber(row.total)})` })),
    },
    // Yuz holati — segmentli tablar; faolligi va tozalanishi shu yerda.
    {
      kind: 'custom',
      active: Boolean(statusFilter) || awaitingOnly,
      onClear: () => {
        setStatusFilter('');
        setAwaitingOnly(false);
      },
      render: (
        <Tabs
          variant="segmented"
          ariaLabel="Yuz holati"
          tabs={STATUS_FILTERS.map((f) => ({ id: f.key, label: f.label, count: statusCount(f.key) ?? null }))}
          value={awaitingOnly ? ('__awaiting__' as StatusFilter) : statusFilter}
          onChange={pickStatus}
        />
      ),
    },
  ];
  const activeFilters = filterActiveCount(filterFields);
  const resetFilters = () => resetFilterFields(filterFields);
  const toolbar = <FilterBar fields={filterFields} />;

  return (
    <Page
      title="Shaxslar reestri"
      subtitle="Talabalar va xodimlar: shaxsiy ma'lumotlar va yuzni tasdiqlash holati"
      tabs={tabs}
      tabParam="tur"
      defaultTab="xodim"
      toolbar={toolbar}
      actions={
        <>
          {/* "Aniqlash" nimani aniqlashini aytmasdi — endi yorliqning o'zi
              aytadi (tooltipni hamma ham ochmaydi). */}
          <Button icon={Clock} onClick={() => setLookup({ open: true, person: null })} disabled={!token} title="Odam yuzini aniq qachon tasdiqlaganini topish">
            Tasdiq vaqti
          </Button>
          <Button icon={Download} onClick={() => setExportOpen(true)} disabled={!token}>
            Yuklab olish
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
            Yangi qo&apos;shish
          </Button>
        </>
      }
    >
      {overviewError && !current && (
        <ErrorState title="Qamrov statistikasini olib bo'lmadi" message="Ro'yxat baribir ishlaydi." onRetry={loadOverview} />
      )}

      {!current && !overviewError && <SkeletonTiles count={4} className="xl:grid-cols-4" />}

      {/* Statistika yangilanmagan bo'lsa jim turmaymiz: eski raqamlar
          to'g'riday ko'rinib qolardi. */}
      {overviewError && current && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-fg">
          <span>Quyidagi raqamlar eskirgan bo'lishi mumkin — qamrov statistikasini yangilab bo'lmadi.</span>
          <Button size="sm" onClick={loadOverview}>
            Qayta urinish
          </Button>
        </div>
      )}

      {current && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon={Users} tone="primary" label={`Jami ${PERSON_LABELS[tab].toLowerCase()}`} value={formatNumber(current.total)} onClick={() => pickStatus('')} />
          <StatTile
            icon={ScanFace}
            tone="success"
            label="Yuzi tasdiqlangan"
            value={formatNumber(current.confirmed)}
            hint={current.percent === null ? undefined : `${current.percent}% qamrov`}
            progress={current.percent}
            onClick={() => pickStatus('tasdiqlangan')}
          />
          {/* «Tasdiqlanmagan» filtri kutilayotganlarni HAM qamrab oladi
              (missing + pending), shuning uchun ikkala kartochka ham o'sha
              filtrga olib boradi va izohda buni aytadi. Ilgari «Yuzi yo'q»
              kartochkasi faqat `missing` raqamini ko'rsatib, bosilganda
              undan ko'p qator chiqarardi — raqam ro'yxatga mos kelmasdi. */}
          <StatTile
            icon={Hourglass}
            tone="warning"
            label="Kutilmoqda"
            value={formatNumber(current.pending)}
            hint="tasdiq jarayonida"
            onClick={() => pickStatus('tasdiqlanmagan')}
          />
          <StatTile
            icon={UserRoundX}
            tone="neutral"
            label="Yuzi yo'q"
            value={formatNumber(current.missing)}
            hint="kamera taniy olmaydi"
            onClick={() => pickStatus('tasdiqlanmagan')}
          />
        </div>
      )}

      {current && current.total > 0 && (
        <Card padding="none">
          <button
            type="button"
            onClick={() => setCoverageOpen(!coverageOpen)}
            aria-expanded={coverageOpen}
            className={cn('flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left sm:px-5', focusRing)}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted">
                <ScanFace size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-fg">Qamrov tafsiloti</span>
                <span className="block text-[13px] text-muted">Fakultetlar{isStudents ? ' va kurslar' : ''} kesimida yuzi tasdiqlanganlar</span>
              </span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className={cn('shrink-0 text-muted transition-transform', coverageOpen && 'rotate-180')} />
          </button>
          {coverageOpen && (
            <div className={cn('grid gap-6 border-t border-border px-4 py-4 sm:px-5', isStudents && current.byCourse.length > 0 && 'xl:grid-cols-[3fr_2fr]')}>
              <CoverageTable heading="Fakultet" rows={current.byFaculty.map((row) => ({ ...row, label: row.faculty }))} />
              {isStudents && current.byCourse.length > 0 && (
                <CoverageTable heading="Kurs" rows={current.byCourse.map((row) => ({ ...row, label: row.course }))} />
              )}
            </div>
          )}
        </Card>
      )}

      {(awaitingCount > 0 || awaitingOnly) && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3">
          <span className="flex min-w-0 items-start gap-2.5 text-sm text-fg">
            <ShieldQuestion size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            {awaitingCount > 0
              ? `${formatNumber(awaitingCount)} kishi o'zini o'zi ro'yxatdan o'tkazdi — yuzini tasdiqlashingizni kutmoqda. Tasdiqlanmaguncha kameralar ularni tanimaydi.`
              : 'Tasdiq kutayotganlar qolmadi.'}
          </span>
          <Button
            size="sm"
            variant={awaitingOnly ? 'secondary' : 'primary'}
            onClick={() => {
              setAwaitingOnly((value) => !value);
              setPage(1);
            }}
          >
            {awaitingOnly ? "Butun ro'yxatga qaytish" : "Ko'rib chiqish"}
          </Button>
        </div>
      )}

      <DataTable
        ariaLabel={PERSON_LABELS[tab]}
        columns={columns}
        rows={records}
        rowKey={(person) => person.id}
        loading={loading && records.length === 0}
        loadingRows={Math.min(pageSize, 10)}
        error={error}
        onRetry={refresh}
        manualSort
        sort={{ key: sort, dir: sort === 'confirmed' ? 'desc' : 'asc' }}
        onSortChange={(next) => {
          if (next && next.key !== sort) setSort(next.key as Sort);
        }}
        maxHeight="none"
        className={cn('transition-opacity', refreshing && 'opacity-70')}
        emptyTitle={`Filtrlarga mos ${isStudents ? 'talaba' : 'xodim'} topilmadi`}
        emptyDescription={
          search.trim() ? "Ismni boshqacha yozib ko'ring (masalan, faqat familiya) yoki JSHSHIR bo'yicha qidiring." : undefined
        }
        emptyAction={
          activeFilters > 0 ? (
            <Button onClick={resetFilters}>Filtrlarni tozalash</Button>
          ) : (
            <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
              Yangi qo&apos;shish
            </Button>
          )
        }
        footer={
          !error && records.length > 0 ? (
            <Pager
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSizeChoice(size);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />

      <ExportPeopleModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaults={{ type: tab, faculty: facultyFilter, course: courseFilter, status: statusFilter, search }}
        coverage={{ xodim: overview?.xodim ?? null, talaba: overview?.talaba ?? null }}
      />
      <BiometricsTimeLookupModal open={lookup.open} person={lookup.person} onClose={() => setLookup({ open: false, person: null })} />
      <AddStudentStaffModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={(record) => {
          refresh();
          toast.success(`${record.fullName} reestrga qo'shildi`);
        }}
      />
      {/* O'chirish qaytarib bo'lmaydi va odamning butun tarixini olib
          ketadi, shuning uchun tasdiqlash oynasida AYNAN nima yo'qolishi
          yozilgan — "rostdanmi?" degan savolning o'zi yetarli emas. */}
      <ConfirmDialog
        open={!!deleting}
        title="Ro'yxatdan o'chirish"
        message={
          deleting
            ? `${deleting.fullName} ro'yxatdan butunlay o'chiriladi. Bu bilan birga uning davomat yozuvlari, kameradagi tashriflari va yuz ma'lumoti ham o'chadi. Amalni ortga qaytarib bo'lmaydi.`
            : ''
        }
        confirmLabel="Ha, o'chirilsin"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api.del(`/api/students-staff/${deleting.id}`, token);
          const removed = deleting.fullName;
          setDeleting(null);
          // Sahifadagi oxirgi yozuv o'chirilsa, oldingi sahifaga qaytamiz —
          // aks holda ro'yxat bo'sh ko'rinib, "hammasi o'chib ketdi" degan
          // taassurot qoladi.
          if (records.length === 1 && page > 1) setPage(page - 1);
          refresh();
          toast.success(`${removed} ro'yxatdan o'chirildi`);
        }}
      />
      <SelfEnrollmentReviewModal
        record={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(decision, updated) => {
          setReviewing(null);
          refresh();
          toast.success(
            decision === 'approve' ? `${updated.fullName} tasdiqlandi — endi kameralar uni taniydi` : `${updated.fullName} yuzi rad etildi`,
          );
        }}
      />
      <EditStudentStaffModal
        record={editing}
        onClose={() => setEditing(null)}
        onSave={() => {
          setEditing(null);
          refresh();
          toast.success('Saqlandi');
        }}
      />
    </Page>
  );
}
