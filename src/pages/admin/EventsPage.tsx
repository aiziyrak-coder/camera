import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BellRing, Check, CheckCheck, Gauge, ImageOff, Inbox, Timer, X } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import ConfirmDialog from '../../components/ConfirmDialog';
import EventDrawer from '../../components/events/EventDrawer';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SelectFilter from '../../components/ui/SelectFilter';
import { SkeletonCards, SkeletonTable } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { SEVERITY_LABEL, SEVERITY_STRIPE, SEVERITY_TONE, STATUS_LABEL, STATUS_TONE } from '../../lib/eventLabels';
import { useLiveEvents } from '../../lib/realtime';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { formatCount, formatMinutes, relativeTime } from '../../lib/uzDate';
import type { AIEvent, EventStatus, EventSummary } from '../../types';

type View = 'navbat' | 'jurnal';
type Decision = Exclude<EventStatus, 'yangi'>;

const SEVERITY_OPTIONS: { value: '' | AIEvent['severity']; label: string }[] = [
  { value: '', label: 'Barchasi' },
  { value: 'yuqori', label: 'Yuqori' },
  { value: "o'rta", label: "O'rta" },
  { value: 'past', label: 'Past' },
];

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  alert = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string | null;
  alert?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${alert ? 'border-red-200 bg-red-50/70' : 'border-white/70 bg-white/60'}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${alert ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-xl font-extrabold tabular-nums text-slate-900">{value}</p>
        {hint && <p className={`truncate text-[11px] ${alert ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{hint}</p>}
      </div>
    </div>
  );
}

function Thumb({ event, className }: { event: AIEvent; className: string }) {
  return event.snapshotUrl ? (
    <img src={event.snapshotUrl} alt="" loading="lazy" className={`${className} object-cover`} />
  ) : (
    <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-300`}>
      <ImageOff size={16} />
    </div>
  );
}

