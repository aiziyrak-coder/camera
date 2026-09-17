import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUpDown,
  Briefcase,
  CalendarCheck,
  ChevronDown,
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
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import ConfirmDialog from '../../components/ConfirmDialog';
import Pagination from '../../components/Pagination';
import AddStudentStaffModal from '../../components/admin/AddStudentStaffModal';
import EditStudentStaffModal from '../../components/admin/EditStudentStaffModal';
import BiometricsTimeLookupModal from '../../components/admin/BiometricsTimeLookupModal';
import ExportPeopleModal from '../../components/admin/ExportPeopleModal';
import SelfEnrollmentReviewModal from '../../components/admin/SelfEnrollmentReviewModal';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SelectFilter from '../../components/ui/SelectFilter';
import { SkeletonBlock, SkeletonTable } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import {
  NO_FACULTY_KEY,
  NO_FACULTY_LABEL,
  PERSON_LABELS,
  STATUS_FILTERS,
  type PersonType,
  type StatusFilter,
} from '../../lib/peopleFilters';
import { usePersistedState } from '../../lib/usePersistedState';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { formatCount } from '../../lib/uzDate';
import type { BiometricsCoverage, StudentStaffRecord } from '../../types';

/** name — F.I.Sh. (A–Z); faculty — fakultet, keyin F.I.Sh.; confirmed — oxirgi tasdiqlaganlar birinchi. */
type Sort = 'name' | 'faculty' | 'confirmed';
type Overview = Record<PersonType, BiometricsCoverage>;

const BIOMETRICS_TONE: Record<StudentStaffRecord['biometricsStatus'], 'green' | 'amber' | 'slate'> = {
  tasdiqlangan: 'green',
  kutilmoqda: 'amber',
  yoq: 'slate',
};

const BIOMETRICS_LABEL: Record<StudentStaffRecord['biometricsStatus'], string> = {
  tasdiqlangan: 'Tasdiqlangan',
  kutilmoqda: 'Kutilmoqda',
  yoq: 'Tasdiqlanmagan',
};

