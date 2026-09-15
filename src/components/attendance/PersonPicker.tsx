import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { api, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { StudentStaffRecord } from '../../types';

const MIN_QUERY_LENGTH = 2;
const SUGGESTION_LIMIT = 8;

/** Ism-familiya yoki JSHSHIR bo'yicha odam tanlash. Qidiruv POST tanasida
 *  ketadi — JSHSHIR URL, brauzer tarixi va access logga tushmaydi. */
export default function PersonPicker({
  onSelect,
  placeholder = "Ism-familiya yoki JSHSHIR bo'yicha qidiring",
}: {
  onSelect: (person: StudentStaffRecord) => void;
  placeholder?: string;
}) {
  const { token } = useAuth();
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StudentStaffRecord[]>([]);
  const [searchedFor, setSearchedFor] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (!token || text.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSearchedFor('');
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .post<Page<StudentStaffRecord>>('/api/students-staff/search', { search: text, pageSize: SUGGESTION_LIMIT }, token)
        .then((page) => {
          if (cancelled) return;
          setSuggestions(page.items);
          setHighlight(0);
        })
        .catch(() => !cancelled && setSuggestions([]))
        .finally(() => {
          if (cancelled) return;
          setSearchedFor(text);
          setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, token]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(person: StudentStaffRecord) {
    onSelect(person);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && open && suggestions.length) {
      event.preventDefault();
      choose(suggestions[Math.min(highlight, suggestions.length - 1)]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const trimmed = query.trim();
  const showEmpty =
    open && !searching && trimmed.length >= MIN_QUERY_LENGTH && searchedFor === trimmed && suggestions.length === 0;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Odamni qidirish"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="attendance-person-options"
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-xl border border-white/80 bg-white/70 py-2.5 pl-9 pr-9 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
      {searching ? (
        <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
      ) : (
        query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Qidiruvni tozalash"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )
      )}

      {open && suggestions.length > 0 && (
        <ul
          id="attendance-person-options"
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {suggestions.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(person)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  index === highlight ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                  {person.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{person.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[person.type === 'talaba' ? 'Talaba' : 'Xodim', person.faculty, person.groupOrPosition]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {person.biometricsStatus !== 'tasdiqlangan' && (
                  <span className="shrink-0 text-[11px] font-semibold text-amber-600">{"yuzi yo'q"}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <p className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm text-slate-500 shadow-lg">
          {`«${trimmed}» bo'yicha hech kim topilmadi`}
        </p>
      )}
    </div>
  );
}