export default function EventsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const view: View = params.get('korinish') === 'jurnal' ? 'jurnal' : 'navbat';
  const queue = view === 'navbat';
  const severity = (params.get('muhimlik') ?? '') as '' | AIEvent['severity'];
  const statusFilter = (params.get('holat') ?? '') as '' | EventStatus;
  const moduleCode = params.get('modul') ?? '';
  const building = params.get('bino') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const [search, setSearch] = useState('');

  const setParam = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (value === null || value === '') p.delete(key);
            else p.set(key, value);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const { items, page, setPage, totalPages, total, pageSize, loading, error, reload } = useServerPage<AIEvent>(
    '/api/events',
    {
      severity: severity || undefined,
      status: queue ? 'yangi' : statusFilter || undefined,
      moduleCodes: moduleCode || undefined,
      building: building || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search.trim() || undefined,
      sort: queue ? 'severity' : undefined,
    },
    queue ? 12 : 20,
  );

  // Optimistik yangilanish: server javobini kutmasdan qaror ekranda ko'rinadi.
  const [overrides, setOverrides] = useState<Record<string, Partial<AIEvent>>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOverrides({});
    setHidden(new Set());
  }, [items]);
  const rows = useMemo(
    () => items.filter((e) => !hidden.has(e.id)).map((e) => ({ ...e, ...overrides[e.id] }) as AIEvent),
    [items, hidden, overrides],
  );

  const [summary, setSummary] = useState<EventSummary | null>(null);
  const loadSummary = useCallback(() => {
    if (!token) return;
    api
      .get<EventSummary>('/api/events/summary', token)
      .then(setSummary)
      .catch(() => {
        /* tepa qator ikkinchi darajali — ro'yxat baribir ishlaydi */
      });
  }, [token]);
  useEffect(loadSummary, [loadSummary]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleting, setDeleting] = useState<AIEvent | null>(null);
  const [pendingNew, setPendingNew] = useState(0);

  useEffect(() => {
    setSelected(new Set());
  }, [page, view, severity, statusFilter, moduleCode, building, from, to, search]);

  // Navbatdagi sahifa to'liq ko'rib chiqilsa, keyingisini yuklaymiz.
  useEffect(() => {
    if (queue && !loading && items.length > 0 && rows.length === 0) {
      invalidateServerPageCache('/api/events');
      reload();
    }
  }, [queue, loading, items.length, rows.length, reload]);

  const refreshAll = useCallback(() => {
    invalidateServerPageCache('/api/events');
    reload();
    loadSummary();
  }, [reload, loadSummary]);

  useLiveEvents(
    (incoming) => {
      loadSummary();
      if (incoming.status !== 'yangi') {
        // Boshqa operator ko'rib chiqdi — ro'yxatni jimgina yangilaymiz.
        invalidateServerPageCache('/api/events');
        reload();
      } else if (page === 1 && !openId) {
        invalidateServerPageCache('/api/events');
        reload();
      } else {
        setPendingNew((n) => n + 1);
      }
    },
    true,
    () => refreshAll(),
  );

  const openIndex = rows.findIndex((r) => r.id === openId);
  const openEvent = openIndex >= 0 ? rows[openIndex] : null;

  async function review(event: AIEvent, decision: Decision) {
    if (busyId) return;
    const index = rows.findIndex((r) => r.id === event.id);
    const nextId = rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
    setBusyId(event.id);
    if (queue) {
      setHidden((prev) => new Set(prev).add(event.id));
      if (openId === event.id) setOpenId(nextId);
    } else {
      setOverrides((prev) => ({ ...prev, [event.id]: { status: decision } }));
    }
    try {
      const updated = await api.patch<AIEvent>(`/api/events/${event.id}/review`, { status: decision }, token);
      if (!queue) setOverrides((prev) => ({ ...prev, [event.id]: updated }));
      toast.success(decision === 'tasdiqlangan' ? 'Hodisa tasdiqlandi' : 'Hodisa rad etildi (yolg\'on signal)');
      invalidateServerPageCache('/api/events');
      loadSummary();
    } catch (err) {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });
      toast.error(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function bulkReview(decision: Decision) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await api.post<{ updated: number; skipped: number }>('/api/events/review-bulk', { ids, status: decision }, token);
      toast.success(`${res.updated} ta hodisa ${decision === 'tasdiqlangan' ? 'tasdiqlandi' : 'rad etildi'}`);
      setSelected(new Set());
      refreshAll();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/events/${deleting.id}`, token);
    } catch (err) {
      throw new Error(errorText(err));
    }
    toast.success("Hodisa o'chirildi");
    if (openId === deleting.id) setOpenId(null);
    setDeleting(null);
    refreshAll();
  }

  const activeFilters =
    [severity, !queue && statusFilter, moduleCode, building, from || to, search.trim()].filter(Boolean).length;

  function resetFilters() {
    setSearch('');
    setParam({ muhimlik: null, holat: null, modul: null, bino: null, from: null, to: null });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <section className="glass p-6">
      <PageHeader
        title="Hodisalar jurnali"
        subtitle="AI signallarini ko'rib chiqish: har birini tasdiqlash yoki yolg'on signal deb rad etish"
        action={
          <SegmentedControl
            options={[
              { value: 'navbat', label: "Ko'rib chiqish navbati", count: summary?.unreviewed },
              { value: 'jurnal', label: "To'liq jurnal" },
            ]}
            value={view}
            ariaLabel="Ko'rinish"
            onChange={(next) => {
              setOpenId(null);
              setParam({ korinish: next === 'jurnal' ? 'jurnal' : null, holat: null });
            }}
          />
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={<Inbox size={19} />}
          label="Ko'rib chiqilmagan"
          value={formatCount(summary?.unreviewed)}
          hint={summary ? `yuqori: ${summary.unreviewedHigh} · o'rta: ${summary.unreviewedMedium}` : null}
          alert={!!summary && summary.unreviewedHigh > 0}
        />
        <SummaryTile
          icon={<BellRing size={19} />}
          label="Bugun"
          value={formatCount(summary?.today)}
          hint={summary ? `shundan jiddiy: ${summary.todaySerious}` : null}
        />
        <SummaryTile
          icon={<Gauge size={19} />}
          label="Signallar aniqligi (30 kun)"
          value={summary?.recentPrecision == null ? '—' : `${summary.recentPrecision}%`}
          hint={summary?.recentPrecision == null ? "kamida 10 ta ko'rib chiqilgan signal kerak" : 'tasdiqlangan / ko\'rib chiqilgan'}
        />
        <SummaryTile
          icon={<Timer size={19} />}
          label="O'rtacha ko'rib chiqish vaqti"
          value={formatMinutes(summary?.avgReviewMinutes)}
          hint={
            summary && summary.staleSeriousUnreviewed > 0
              ? `${summary.staleSeriousUnreviewed} ta jiddiy signal 24 soatdan beri kutmoqda`
              : 'signal kelgandan qarorgacha (30 kun)'
          }
          alert={!!summary && summary.staleSeriousUnreviewed > 0}
        />
      </div>

      <FilterBar activeCount={activeFilters} onReset={resetFilters}>
        <SegmentedControl
          options={SEVERITY_OPTIONS}
          value={severity}
          size="sm"
          ariaLabel="Muhimlik"
          onChange={(value) => setParam({ muhimlik: value || null })}
        />
        {!queue && (
          <SegmentedControl
            options={[
              { value: '', label: 'Barchasi', count: summary?.total },
              { value: 'yangi', label: STATUS_LABEL.yangi, count: summary?.unreviewed },
              { value: 'tasdiqlangan', label: STATUS_LABEL.tasdiqlangan, count: summary?.confirmed },
              { value: 'rad_etilgan', label: STATUS_LABEL.rad_etilgan, count: summary?.rejected },
            ]}
            value={statusFilter}
            size="sm"
            ariaLabel="Holat"
            onChange={(value) => setParam({ holat: value || null })}
          />
        )}
        <SelectFilter
          label="Modul"
          value={moduleCode}
          onChange={(value) => setParam({ modul: value || null })}
          options={(summary?.modules ?? []).map((m) => ({ value: m.value, label: `${m.label} (${m.count})` }))}
        />
        <SelectFilter
          label="Bino"
          value={building}
          onChange={(value) => setParam({ bino: value || null })}
          options={(summary?.buildings ?? []).map((b) => ({ value: b.value, label: `${b.label} (${b.count})` }))}
        />
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <label htmlFor="events-from">Sana</label>
          <input
            id="events-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setParam({ from: e.target.value || null })}
            className="rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300"
          />
          <span aria-hidden="true">—</span>
          <input
            type="date"
            aria-label="Sana gacha"
            value={to}
            min={from || undefined}
            onChange={(e) => setParam({ to: e.target.value || null })}
            className="rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300"
          />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Kriteriya, kamera yoki shaxs..." ariaLabel="Hodisalarni qidirish" />
      </FilterBar>

      {pendingNew > 0 && (
        <button
          type="button"
          onClick={() => {
            setPendingNew(0);
            setPage(1);
            refreshAll();
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-btn hover:bg-indigo-700"
        >
          <BellRing size={15} />
          {pendingNew} ta yangi hodisa — ko&apos;rsatish
        </button>
      )}

      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {loading && rows.length === 0 ? (
        queue ? <SkeletonCards count={6} className="xl:grid-cols-3" /> : <SkeletonTable rows={8} columns={7} />
      ) : rows.length === 0 ? (
        queue ? (
          <EmptyState
            icon={<CheckCheck size={18} />}
            title={activeFilters ? "Filtrlarga mos ko'rib chiqilmagan signal yo'q" : "Navbat bo'sh — barcha signallar ko'rib chiqilgan"}
            description="Yangi signal kelsa, u shu yerda avtomatik paydo bo'ladi."
          />
        ) : (
          <EmptyState
            title="Filtrlarga mos hodisa topilmadi"
            action={
              activeFilters > 0 && (
                <button type="button" onClick={resetFilters} className="btn-glass">
                  Filtrlarni tozalash
                </button>
              )
            }
          />
        )
      ) : queue ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((event) => (
            <article key={event.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/65">
              <div className={`h-1 ${SEVERITY_STRIPE[event.severity]}`} aria-hidden="true" />
              <button type="button" onClick={() => setOpenId(event.id)} className="relative block text-left" aria-label={`${event.moduleName} tafsilotlari`}>
                <Thumb event={event} className="aspect-video w-full" />
                <span className="absolute left-2 top-2">
                  <Badge tone={SEVERITY_TONE[event.severity]}>{SEVERITY_LABEL[event.severity]}</Badge>
                </span>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white" title={event.timestamp}>
                  {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
                </span>
              </button>
              <div className="flex flex-1 flex-col p-3">
                <p className="font-semibold text-slate-900">{event.moduleName}</p>
                {event.personName && <p className="text-xs text-slate-600">{event.personName}</p>}
                <p className="text-xs text-slate-500">
                  {event.cameraName}
                  {event.building ? ` · ${event.building}` : ''} · ishonch {event.confidence}%
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => review(event, 'rad_etilgan')}
                    disabled={busyId !== null}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={15} />
                    Rad etish
                  </button>
                  <button
                    type="button"
                    onClick={() => review(event, 'tasdiqlangan')}
                    disabled={busyId !== null}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-btn hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check size={15} />
                    Tasdiqlash
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/95 px-3 py-2 backdrop-blur">
              <span className="text-sm font-semibold text-indigo-900">{selected.size} ta tanlandi</span>
              <button
                type="button"
                onClick={() => bulkReview('tasdiqlangan')}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={13} />
                Tasdiqlash
              </button>
              <button
                type="button"
                onClick={() => bulkReview('rad_etilgan')}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={13} />
                Rad etish
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-indigo-700 hover:underline">
                Tanlovni bekor qilish
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-white/70">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Sahifadagi barcha hodisalarni tanlash"
                      checked={allOnPageSelected}
                      onChange={() => setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="h-4 w-4 rounded accent-indigo-600"
                    />
                  </th>
                  <th className="px-3 py-3">Kadr</th>
                  <th className="px-3 py-3">Vaqt</th>
                  <th className="px-3 py-3">Kriteriya</th>
                  <th className="px-3 py-3">Kamera / Bino</th>
                  <th className="px-3 py-3 text-right">Ishonch</th>
                  <th className="px-3 py-3">Muhimlik</th>
                  <th className="px-3 py-3">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {rows.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => setOpenId(event.id)}
                    className={`cursor-pointer transition-colors hover:bg-white/50 ${selected.has(event.id) ? 'bg-indigo-50/60' : ''}`}
                  >
                    <td className="relative px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <span className={`absolute inset-y-1 left-0 w-1 rounded-full ${SEVERITY_STRIPE[event.severity]}`} aria-hidden="true" />
                      <input
                        type="checkbox"
                        aria-label={`${event.moduleName} hodisasini tanlash`}
                        checked={selected.has(event.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(event.id)) next.delete(event.id);
                            else next.add(event.id);
                            return next;
                          })
                        }
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Thumb event={event} className="h-10 w-16 rounded-lg" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" title={event.timestamp}>
                      <p className="text-slate-800">{event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}</p>
                      <p className="font-mono text-[11px] text-slate-400">{event.timestamp}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{event.moduleName}</p>
                      {event.personName && <p className="text-xs text-slate-500">{event.personName}</p>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {event.cameraName}
                      <p className="text-xs text-slate-400">{event.building}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{event.confidence}%</td>
                    <td className="px-3 py-2">
                      <Badge tone={SEVERITY_TONE[event.severity]}>{SEVERITY_LABEL[event.severity]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      )}

      <EventDrawer
        event={openEvent}
        onClose={() => setOpenId(null)}
        onReview={review}
        onDelete={setDeleting}
        onPrev={openIndex > 0 ? () => setOpenId(rows[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => setOpenId(rows[openIndex + 1].id) : undefined}
        position={openEvent ? `${openIndex + 1} / ${rows.length}` : undefined}
        busy={busyId !== null}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Hodisani o'chirish"
        message={deleting ? `"${deleting.moduleName}" hodisasini o'chirishni tasdiqlaysizmi? Kadr ham o'chiriladi va buni ortga qaytarib bo'lmaydi.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
