import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Clock, Loader2, Search } from 'lucide-react';
import Modal from '../Modal';
import { ApiError, api, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { BiometricsConfirmation, StudentStaffRecord } from '../../types';

const MIN_QUERY_LENGTH = 2;
const SUGGESTION_LIMIT = 8;
const DEBOUNCE_MS = 250;

const STATUS_LABEL: Record<StudentStaffRecord['biometricsStatus'], string> = {
  tasdiqlangan: 'Yuzi tasdiqlangan',
  kutilmoqda: 'Kutilmoqda',
  yoq: 'Tasdiqlanmagan',
};

const STATUS_DOT: Record<StudentStaffRecord['biometricsStatus'], string> = {
  tasdiqlangan: 'bg-emerald-500',
  kutilmoqda: 'bg-amber-500',
  yoq: 'bg-slate-300',
};

function describePerson(p: StudentStaffRecord): string {
  return [p.type === 'talaba' ? 'Talaba' : 'Xodim', p.faculty, p.groupOrPosition].filter(Boolean).join(' · ');
}

/** "3 kun oldin" — aniq soatning yonida, qancha vaqt o'tganini bir qarashda ko'rish uchun. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'hozirgina';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} oy oldin` : `${Math.floor(months / 12)} yil oldin`;
}

/**
 * Odam yuzini aniq qachon tasdiqlaganini topish.
 *
 * Ism yozilganda mos variantlar chiqadi; ↑/↓ bilan tanlab Enter bosiladi
 * yoki sichqoncha bilan bosiladi. Variantlar hali kelmagan bo'lsa Enter
 * qidiruvni darhol bajaradi: bitta odam topilsa — uni ochadi, bir nechta
 * bo'lsa — ro'yxatni ko'rsatadi. Ko'p odamdan birinchisini jimgina tanlash
 * bir xil familiyali boshqa odamning vaqtini ko'rsatib qo'yishi mumkin edi.
 */
export default function BiometricsTimeLookupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StudentStaffRecord[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [result, setResult] = useState<BiometricsConfirmation | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetToSearch = useCallback(() => {
    requestSeq.current += 1;
    setResult(null);
    setSuggestions([]);
    setSearchedFor(null);
    setHighlight(0);
    setError(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    resetToSearch();
  }, [open, resetToSearch]);

  const runSearch = useCallback(
    async (text: string): Promise<StudentStaffRecord[] | null> => {
      const seq = ++requestSeq.current;
      setSearching(true);
      try {
        const page = await api.post<Page<StudentStaffRecord>>(
          '/api/students-staff/search',
          { search: text, pageSize: SUGGESTION_LIMIT },
          token,
        );
        if (seq !== requestSeq.current) return null;
        setSuggestions(page.items);
        setSearchedFor(text);
        setHighlight(0);
        setError(null);
        return page.items;
      } catch (err) {
        if (seq === requestSeq.current) {
          setSuggestions([]);
          setError(err instanceof ApiError ? err.message : "Qidirib bo'lmadi — tarmoqni tekshirib, qayta urinib ko'ring");
        }
        return null;
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    },
    [token],
  );

  // Yozish to'xtagach qidirish
  useEffect(() => {
    if (!open || result) return;
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      requestSeq.current += 1;
      setSuggestions([]);
      setSearchedFor(null);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(() => void runSearch(text), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open, result, runSearch]);

  async function choose(person: StudentStaffRecord) {
    requestSeq.current += 1;
    setSuggestions([]);
    setSearching(false);
    setLoadingResult(true);
    setError(null);
    try {
      setResult(await api.get<BiometricsConfirmation>(`/api/students-staff/${person.id}/biometrics-confirmation`, token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ma'lumotni olib bo'lmadi — qayta urinib ko'ring");
    } finally {
      setLoadingResult(false);
    }
  }

  async function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const text = query.trim();
      if (text.length < MIN_QUERY_LENGTH) return;
      if (searchedFor === text && !searching && suggestions.length) {
        void choose(suggestions[Math.min(highlight, suggestions.length - 1)]);
        return;
      }
      const found = await runSearch(text);
      if (found && found.length === 1) void choose(found[0]);
    }
  }

  const trimmed = query.trim();
  const showEmpty = !searching && searchedFor === trimmed && trimmed.length >= MIN_QUERY_LENGTH && suggestions.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Yuz tasdiqlangan vaqtni aniqlash" maxWidth="max-w-xl">
      {!result && (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Ism, familiya yoki JSHSHIR yozing. Variantdan tanlang yoki Enter bosing — odam ro&apos;yxatdan o&apos;tish
            sahifasida yuzini qaysi kuni, soat nechida tasdiqlagani ko&apos;rsatiladi.
          </p>

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Masalan: Karimova Dilnoza"
              aria-label="Ism, familiya yoki JSHSHIR"
              aria-autocomplete="list"
              aria-controls="biometrics-lookup-suggestions"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {(searching || loadingResult) && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />
            )}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <ul
              id="biometrics-lookup-suggestions"
              role="listbox"
              className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5"
            >
              {suggestions.map((person, index) => (
                <li key={person.id} role="option" aria-selected={index === highlight}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => void choose(person)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      index === highlight ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {person.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{person.fullName}</span>
                      <span className="block truncate text-xs text-slate-500">{describePerson(person)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[person.biometricsStatus]}`} />
                      {STATUS_LABEL[person.biometricsStatus]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {suggestions.length > 1 && (
            <p className="text-[11px] text-slate-400">↑ ↓ — tanlash · Enter — aniqlash</p>
          )}

          {showEmpty && (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
              &laquo;{trimmed}&raquo; bo&apos;yicha hech kim topilmadi
            </p>
          )}
        </div>
      )}

      {result && <ConfirmationCard result={result} onBack={resetToSearch} />}
    </Modal>
  );
}

function ConfirmationCard({ result, onBack }: { result: BiometricsConfirmation; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft size={14} />
        Boshqa odamni aniqlash
      </button>

      <div className="flex items-center gap-3">
        {result.biometricPhotoUrl ? (
          <img
            src={result.biometricPhotoUrl}
            alt={result.fullName}
            className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-white"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-bold text-indigo-700">
            {result.initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-base font-extrabold text-slate-900">{result.fullName}</p>
          <p className="text-xs text-slate-500">{describePerson(result)}</p>
        </div>
      </div>

      {result.confirmedTime && result.confirmedAt ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            <Clock size={13} />
            Yuzini tasdiqlagan vaqti
          </p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight text-slate-900">{result.confirmedTime}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {result.confirmedDate}, {result.confirmedWeekday}
          </p>
          <p className="mt-1 text-xs text-slate-500">Toshkent vaqti (UTC+5) · {timeAgo(result.confirmedAt)}</p>
        </div>
      ) : result.source === 'nomalum' ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          Yuzi tasdiqlangan, lekin aniq vaqtni aniqlab bo&apos;lmadi: yuz rasmi omborda topilmadi.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Hali yuzini tasdiqlamagan</p>
          <p className="mt-1 text-xs text-slate-500">
            Holati: {STATUS_LABEL[result.biometricsStatus]}. Odam https://cam.fermi.uz/royxatdan-otish sahifasida
            JSHSHIR bilan kirib, yuzini tasdiqlashi kerak.
          </p>
        </div>
      )}

      {result.source === 'rasm' && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Bu odam tasdiqlash vaqtini yozish funksiyasi qo&apos;shilishidan oldin tasdiqlagan — vaqt uning yuz rasmi
          saqlangan paytdan tiklandi. Rasm tasdiqlash so&apos;rovining o&apos;zida saqlanadi, shuning uchun vaqt aniq.
        </p>
      )}
    </div>
  );
}
