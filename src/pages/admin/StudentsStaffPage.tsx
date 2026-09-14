import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Clock, Download, GraduationCap, Loader2, Plus, ScanFace, Search } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import AddStudentStaffModal from '../../components/admin/AddStudentStaffModal';
import EditStudentStaffModal from '../../components/admin/EditStudentStaffModal';
import BiometricsTimeLookupModal from '../../components/admin/BiometricsTimeLookupModal';
import ExportPeopleModal from '../../components/admin/ExportPeopleModal';
import { useServerPage } from '../../lib/useServerPage';
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
import type { BiometricsCoverage, StudentStaffRecord } from '../../types';

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

const PERSON_TABS: { type: PersonType; icon: typeof Briefcase }[] = [
  { type: 'xodim', icon: Briefcase },
  { type: 'talaba', icon: GraduationCap },
];

const chip = (active: boolean) =>
  `rounded-lg px-3 py-1.5 font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
  }`;

const formatCount = (n: number) => n.toLocaleString('ru-RU');

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
            <th className="pb-1.5 pr-3 text-center font-semibold">Jami</th>
            <th className="pb-1.5 pr-3 text-center font-semibold">O&apos;tgan</th>
            <th className="pb-1.5 pr-3 text-center font-semibold">O&apos;tmagan</th>
            <th className="pb-1.5 font-semibold">Qamrov</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/60">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1.5 pr-3 font-medium text-slate-700">{row.label}</td>
              <td className="py-1.5 pr-3 text-center tabular-nums text-slate-600">{formatCount(row.total)}</td>
              <td className="py-1.5 pr-3 text-center font-semibold tabular-nums text-emerald-600">
                {formatCount(row.confirmed)}
              </td>
              <td className="py-1.5 pr-3 text-center font-semibold tabular-nums text-red-500">
                {formatCount(row.missing + row.pending)}
              </td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.percent ?? 0}%` }} />
                  </div>
                  <span className="tabular-nums text-slate-500">{row.percent === null ? '—' : `${row.percent}%`}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentsStaffPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<PersonType>('xodim');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [coverage, setCoverage] = useState<Record<PersonType, BiometricsCoverage | null>>({
    xodim: null,
    talaba: null,
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentStaffRecord | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  const isStudents = tab === 'talaba';

  const {
    items: records,
    page,
    setPage,
    totalPages,
    total,
    pageSize,
    loading,
    error,
    reload,
  } = useServerPage<StudentStaffRecord>(
    '/api/students-staff',
    {
      type: tab,
      faculty: facultyFilter || undefined,
      course: isStudents && courseFilter ? String(courseFilter) : undefined,
      biometricsStatus: statusFilter || undefined,
      search: search.trim() || undefined,
    },
    10,
  );

  // Qamrov ro'yxatdan MUSTAQIL yuklanadi: u butun bo'limni ko'rsatadi,
  // filtrlangan sahifani emas. Ikkala tur bittada olinadi — bo'lim
  // tugmalaridagi sonlar ham shundan.
  const loadCoverage = useCallback(() => {
    if (!token) return;
    (['xodim', 'talaba'] as const).forEach((type) => {
      api
        .get<BiometricsCoverage>(`/api/students-staff/biometrics-coverage?type=${type}`, token)
        .then((data) => setCoverage((prev) => ({ ...prev, [type]: data })))
        .catch(() => setCoverage((prev) => ({ ...prev, [type]: null })));
    });
  }, [token]);

  useEffect(loadCoverage, [loadCoverage]);

  function switchTab(next: PersonType) {
    if (next === tab) return;
    setTab(next);
    setFacultyFilter('');
    setCourseFilter(null);
    setSearch('');
  }

  function refresh() {
    reload();
    loadCoverage();
  }

  const current = coverage[tab];
  const facultyChips = (current?.byFaculty ?? []).map((row) => ({
    key: row.faculty === NO_FACULTY_LABEL ? NO_FACULTY_KEY : row.faculty,
    label: row.faculty,
    total: row.total,
  }));
  const courseChips = (current?.byCourse ?? []).filter((row) => row.courseNumber !== null);

  const statusCount = (key: StatusFilter): number | undefined => {
    if (!current) return undefined;
    if (key === 'tasdiqlangan') return current.confirmed;
    if (key === 'tasdiqlanmagan') return current.missing + current.pending;
    return current.total;
  };

  return (
    <section className="glass p-6">
      <PageHeader
        title="Talabalar va Xodimlar"
        subtitle="Shaxsiy ma'lumotlar va biometriya boshqaruvi"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLookupOpen(true)}
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
              onClick={() => setModalOpen(true)}
              className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700"
            >
              <Plus size={14} />
              Yangi biriktirish
            </button>
          </div>
        }
      />

      <div role="tablist" aria-label="Bo'limlar" className="mb-5 flex flex-wrap gap-2">
        {PERSON_TABS.map(({ type, icon: Icon }) => {
          const active = tab === type;
          const count = coverage[type]?.total;
          return (
            <button
              key={type}
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(type)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
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

      {current && current.total > 0 && (
        <div className="mb-5 rounded-2xl border border-white/70 bg-white/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <ScanFace size={15} className="text-indigo-500" />
              {PERSON_LABELS[tab]}: yuzni tasdiqlash qamrovi
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-500">
                Jami: <span className="font-bold text-slate-800">{formatCount(current.total)}</span>
              </span>
              <span className="text-emerald-600">
                Ro&apos;yxatdan o&apos;tgan: <span className="font-bold">{formatCount(current.confirmed)}</span>
              </span>
              <span className="text-red-500">
                O&apos;tmagan: <span className="font-bold">{formatCount(current.missing + current.pending)}</span>
              </span>
              <span className="rounded-md bg-indigo-600 px-2 py-0.5 font-bold text-white">
                {current.percent === null ? "ma'lumot yo'q" : `${current.percent}%`}
              </span>
            </div>
          </div>

          <div className={`grid gap-5 ${isStudents && courseChips.length ? 'lg:grid-cols-[3fr_2fr]' : ''}`}>
            <CoverageTable
              heading="Fakultet"
              rows={current.byFaculty.map((row) => ({ ...row, label: row.faculty }))}
            />
            {isStudents && current.byCourse.length > 0 && (
              <CoverageTable heading="Kurs" rows={current.byCourse.map((row) => ({ ...row, label: row.course }))} />
            )}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${isStudents ? 'Talaba' : 'Xodim'} F.I.Sh. yoki JSHSHIR...`}
            aria-label={`${PERSON_LABELS[tab]}ni qidirish`}
            className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-300"
          />
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <button onClick={() => setFacultyFilter('')} className={chip(facultyFilter === '')}>
            Barcha fakultet
          </button>
          {facultyChips.map((f) => (
            <button key={f.key} onClick={() => setFacultyFilter(f.key)} className={chip(facultyFilter === f.key)}>
              {f.label} <span className="opacity-60 tabular-nums">· {formatCount(f.total)}</span>
            </button>
          ))}
        </div>
      </div>

      {isStudents && courseChips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kurs</span>
          <button onClick={() => setCourseFilter(null)} className={chip(courseFilter === null)}>
            Barcha kurs
          </button>
          {courseChips.map((row) => (
            <button
              key={row.course}
              onClick={() => setCourseFilter(row.courseNumber)}
              className={chip(courseFilter === row.courseNumber)}
            >
              {row.course} <span className="opacity-60 tabular-nums">· {formatCount(row.total)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Holat</span>
        {STATUS_FILTERS.map((f) => {
          const count = statusCount(f.key);
          return (
            <button key={f.key || 'all'} onClick={() => setStatusFilter(f.key)} className={chip(statusFilter === f.key)}>
              {f.label}
              {count !== undefined && <span className="opacity-60 tabular-nums"> · {formatCount(count)}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>
      )}

      {loading && records.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          Filtrlarga mos {isStudents ? 'talaba' : 'xodim'} topilmadi
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Rasm</th>
                <th className="px-4 py-3">F.I.Sh.</th>
                <th className="px-4 py-3">Fakultet</th>
                {isStudents ? (
                  <>
                    <th className="px-4 py-3">Kurs</th>
                    <th className="px-4 py-3">Guruh</th>
                  </>
                ) : (
                  <th className="px-4 py-3">Kafedra / Bo&apos;lim</th>
                )}
                <th className="px-4 py-3">Yuz holati</th>
                <th className="px-4 py-3">Tasdiqlagan vaqti</th>
                <th className="px-4 py-3">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {records.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-white/40">
                  <td className="px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                      {s.initials}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{s.faculty || NO_FACULTY_LABEL}</td>
                  {isStudents ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {s.course ? `${s.course}-kurs` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.group || (s.course ? '—' : s.groupOrPosition)}</td>
                    </>
                  ) : (
                    <td className="px-4 py-3 text-slate-600">{s.groupOrPosition}</td>
                  )}
                  <td className="px-4 py-3">
                    <Badge tone={BIOMETRICS_TONE[s.biometricsStatus]}>{BIOMETRICS_LABEL[s.biometricsStatus]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                    {s.confirmedLabel ??
                      (s.biometricsStatus === 'tasdiqlangan' ? (
                        <span className="text-slate-400" title="Vaqt yozilmagan — «Aniqlash» orqali rasm vaqtidan tiklanadi">
                          avvalroq
                        </span>
                      ) : (
                        '—'
                      ))}
                  </td>
                  <td className="px-4 py-3 text-indigo-600">
                    <button onClick={() => setEditing(s)} className="text-xs font-semibold hover:underline">
                      Tahrirlash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
          </div>
        </div>
      )}

      <ExportPeopleModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaults={{ type: tab, faculty: facultyFilter, course: courseFilter, status: statusFilter, search }}
        coverage={coverage}
      />
      <BiometricsTimeLookupModal open={lookupOpen} onClose={() => setLookupOpen(false)} />
      <AddStudentStaffModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={refresh} />
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
