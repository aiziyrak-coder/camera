import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronDown, Download, Loader2, Plus, ScanFace, Search, Users } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import AddStudentStaffModal from '../../components/admin/AddStudentStaffModal';
import EditStudentStaffModal from '../../components/admin/EditStudentStaffModal';
import { useServerPage } from '../../lib/useServerPage';
import { useFaculties } from '../../lib/useFaculties';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { config } from '../../lib/config';
import type { BiometricsCoverage, StudentStaffRecord } from '../../types';

const BIOMETRICS_TONE: Record<StudentStaffRecord['biometricsStatus'], 'green' | 'amber' | 'slate'> = {
  tasdiqlangan: 'green',
  kutilmoqda: 'amber',
  yoq: 'slate',
};

const BIOMETRICS_LABEL: Record<StudentStaffRecord['biometricsStatus'], string> = {
  tasdiqlangan: 'Tasdiqlangan',
  kutilmoqda: 'Kutilmoqda',
  yoq: "Yo'q",
};

const TYPE_FILTERS = ['Barchasi', 'Talaba', 'Xodim'] as const;

/** Yuz holati filtri.
 *
 *  Eng ko'p beriladigan savol — "ro'yxatdagilardan nechtasi yuzini
 *  tasdiqlamadi". Uni ro'yxatni varaqlab sanab bo'lmaydi, shuning uchun
 *  filtr ham, alohida qamrov paneli ham qo'shilgan. */
const BIOMETRICS_FILTERS = [
  { key: '', label: 'Barcha holat' },
  { key: 'tasdiqlangan', label: 'Tasdiqlangan' },
  { key: 'kutilmoqda', label: 'Kutilmoqda' },
  { key: 'yoq', label: 'Tasdiqlanmagan' },
] as const;

type ExportKind = 'people' | 'stats';

/** Yuklab olish menyusi — ikki xil fayl, ikki xil savol.
 *
 *  "Kim" va "qancha" turli odamlarga kerak: kafedra mudiriga qolib
 *  ketganlarning ismi, rahbariyatga esa qaysi bo'lim orqada ekanligi.
 *  Bittasiga ikkalasini tiqish har ikkala o'quvchi uchun ham noqulay
 *  fayl berardi. */
const EXPORT_OPTIONS: { kind: ExportKind; title: string; description: string; icon: typeof Users }[] = [
  {
    kind: 'people',
    title: "Har bir foydalanuvchi bo'yicha",
    description: "Ekrandagi filtr bo'yicha ro'yxat: F.I.SH., JSHSHIR, fakultet, kafedra va yuz holati",
    icon: Users,
  },
  {
    kind: 'stats',
    title: "Umumiy statistika bo'yicha",
    description: 'Fakultet va kafedralar kesimida: jami, tasdiqlagan, tasdiqlamagan va qamrov foizi',
    icon: BarChart3,
  },
];

/** Fayl nomi server bergan nom bilan bir xil. Content-Disposition
 *  sarlavhasi o'qilmaydi: API boshqa domenda turadi va brauzer bu
 *  sarlavhani CORS ruxsatisiz skriptga ko'rsatmaydi. */
function exportFilename(kind: ExportKind): string {
  const date = new Date().toISOString().slice(0, 10);
  return kind === 'stats' ? `yuz-tasdiqlash-statistikasi-${date}.xlsx` : `royxat-${date}.xlsx`;
}

/** Fakulteti ko'rsatilmaganlar (rektorat, texnik va xo'jalik bo'limlari).
 *  Bo'sh satr "filtr yo'q" degani, shuning uchun alohida kalit kerak. */
const NO_FACULTY_KEY = '__none__';

