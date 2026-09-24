import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Search, ShieldAlert, UserCheck, X } from 'lucide-react';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { isBackendConfigured } from '../../lib/config';
import {
  assignSighting,
  dismissSighting,
  getSightings,
  likelihoodHint,
  markStranger,
  sightingTime,
  type Sighting,
} from '../../lib/notanishlarApi';
import { usePermissions } from '../../lib/permissions';
import { searchPeople } from '../../lib/teachersApi';
import type { StudentStaffRecord } from '../../types';
import { cn, useToast } from '../../ui';
import Panel from '../Panel';
import { rowIn } from '../motion';

/**
 * NOTANISHLAR paneli — begona shaxs modulining kunduzgi yuzi.
 *
 * Kunduzi notanish yuz signal chalmaydi: talabalarning ko'pchiligining
 * yuzi hali tizimda yo'q, ular "begona" bo'lib chiqardi. O'rniga shu
 * yerda rasmi bilan turadi, operator esa bir bosishda hal qiladi:
 *
 *   Talaba  — kimligini tanlaydi; yuz o'sha odamga biriktiriladi va
 *             ertaga kamera uni o'zi taniydi (qamrov o'sadi);
 *   Begona  — hodisa yaratiladi;
 *   O'tkaz  — ahamiyatsiz kadr.
 */

const PREVIEW = 6;

export default function UnknownPanel({
  date,
  pulse,
  expanded,
  onExpand,
  area,
}: {
  date: string;
  /** Jonli yangilanish — ro'yxat qayta so'raladi. */
  pulse: number;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}) {
  const { role } = useAuth();
  const { can } = usePermissions();
  const allowed = can('reviewEvents', role);
  const [items, setItems] = useState<Sighting[] | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!allowed || !isBackendConfigured) return;
    const controller = new AbortController();
    getSightings({ sana: date, holat: 'kutilmoqda', limit: expanded ? 120 : PREVIEW }, { signal: controller.signal })
      .then((res) => {
        setItems(res.items);
        setPending(res.pending);
        setError(null);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Ro'yxat olinmadi");
      });
    return () => controller.abort();
  }, [allowed, date, expanded, pulse, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const remove = useCallback((id: string) => {
    setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
    setPending((n) => (n === null ? n : Math.max(0, n - 1)));
  }, []);

  const badge =
    pending !== null ? (
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
          pending > 0 ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-subtle',
        )}
      >
        {pending}
      </span>
    ) : null;

  return (
    <Panel
      id="unknown"
      title="Notanishlar"
      badge={badge}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      full={
        <Expanded
          items={items}
          error={error}
          allowed={allowed}
          onResolved={remove}
          onRetry={refresh}
        />
      }
    >
      <Collapsed items={items} pending={pending} error={error} allowed={allowed} />
    </Panel>
  );
}

