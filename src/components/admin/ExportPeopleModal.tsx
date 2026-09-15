import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Loader2, Users } from 'lucide-react';
import Modal from '../Modal';
import { api, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { config } from '../../lib/config';
import {
  NO_FACULTY_KEY,
  NO_FACULTY_LABEL,
  PERSON_LABELS,
  STATUS_FILTERS,
  exportFilename,
  type ExportKind,
  type PersonType,
  type StatusFilter,
} from '../../lib/peopleFilters';
import type { BiometricsCoverage, StudentStaffRecord } from '../../types';

export interface ExportDefaults {
  type: PersonType;
  faculty: string;
  course: number | null;
  status: StatusFilter;
  search: string;
}

const KIND_OPTIONS: { kind: ExportKind; title: string; description: string; icon: typeof Users }[] = [
  {
    kind: 'people',
    title: "Ro'yxat",
    description: "Har bir odam ism-familiyasi, JSHSHIR, fakultet, kurs/guruh yoki kafedra va yuz holati bilan",
    icon: Users,
  },
  {
    kind: 'stats',
    title: 'Statistika',
    description: "Jami, tasdiqlagan, tasdiqlamagan va foiz — fakultet, kurs, guruh yoki kafedra kesimida",
    icon: BarChart3,
  },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.key || 'all'}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === o.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const selectClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400';

/**
 * Yuklab olish oynasi: KIMLAR (xodim/talaba), QANDAY FAYL (ro'yxat/statistika)
 * va ro'yxat uchun QAYSI QISMI (holat, fakultet, kurs).
 *
 * Boshlang'ich qiymatlar ekrandagi filtrdan olinadi — odatda odam aynan
 * ko'rib turgan narsasini yuklamoqchi bo'ladi — lekin har birini shu yerda
 * o'zgartirish mumkin. Faylga necha kishi tushishi oldindan ko'rsatiladi:
 * bo'sh fayl yoki kutilmaganda 6 ming qatorli fayl yuklanib qolmasin.
 */
export default function ExportPeopleModal({
  open,
  onClose,
  defaults,
  coverage,
}: {
  open: boolean;
  onClose: () => void;
  defaults: ExportDefaults;
  coverage: Record<PersonType, BiometricsCoverage | null>;
}) {
  const { token } = useAuth();
  const [type, setType] = useState<PersonType>(defaults.type);
  const [kind, setKind] = useState<ExportKind>('people');
  const [status, setStatus] = useState<StatusFilter>(defaults.status);
  const [faculty, setFaculty] = useState(defaults.faculty);
  const [course, setCourse] = useState<number | null>(defaults.course);
  const [useSearch, setUseSearch] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchText = defaults.search.trim();

  useEffect(() => {
    if (!open) return;
    setType(defaults.type);
    setKind('people');
    setStatus(defaults.status);
    setFaculty(defaults.faculty);
    setCourse(defaults.course);
    setUseSearch(Boolean(searchText));
    setError(null);
    // Faqat oyna ochilganda ekrandagi filtrdan boshlanadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeType(next: PersonType) {
    if (next === type) return;
    setType(next);
    setFaculty('');
    setCourse(null);
    setUseSearch(false); // qidiruv boshqa bo'limda yozilgan edi
  }

  const params = useMemo(() => {
    const p: Record<string, string> = { type };
    if (kind === 'people') {
      if (faculty) p.faculty = faculty;
      if (type === 'talaba' && course) p.course = String(course);
      if (status) p.biometricsStatus = status;
      if (useSearch && searchText) p.search = searchText;
    }
    return p;
  }, [type, kind, faculty, course, status, useSearch, searchText]);

  // Faylga necha kishi tushishi
  useEffect(() => {
    if (!open || !token) return;
    if (kind === 'stats') {
      setCount(coverage[type]?.total ?? null);
      return;
    }
    let cancelled = false;
    setCounting(true);
    const timer = window.setTimeout(() => {
      api
        .post<Page<StudentStaffRecord>>('/api/students-staff/search', { ...params, pageSize: 1 }, token)
        .then((page) => !cancelled && setCount(page.total))
        .catch(() => !cancelled && setCount(null))
        .finally(() => !cancelled && setCounting(false));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, token, kind, type, params, coverage]);

  const facultyOptions = (coverage[type]?.byFaculty ?? []).map((row) => ({
    value: row.faculty === NO_FACULTY_LABEL ? NO_FACULTY_KEY : row.faculty,
    label: `${row.faculty} (${row.total.toLocaleString('ru-RU')})`,
  }));
  const courseOptions = (coverage.talaba?.byCourse ?? []).filter((row) => row.courseNumber !== null);

  async function download() {
    if (!token) return;
    setDownloading(true);
    setError(null);
    try {
      // POST: qidiruv (JSHSHIR bo'lishi mumkin) URL/access logga tushmasin.
      const res = await fetch(`${config.apiBaseUrl}/api/students-staff/export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...params, course: params.course ? Number(params.course) : undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename(kind, type, course, status);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Faylni tayyorlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setDownloading(false);
    }
  }

  const who = PERSON_LABELS[type].toLowerCase();
  const empty = kind === 'people' && count === 0;

  return (
    <Modal open={open} onClose={onClose} title="Excel faylni yuklab olish" maxWidth="max-w-xl">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Kimlar</p>
          <Segmented
            options={[
              { key: 'xodim' as PersonType, label: PERSON_LABELS.xodim },
              { key: 'talaba' as PersonType, label: PERSON_LABELS.talaba },
            ]}
            value={type}
            onChange={changeType}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Fayl</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {KIND_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = kind === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => setKind(option.kind)}
                  aria-pressed={active}
                  className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    active ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{option.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {kind === 'people' ? (
          <>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Ro&apos;yxatdan o&apos;tish holati</p>
              <Segmented options={STATUS_FILTERS} value={status} onChange={setStatus} />
            </div>

            <div className={`grid gap-3 ${type === 'talaba' ? 'sm:grid-cols-2' : ''}`}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Fakultet</span>
                <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className={selectClass}>
                  <option value="">Barcha fakultetlar</option>
                  {facultyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {type === 'talaba' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Kurs</span>
                  <select
                    value={course ?? ''}
                    onChange={(e) => setCourse(e.target.value ? Number(e.target.value) : null)}
                    className={selectClass}
                  >
                    <option value="">Barcha kurslar</option>
                    {courseOptions.map((row) => (
                      <option key={row.course} value={row.courseNumber ?? ''}>
                        {row.course} ({row.total.toLocaleString('ru-RU')})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {searchText && type === defaults.type && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={useSearch}
                  onChange={(e) => setUseSearch(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Ekrandagi qidiruvni ham qo&apos;llash: «{searchText}»
              </label>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
            Statistika barcha {who} bo&apos;yicha tuziladi:{' '}
            {type === 'talaba'
              ? 'umumiy, fakultetlar, kurslar va guruhlar kesimida.'
              : 'umumiy, fakultetlar va kafedra/bo‘limlar kesimida.'}
          </p>
        )}

        <div
          className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
            empty ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-900'
          }`}
        >
          <span>
            {counting && kind === 'people' ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Hisoblanmoqda...
              </span>
            ) : count === null ? (
              "Sonini aniqlab bo'lmadi"
            ) : empty ? (
              'Tanlangan shartlarga mos odam yo‘q'
            ) : (
              <>
                Faylga <span className="font-extrabold tabular-nums">{count.toLocaleString('ru-RU')}</span> ta {who}{' '}
                tushadi
              </>
            )}
          </span>
          <span className="shrink-0 text-xs text-slate-500">.xlsx</span>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={download}
            disabled={downloading || empty || !token}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? 'Tayyorlanmoqda...' : 'Yuklab olish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