const PAGE_SIZES = [10, 25, 50];
/** Backend: o'zini o'zi ro'yxatdan o'tkazib, tasdiq kutayotganlar. */
const AWAITING_APPROVAL_FILTER = 'tasdiq_kutmoqda';

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
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400">
            <th className="pb-1.5 pr-3 font-semibold">{heading}</th>
            <th className="pb-1.5 pr-3 text-right font-semibold">Jami</th>
            <th className="pb-1.5 pr-3 text-right font-semibold">O&apos;tgan</th>
            <th className="pb-1.5 pr-3 text-right font-semibold">O&apos;tmagan</th>
            <th className="pb-1.5 font-semibold">Qamrov</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/60">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1.5 pr-3 font-medium text-slate-700">{row.label}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{formatCount(row.total)}</td>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-emerald-600">
                {formatCount(row.confirmed)}
              </td>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-red-500">
                {formatCount(row.missing + row.pending)}
              </td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.percent ?? 0}%` }} />
                  </div>
                  <span className="w-10 tabular-nums text-slate-500">
                    {row.percent === null ? '—' : `${row.percent}%`}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TILE_TONES = {
  indigo: 'bg-indigo-100 text-indigo-600',
  green: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
};

function Tile({
  icon,
  label,
  value,
  hint,
  tone = 'indigo',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: keyof typeof TILE_TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-3 sm:p-4">
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${TILE_TONES[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-xl font-extrabold tabular-nums text-slate-900">{value}</p>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  value,
  sort,
  onSort,
  title,
}: {
  label: string;
  value: Sort;
  sort: Sort;
  onSort: (value: Sort) => void;
  title: string;
}) {
  const active = sort === value;
  return (
    <th className="px-4 py-3" aria-sort={active ? (value === 'confirmed' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(value)}
        title={title}
        className={`-mx-1 flex items-center gap-1 rounded px-1 uppercase tracking-wide transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          active ? 'text-indigo-600' : ''
        }`}
      >
        {label}
        {active ? <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
      </button>
    </th>
  );
}

function Avatar({ record }: { record: StudentStaffRecord }) {
  const [failed, setFailed] = useState(false);
  if (record.biometricPhotoUrl && !failed) {
    return (
      <img
        src={record.biometricPhotoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
      {record.initials}
    </div>
  );
}

export default function StudentsStaffPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<PersonType>('xodim');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [pageSizeChoice, setPageSizeChoice] = usePersistedState<number>('odamlar.sahifaHajmi', 10);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentStaffRecord | null>(null);
  const [deleting, setDeleting] = useState<StudentStaffRecord | null>(null);
  const [reviewing, setReviewing] = useState<StudentStaffRecord | null>(null);
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [lookup, setLookup] = useState<{ open: boolean; person: StudentStaffRecord | null }>({
    open: false,
    person: null,
  });

  const isStudents = tab === 'talaba';
  const pageSize = PAGE_SIZES.includes(pageSizeChoice) ? pageSizeChoice : 10;

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
  // ko'rsatadi. Ikkala tur bitta so'rovda — bo'lim tugmalaridagi sonlar ham shundan.
  const loadOverview = useCallback(() => {
    if (!token) return;
    api
      .get<Overview>('/api/students-staff/overview', token)
      .then((data) => {
        setOverview(data);
        setOverviewError(false);
      })
      .catch(() => setOverviewError(true));
  }, [token]);

  useEffect(loadOverview, [loadOverview]);

  function resetFilters() {
    setFacultyFilter('');
    setCourseFilter(null);
    setStatusFilter('');
    setSearch('');
    setAwaitingOnly(false);
  }

  function switchTab(next: PersonType) {
    if (next === tab) return;
    setTab(next);
    // Holat filtri ataylab saqlanadi: "ro'yxatdan o'tmaganlar"ni ikkala
    // bo'limda ketma-ket ko'rish tez-tez uchraydigan ish.
    setFacultyFilter('');
    setCourseFilter(null);
    setSearch('');
  }

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
  const activeFilters = [facultyFilter, isStudents && courseFilter, statusFilter, search.trim(), awaitingOnly].filter(
    Boolean,
  ).length;
  const awaitingCount = current?.awaitingApproval ?? 0;

  return (
    <section className="glass p-4 sm:p-6">
      <PageHeader
        title="Talabalar va Xodimlar"
        subtitle="Shaxsiy ma'lumotlar va yuzni tasdiqlash holati"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLookup({ open: true, person: null })}
              disabled={!token}
              title="Odam yuzini aniq qachon tasdiqlaganini topish"
              className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock size={14} />
              Aniqlash
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!token}
              className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} />
              Yuklab olish
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700"
            >
              <Plus size={14} />
              Yangi biriktirish
            </button>
          </div>
        }
      />

      <div role="tablist" aria-label="Bo'limlar" className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { type: 'xodim', icon: Briefcase },
            { type: 'talaba', icon: GraduationCap },
          ] as const
        ).map(({ type, icon: Icon }) => {
          const active = tab === type;
          const count = overview?.[type]?.total;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(type)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                active ? 'bg-indigo-600 text-white shadow-btn' : 'bg-white/60 text-slate-600 hover:bg-white/90'
              }`}
            >
              <Icon size={16} />
              {PERSON_LABELS[type]}
              {count !== undefined && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {formatCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {overviewError && !current && (
        <div className="mb-4">
          <ErrorState message="Qamrov statistikasini olib bo'lmadi — ro'yxat baribir ishlaydi." onRetry={loadOverview} />
        </div>
      )}

      {!current && !overviewError && (
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      )}

      {current && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile
              icon={<Users size={19} />}
              label={`Jami ${PERSON_LABELS[tab].toLowerCase()}`}
              value={formatCount(current.total)}
            />
            <Tile
              icon={<ScanFace size={19} />}
              tone="green"
              label="Yuzi tasdiqlangan"
              value={formatCount(current.confirmed)}
              hint={
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 sm:w-20">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${current.percent ?? 0}%` }} />
                  </div>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    {current.percent === null ? '—' : `${current.percent}%`}
                  </span>
                </div>
              }
            />
            <Tile icon={<Hourglass size={19} />} tone="amber" label="Kutilmoqda" value={formatCount(current.pending)} />
            <Tile
              icon={<UserRoundX size={19} />}
              tone="slate"
              label="Yuzi yo'q"
              value={formatCount(current.missing)}
              hint="kamera taniy olmaydi"
            />
          </div>

          {current.total > 0 && (
            <details className="group mb-5 rounded-2xl border border-white/70 bg-white/45">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-1.5">
                  <ScanFace size={15} className="text-indigo-500" />
                  Qamrov tafsiloti — fakultetlar{isStudents ? ' va kurslar' : ''} kesimida
                </span>
                <ChevronDown
                  size={16}
                  className="text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div
                className={`grid gap-5 border-t border-white/70 px-4 py-4 ${
                  isStudents && current.byCourse.length ? 'lg:grid-cols-[3fr_2fr]' : ''
                }`}
              >
                <CoverageTable
                  heading="Fakultet"
                  rows={current.byFaculty.map((row) => ({ ...row, label: row.faculty }))}
                />
                {isStudents && current.byCourse.length > 0 && (
                  <CoverageTable heading="Kurs" rows={current.byCourse.map((row) => ({ ...row, label: row.course }))} />
                )}
              </div>
            </details>
          )}
        </>
      )}

      {(awaitingCount > 0 || awaitingOnly) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldQuestion size={16} className="shrink-0" />
            {awaitingCount > 0
              ? `${formatCount(awaitingCount)} kishi o'zini o'zi ro'yxatdan o'tkazdi — yuzi tasdiqlashingizni kutmoqda. Tasdiqlanmaguncha kameralar ularni tanimaydi.`
              : "Tasdiq kutayotganlar qolmadi."}
          </span>
          <button
            type="button"
            onClick={() => {
              setAwaitingOnly((value) => !value);
              setPage(1);
            }}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
          >
            {awaitingOnly ? "Butun ro'yxatga qaytish" : "Ko'rib chiqish"}
          </button>
        </div>
      )}

      <FilterBar activeCount={activeFilters} onReset={resetFilters}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`${isStudents ? 'Talaba' : 'Xodim'} F.I.Sh. yoki JSHSHIR...`}
          ariaLabel={`${PERSON_LABELS[tab]}ni qidirish`}
        />
        <SelectFilter
          label="Fakultet"
          value={facultyFilter}
          onChange={setFacultyFilter}
          options={(current?.byFaculty ?? []).map((row) => ({
            value: row.faculty === NO_FACULTY_LABEL ? NO_FACULTY_KEY : row.faculty,
            label: `${row.faculty} (${formatCount(row.total)})`,
          }))}
        />
        {isStudents && (
          <SelectFilter
            label="Kurs"
            value={courseFilter ? String(courseFilter) : ''}
            onChange={(value) => setCourseFilter(value ? Number(value) : null)}
            options={(current?.byCourse ?? [])
              .filter((row) => row.courseNumber !== null)
              .map((row) => ({ value: String(row.courseNumber), label: `${row.course} (${formatCount(row.total)})` }))}
          />
        )}
        <SegmentedControl
          options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label, count: statusCount(f.key) }))}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Yuz holati"
          size="sm"
        />
      </FilterBar>

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={refresh} />
        </div>
      )}

      {loading && records.length === 0 ? (
        <SkeletonTable rows={Math.min(pageSize, 10)} columns={isStudents ? 7 : 6} />
      ) : records.length === 0 ? (
        !error && (
          <EmptyState
            title={`Filtrlarga mos ${isStudents ? 'talaba' : 'xodim'} topilmadi`}
            description={
              search.trim()
                ? "Ismni boshqacha yozib ko'ring (masalan, faqat familiya) yoki JSHSHIR bo'yicha qidiring."
                : undefined
            }
            action={
              activeFilters > 0 && (
                <button type="button" onClick={resetFilters} className="btn-glass">
                  Filtrlarni tozalash
                </button>
              )
            }
          />
        )
      ) : (
        <>
          <div
            className={`overflow-x-auto rounded-xl border border-white/70 transition-opacity ${
              refreshing ? 'opacity-70' : ''
            }`}
          >
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <SortHeader label="F.I.Sh." value="name" sort={sort} onSort={setSort} title="F.I.Sh. bo'yicha (A–Z)" />
                  <SortHeader
                    label="Fakultet"
                    value="faculty"
                    sort={sort}
                    onSort={setSort}
                    title="Fakultet, keyin F.I.Sh. bo'yicha"
                  />
                  {isStudents ? (
                    <>
                      <th className="px-4 py-3">Kurs</th>
                      <th className="px-4 py-3">Guruh</th>
                    </>
                  ) : (
                    <th className="px-4 py-3">Kafedra / Bo&apos;lim</th>
                  )}
                  <th className="px-4 py-3">Yuz holati</th>
                  <SortHeader
                    label="Tasdiqlangan"
                    value="confirmed"
                    sort={sort}
                    onSort={setSort}
                    title="Oxirgi tasdiqlanganlar birinchi"
                  />
                  <th className="px-4 py-3 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {records.map((person) => (
                  <tr key={person.id} className="transition-colors hover:bg-white/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar record={person} />
                        <span className="font-medium text-slate-900">{person.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{person.faculty || NO_FACULTY_LABEL}</td>
                    {isStudents ? (
                      <>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {person.course ? `${person.course}-kurs` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {person.group || (person.course ? '—' : person.groupOrPosition)}
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-2.5 text-slate-600">{person.groupOrPosition}</td>
                    )}
                    <td className="px-4 py-2.5">
                      {person.awaitingApproval ? (
                        <Badge tone="amber">Tasdiq kutmoqda</Badge>
                      ) : (
                        <Badge tone={BIOMETRICS_TONE[person.biometricsStatus]}>
                          {BIOMETRICS_LABEL[person.biometricsStatus]}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                      {person.confirmedLabel ??
                        (person.biometricsStatus === 'tasdiqlangan' ? (
                          <button
                            type="button"
                            onClick={() => setLookup({ open: true, person })}
                            title="Vaqt yozilmagan — yuz rasmi saqlangan paytdan tiklanadi"
                            className="text-xs font-semibold text-indigo-600 underline decoration-dotted underline-offset-2 hover:text-indigo-800"
                          >
                            Vaqtini aniqlash
                          </button>
                        ) : (
                          '—'
                        ))}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {person.awaitingApproval && (
                          <button
                            type="button"
                            onClick={() => setReviewing(person)}
                            className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200"
                          >
                            <ShieldQuestion size={14} />
                            Ko&apos;rib chiqish
                          </button>
                        )}
                        <Link
                          to={`/admin/attendance?person=${person.id}`}
                          title="Davomat kalendarini ochish"
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-indigo-600"
                        >
                          <CalendarCheck size={14} />
                          Davomat
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditing(person)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-white"
                        >
                          <Pencil size={14} />
                          Tahrirlash
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(person)}
                          title="Ro'yxatdan butunlay o'chirish"
                          aria-label={`${person.fullName} — ro'yxatdan o'chirish`}
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          O&apos;chirish
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-x-4">
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              Sahifada
              <select
                value={pageSize}
                onChange={(e) => setPageSizeChoice(Number(e.target.value))}
                className="rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-300"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="min-w-0 flex-1">
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
            </div>
          </div>
        </>
      )}

      <ExportPeopleModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaults={{ type: tab, faculty: facultyFilter, course: courseFilter, status: statusFilter, search }}
        coverage={{ xodim: overview?.xodim ?? null, talaba: overview?.talaba ?? null }}
      />
      <BiometricsTimeLookupModal
        open={lookup.open}
        person={lookup.person}
        onClose={() => setLookup({ open: false, person: null })}
      />
      <AddStudentStaffModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={refresh} />
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
            decision === 'approve'
              ? `${updated.fullName} tasdiqlandi — endi kameralar uni taniydi`
              : `${updated.fullName} yuzi rad etildi`,
          );
        }}
      />
      <EditStudentStaffModal
        record={editing}
        onClose={() => setEditing(null)}
        onSave={() => {
          setEditing(null);
          refresh();
        }}
      />
    </section>
  );
}