function Collapsed({
  items,
  pending,
  error,
  allowed,
}: {
  items: Sighting[] | null;
  pending: number | null;
  error: string | null;
  allowed: boolean;
}) {
  if (!allowed) return <p className="px-4 py-3 text-[12px] text-subtle">Huquq yo‘q</p>;
  if (!isBackendConfigured || error) return <p className="px-4 py-3 text-[12px] text-subtle">Ma’lumot olinmadi</p>;
  if (items === null) return <p className="px-4 py-3 text-[12px] text-subtle">Yuklanmoqda…</p>;
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-1 px-4">
        <span className="text-[13px] font-semibold text-success">Bugun notanish yo‘q</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 px-4 pb-3">
      <span className="text-[12px] text-muted">
        <b className="text-fg">{pending}</b> ta yuz ko‘rib chiqilmagan
      </span>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5">
        {items.slice(0, PREVIEW).map((item) => (
          <Face key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function Face({ item, className }: { item: Sighting; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface-3', className)}>
      {item.cropUrl ? (
        <img src={item.cropUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid h-full w-full place-items-center text-[10px] text-subtle">rasm yo‘q</span>
      )}
      {item.hits > 1 && (
        <span className="absolute right-1 top-1 rounded-full bg-black/55 px-1.5 text-[10px] font-bold text-white">
          ×{item.hits}
        </span>
      )}
    </div>
  );
}

function Expanded({
  items,
  error,
  allowed,
  onResolved,
  onRetry,
}: {
  items: Sighting[] | null;
  error: string | null;
  allowed: boolean;
  onResolved: (id: string) => void;
  onRetry: () => void;
}) {
  if (!allowed) return <p className="p-6 text-center text-[13px] text-subtle">Huquq yo‘q</p>;
  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-[13px] text-danger">{error}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-[13px] font-semibold text-primary underline">
          Qayta urinish
        </button>
      </div>
    );
  }
  if (items === null) return <p className="p-6 text-center text-[13px] text-subtle">Yuklanmoqda…</p>;
  if (items.length === 0) {
    return <p className="p-6 text-center text-[14px] font-semibold text-success">Hammasi ko‘rib chiqilgan</p>;
  }
  return (
    <div className="h-full overflow-y-auto px-4 pb-4">
      <p className="mb-3 text-[12px] text-muted">
        Ko‘p ko‘ringani birinchi — ehtimol yuzi kiritilmagan talaba.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li key={item.id} variants={rowIn} initial="hidden" animate="show" exit="exit" layout>
              <Card item={item} onResolved={onResolved} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function Card({ item, onResolved }: { item: Sighting; onResolved: (id: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'idle' | 'pick'>('idle');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hint = likelihoodHint(item.closestSimilarity);

  async function act(run: () => Promise<{ message: string }>) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await run();
      toast.success(res.message);
      onResolved(item.id);
    } catch (err) {
      // Server sababini aytadi ("boshqa odamga o'xshaydi" va h.k.) —
      // karta ochiq qoladi, operator boshqasini tanlaydi.
      setProblem(err instanceof ApiError ? err.message : 'Bajarilmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-xl">
      <Face item={item} className="aspect-[3/4] rounded-none" />
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <span className="truncate text-[12px] font-semibold text-fg">{item.cameraName ?? 'Kamera'}</span>
        <span className="text-[11px] text-muted">
          {sightingTime(item.firstSeenAt)}
          {item.hits > 1 ? ` · ${item.hits} marta` : ''}
        </span>
        {hint && <span className="text-[11px] font-medium text-warning">{hint}</span>}
        {problem && <span className="text-[11px] font-medium text-danger">{problem}</span>}
      </div>

      {mode === 'pick' ? (
        <PersonPicker
          busy={busy}
          onCancel={() => setMode('idle')}
          onPick={(person) => act(() => assignSighting(item.id, person.id))}
        />
      ) : (
        <div className="mt-auto grid grid-cols-3 border-t border-white/70">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('pick')}
            className="flex items-center justify-center gap-1 py-2 text-[12px] font-semibold text-primary hover:bg-primary-soft disabled:opacity-50"
          >
            <UserCheck size={13} aria-hidden="true" />
            Talaba
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => markStranger(item.id))}
            className="flex items-center justify-center gap-1 py-2 text-[12px] font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <ShieldAlert size={13} aria-hidden="true" />
            Begona
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => dismissSighting(item.id))}
            aria-label="O‘tkazib yuborish"
            className="flex items-center justify-center py-2 text-subtle hover:bg-surface-2 disabled:opacity-50"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Kimligini tanlash — ism bo'yicha qidiruv, yuzi borlari belgilanadi. */
function PersonPicker({
  busy,
  onPick,
  onCancel,
}: {
  busy: boolean;
  onPick: (person: StudentStaffRecord) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentStaffRecord[]>([]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPeople(text, 6, { signal: controller.signal })
        .then(setResults)
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-white/70 p-2">
      <label className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2">
        <Search size={12} aria-hidden="true" className="text-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ism familiya"
          aria-label="Kimligini qidirish"
          className="h-7 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        />
        <button type="button" onClick={onCancel} aria-label="Bekor qilish" className="text-subtle">
          <X size={12} aria-hidden="true" />
        </button>
      </label>
      <ul className="max-h-40 overflow-y-auto">
        {results.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(person)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-primary-soft disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-fg">{person.fullName}</span>
                <span className="block truncate text-[10px] text-muted">{person.groupOrPosition}</span>
              </span>
              {person.biometricsStatus === 'tasdiqlangan' ? (
                <Check size={12} aria-label="Yuzi bor" className="shrink-0 text-success" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