export default function StudentsStaffPage() {
  const { faculties } = useFaculties();
  const facultyFilters = ['Barcha fakultet', ...faculties.map((f) => f.name), NO_FACULTY_KEY];

  const { token } = useAuth();
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('Barchasi');
  const [facultyFilter, setFacultyFilter] = useState('Barcha fakultet');
  const [biometricsFilter, setBiometricsFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [coverage, setCoverage] = useState<BiometricsCoverage | null>(null);
  const [downloading, setDownloading] = useState<ExportKind | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentStaffRecord | null>(null);

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
      type: typeFilter === 'Barchasi' ? undefined : typeFilter === 'Talaba' ? 'talaba' : 'xodim',
      faculty: facultyFilter === 'Barcha fakultet' ? undefined : facultyFilter,
      biometricsStatus: biometricsFilter || undefined,
      search: search.trim() || undefined,
    },
    10,
  );

  // Qamrov ro'yxatdan MUSTAQIL yuklanadi: u butun bazani ko'rsatadi,
  // filtrlangan sahifani emas. "Pediatriya bo'yicha filtr qo'yilgan"
  // holatda ham umumiy manzara ko'rinib turishi kerak.
  const loadCoverage = useCallback(() => {
    if (!token) return;
    const type =
      typeFilter === 'Barchasi' ? '' : typeFilter === 'Talaba' ? '?type=talaba' : '?type=xodim';
    api
      .get<BiometricsCoverage>(`/api/students-staff/biometrics-coverage${type}`, token)
      .then(setCoverage)
      .catch(() => setCoverage(null));
  }, [token, typeFilter]);

  useEffect(loadCoverage, [loadCoverage]);

  // Menyu tashqarisiga bosilganda yoki Escape da yopiladi
  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /** Tanlangan turdagi Excel faylni yuklaydi.
   *
   *  Ro'yxat ekrandagi filtr bilan AYNAN bir xil. Statistika esa faqat
   *  "turi" filtrini oladi — u butun manzarani ko'rsatish uchun. */
  async function download(kind: ExportKind) {
    if (!token) return;
    setMenuOpen(false);
    setDownloadError(null);
    setDownloading(kind);
    try {
      const params = new URLSearchParams({ kind });
      if (typeFilter !== 'Barchasi') params.set('type', typeFilter === 'Talaba' ? 'talaba' : 'xodim');
      if (kind === 'people') {
        if (facultyFilter !== 'Barcha fakultet') params.set('faculty', facultyFilter);
        if (biometricsFilter) params.set('biometricsStatus', biometricsFilter);
        if (search.trim()) params.set('search', search.trim());
      }

      const res = await fetch(`${config.apiBaseUrl}/api/students-staff/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename(kind);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Faylni tayyorlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="glass p-6">
      <PageHeader
        title="Talabalar va Xodimlar"
        subtitle="Shaxsiy ma'lumotlar va biometriya boshqaruvi"
        action={
          <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                disabled={!token || downloading !== null}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {downloading ? 'Tayyorlanmoqda...' : 'Yuklab olish'}
                <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  {EXPORT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.kind}
                        type="button"
                        role="menuitem"
                        onClick={() => download(option.kind)}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <p className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] text-slate-400">
                    Excel (.xlsx) formatida yuklanadi
                  </p>
                </div>
              )}
            </div>
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

      {coverage && coverage.total > 0 && (
        <div className="mb-5 rounded-2xl border border-white/70 bg-white/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <ScanFace size={15} className="text-indigo-500" />
              Yuzni tasdiqlash qamrovi
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-500">
                Jami: <span className="font-bold text-slate-800">{coverage.total}</span>
              </span>
              <span className="text-emerald-600">
                Tasdiqlagan: <span className="font-bold">{coverage.confirmed}</span>
              </span>
              <span className="text-red-500">
                Tasdiqlamagan: <span className="font-bold">{coverage.missing + coverage.pending}</span>
              </span>
              <span className="rounded-md bg-indigo-600 px-2 py-0.5 font-bold text-white">
                {coverage.percent === null ? "ma'lumot yo'q" : `${coverage.percent}%`}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 pr-3 font-semibold">Fakultet</th>
                  <th className="pb-1.5 pr-3 text-center font-semibold">Jami</th>
                  <th className="pb-1.5 pr-3 text-center font-semibold">Tasdiqlagan</th>
                  <th className="pb-1.5 pr-3 text-center font-semibold">Tasdiqlamagan</th>
                  <th className="pb-1.5 font-semibold">Qamrov</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {coverage.byFaculty.map((row) => {
                  const notConfirmed = row.missing + row.pending;
                  return (
                    <tr key={row.faculty}>
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{row.faculty}</td>
                      <td className="py-1.5 pr-3 text-center tabular-nums text-slate-600">
                        {row.total}
                      </td>
                      <td className="py-1.5 pr-3 text-center font-semibold tabular-nums text-emerald-600">
                        {row.confirmed}
                      </td>
                      <td className="py-1.5 pr-3 text-center font-semibold tabular-nums text-red-500">
                        {notConfirmed}
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${row.percent ?? 0}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-slate-500">
                            {row.percent === null ? '—' : `${row.percent}%`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="F.I.Sh. yoki JSHSHIR bo'yicha qidiruv..."
            aria-label="Talabalar va xodimlarni qidirish"
            className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-300"
          />
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                typeFilter === f ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
              }`}
            >
              {f}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-white/80" />
          {facultyFilters.map((f) => (
            <button
              key={f}
              onClick={() => setFacultyFilter(f)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                facultyFilter === f ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/90'
              }`}
            >
              {f === NO_FACULTY_KEY ? 'Fakultetsiz' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Yuz holati
        </span>
        {BIOMETRICS_FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            onClick={() => setBiometricsFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              biometricsFilter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white/60 text-slate-600 hover:bg-white/90'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {downloadError && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
          {downloadError}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      {loading && records.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          Filtrlarga mos yozuv topilmadi
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Rasm / Face-ID</th>
                <th className="px-4 py-3">F.I.Sh.</th>
                <th className="px-4 py-3">Turi</th>
                <th className="px-4 py-3">Fakultet</th>
                <th className="px-4 py-3">Guruh / Lavozim</th>
                <th className="px-4 py-3">Biometriya holati</th>
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
                  <td className="px-4 py-3 text-slate-600">
                    {s.type === 'talaba' ? 'Talaba' : 'Xodim'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.faculty}</td>
                  <td className="px-4 py-3 text-slate-600">{s.groupOrPosition}</td>
                  <td className="px-4 py-3">
                    <Badge tone={BIOMETRICS_TONE[s.biometricsStatus]}>
                      {BIOMETRICS_LABEL[s.biometricsStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-indigo-600">
                    <button
                      onClick={() => setEditing(s)}
                      className="text-xs font-semibold hover:underline"
                    >
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

      <AddStudentStaffModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={() => reload()} />
      <EditStudentStaffModal
        record={editing}
        onClose={() => setEditing(null)}
        onSave={() => {
          setEditing(null);
          reload();
        }}
      />
    </section>
  );
}
