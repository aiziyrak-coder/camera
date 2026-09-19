import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  FlaskConical,
  Gauge,
  ImageOff,
  Inbox,
  MessageSquare,
  Shuffle,
  Timer,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import ConfirmDialog from '../../components/ConfirmDialog';
import EventDrawer from '../../components/events/EventDrawer';
import ResolveDialog from '../../components/events/ResolveDialog';
import SlaBadge from '../../components/events/SlaBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SelectFilter from '../../components/ui/SelectFilter';
import { SkeletonCards, SkeletonTable } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { SEVERITY_LABEL, SEVERITY_STRIPE, SEVERITY_TONE, STATUS_LABEL, STATUS_TONE } from '../../lib/eventLabels';
import { isEventUpdate, isOpenStatus } from '../../lib/eventWorkflow';
import { useLiveEvents } from '../../lib/realtime';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { formatCount, formatMinutes, relativeTime } from '../../lib/uzDate';
import type { AIEvent, EventStatus, EventSummary } from '../../types';

type View = 'navbat' | 'jurnal' | 'sinov';
type Decision = 'tasdiqlangan' | 'rad_etilgan';
/** Tezkor filtrlar: menga tayinlangan, muddati o'tgan, hech kimga tayinlanmagan. */
type Quick = '' | 'mening' | 'muddati' | 'tayinlanmagan';

// Ko'rib chiqish navbati — qaror kutayotgan hodisalar.
const QUEUE_STATUSES = 'yangi,jarayonda';

const SEVERITY_OPTIONS: { value: '' | AIEvent['severity']; label: string }[] = [
  { value: '', label: 'Barchasi' },
  { value: 'yuqori', label: 'Yuqori' },
  { value: "o'rta", label: "O'rta" },
  { value: 'past', label: 'Past' },
];

// Sinov namunasi hajmi: bir o'tirishda baholash oson, lekin aniqlik uchun yetarli.
const TRIAL_SAMPLE_SIZE = 12;

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

function ReviewCard({
  event,
  busy,
  onOpen,
  onReview,
}: {
  event: AIEvent;
  busy: boolean;
  onOpen: () => void;
  onReview: (decision: Decision) => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/65">
      <div className={`h-1 ${SEVERITY_STRIPE[event.severity]}`} aria-hidden="true" />
      <button type="button" onClick={onOpen} className="relative block text-left" aria-label={`${event.moduleName} tafsilotlari`}>
        <Thumb event={event} className="aspect-video w-full" />
        <span className="absolute left-2 top-2 flex gap-1">
          <Badge tone={SEVERITY_TONE[event.severity]}>{SEVERITY_LABEL[event.severity]}</Badge>
          {event.isTrial && <Badge tone="amber">Sinov</Badge>}
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
        {event.details?.reason && (
          <p className="mt-1.5 line-clamp-2 text-xs text-slate-600" title={event.details.reason}>
            {event.details.reason}
          </p>
        )}
        {!event.isTrial && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {event.status === 'jarayonda' && <Badge tone={STATUS_TONE.jarayonda}>{STATUS_LABEL.jarayonda}</Badge>}
            <SlaBadge event={event} />
            {event.assignedToName && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <UserCheck size={11} aria-hidden="true" />
                {event.assignedToName}
              </span>
            )}
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <button
            type="button"
            onClick={() => onReview('rad_etilgan')}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={15} />
            Rad etish
          </button>
          <button
            type="button"
            onClick={() => onReview('tasdiqlangan')}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-btn hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={15} />
            Tasdiqlash
          </button>
        </div>
      </div>
    </article>
  );
}

export default function EventsPage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  // Hodisa — dalil: standart bo'yicha faqat Super Admin o'chiradi.
  const canDelete = can('deleteEvents', role);
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const korinish = params.get('korinish');
  const view: View = korinish === 'jurnal' ? 'jurnal' : korinish === 'sinov' ? 'sinov' : 'navbat';
  const queue = view === 'navbat';
  const trialView = view === 'sinov';
  // Navbat va sinov namunalari kartalar ko'rinishida: baholangan karta ro'yxatdan chiqadi.
  const cardView = queue || trialView;
  const severity = (params.get('muhimlik') ?? '') as '' | AIEvent['severity'];
  const statusFilter = (params.get('holat') ?? '') as '' | EventStatus;
  const tezParam = params.get('tez');
  const quick: Quick = tezParam === 'mening' || tezParam === 'muddati' || tezParam === 'tayinlanmagan' ? tezParam : '';
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
      status: queue ? QUEUE_STATUSES : statusFilter || (quick === 'tayinlanmagan' ? QUEUE_STATUSES : undefined),
      assignedTo: quick === 'mening' ? 'me' : quick === 'tayinlanmagan' ? 'none' : undefined,
      overdue: quick === 'muddati' ? 'true' : undefined,
      moduleCodes: moduleCode || undefined,
      building: building || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search.trim() || undefined,
      sort: quick === 'muddati' ? 'due' : queue ? 'severity' : undefined,
    },
    queue ? 12 : 20,
    { enabled: !trialView },
  );

  // Sinov namunasi: tasodifiy tanlangan, hali baholanmagan sinov signallari.
  const [sample, setSample] = useState<AIEvent[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sampleNonce, setSampleNonce] = useState(0);
  const [reviewedThisSession, setReviewedThisSession] = useState(0);

  useEffect(() => {
    if (!trialView || !token || !moduleCode) {
      setSample([]);
      return;
    }
    const controller = new AbortController();
    setSampleLoading(true);
    setSampleError(null);
    api
      .get<AIEvent[]>(`/api/ai-modules/${moduleCode}/trial-sample?limit=${TRIAL_SAMPLE_SIZE}`, token, {
        signal: controller.signal,
      })
      .then(setSample)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setSampleError(errorText(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSampleLoading(false);
      });
    return () => controller.abort();
  }, [trialView, moduleCode, token, sampleNonce]);

  const sourceItems = trialView ? sample : items;

  // Optimistik yangilanish: server javobini kutmasdan qaror ekranda ko'rinadi.
  const [overrides, setOverrides] = useState<Record<string, Partial<AIEvent>>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOverrides({});
    setHidden(new Set());
  }, [sourceItems]);
  const rows = useMemo(
    () => sourceItems.filter((e) => !hidden.has(e.id)).map((e) => ({ ...e, ...overrides[e.id] }) as AIEvent),
    [sourceItems, hidden, overrides],
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

  // Sinov ko'rinishiga modul tanlanmay kirilsa — eng ko'p baholanmagan signalli modul.
  useEffect(() => {
    if (trialView && !moduleCode && summary?.trialModules?.length) {
      setParam({ modul: summary.trialModules[0].value });
    }
  }, [trialView, moduleCode, summary, setParam]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleting, setDeleting] = useState<AIEvent | null>(null);
  const [pendingNew, setPendingNew] = useState(0);
  const [bulkResolving, setBulkResolving] = useState(false);

  useEffect(() => {
    setSelected(new Set());
  }, [page, view, severity, statusFilter, quick, moduleCode, building, from, to, search]);

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
      if (trialView) return;
      if (isEventUpdate(incoming)) {
        // Mavjud hodisa o'zgardi (tayinlash, holat, izoh, muddat) — joyida yangilanadi.
        if (sourceItems.some((e) => e.id === incoming.id)) {
          applyUpdated(incoming);
        } else if ((quick || statusFilter) && page === 1 && !openId) {
          // Filtrga endi mos kelib qolgan bo'lishi mumkin (masalan menga tayinlandi).
          invalidateServerPageCache('/api/events');
          reload();
        }
        return;
      }
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

  /** Server qaytargan (yoki WebSocket'dan kelgan) yangi holatni ekranga
   *  qo'yadi. Navbatda qaror qilingan hodisa ro'yxatdan chiqadi. */
  function applyUpdated(updated: AIEvent) {
    const fields: AIEvent = { ...updated };
    delete fields.kind;
    if (queue && !isOpenStatus(fields.status)) {
      const index = rows.findIndex((r) => r.id === fields.id);
      if (openId === fields.id) setOpenId(rows[index + 1]?.id ?? rows[index - 1]?.id ?? null);
      setHidden((prev) => new Set(prev).add(fields.id));
    } else {
      setOverrides((prev) => ({
        ...prev,
        [fields.id]: { ...fields, commentsCount: fields.commentsCount ?? prev[fields.id]?.commentsCount },
      }));
    }
  }

  function handleChanged(updated: AIEvent) {
    applyUpdated(updated);
    invalidateServerPageCache('/api/events');
    loadSummary();
  }

  async function review(event: AIEvent, decision: Decision) {
    if (busyId) return;
    const index = rows.findIndex((r) => r.id === event.id);
    const nextId = rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
    setBusyId(event.id);
    if (cardView) {
      setHidden((prev) => new Set(prev).add(event.id));
      if (openId === event.id) setOpenId(nextId);
    } else {
      setOverrides((prev) => ({ ...prev, [event.id]: { status: decision } }));
    }
    try {
      const updated = await api.patch<AIEvent>(`/api/events/${event.id}/review`, { status: decision }, token);
      if (!cardView) setOverrides((prev) => ({ ...prev, [event.id]: updated }));
      if (trialView) setReviewedThisSession((n) => n + 1);
      toast.success(decision === 'tasdiqlangan' ? 'Hodisa tasdiqlandi' : "Hodisa rad etildi (yolg'on signal)");
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

  async function bulkReview(decision: Decision | 'hal_qilindi', note?: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await api.post<{ updated: number; skipped: number }>(
        '/api/events/review-bulk',
        { ids, status: decision, note },
        token,
      );
      const verb = decision === 'tasdiqlangan' ? 'tasdiqlandi' : decision === 'rad_etilgan' ? 'rad etildi' : 'hal qilindi';
      toast.success(
        `${res.updated} ta hodisa ${verb}${res.skipped ? ` · ${res.skipped} tasi o'tkazib yuborildi (holati mos emas)` : ''}`,
      );
      setSelected(new Set());
      refreshAll();
    } catch (err) {
      // Yechim dialogi xatoni o'zida ko'rsatadi.
      if (note !== undefined) throw new Error(errorText(err));
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
    const deletedId = deleting.id;
    setDeleting(null);
    if (trialView) setSample((prev) => prev.filter((e) => e.id !== deletedId));
    refreshAll();
  }

  const activeFilters =
    [severity, !queue && statusFilter, quick, moduleCode, building, from || to, search.trim()].filter(Boolean).length;

  function resetFilters() {
    setSearch('');
    setParam({ muhimlik: null, holat: null, tez: null, modul: null, bino: null, from: null, to: null });
  }

  const quickFilters: { value: Exclude<Quick, ''>; label: string; count?: number; icon: ReactNode; alert?: boolean }[] = [
    { value: 'mening', label: 'Menga tayinlangan', count: summary?.assignedToMe, icon: <UserCheck size={13} /> },
    {
      value: 'muddati',
      label: "Muddati o'tgan",
      count: summary?.overdue,
      icon: <AlarmClock size={13} />,
      alert: !!summary && summary.overdue > 0,
    },
    { value: 'tayinlanmagan', label: 'Tayinlanmagan', count: summary?.unassigned, icon: <UserX size={13} /> },
  ];

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function renderCards() {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((event) => (
          <ReviewCard
            key={event.id}
            event={event}
            busy={busyId !== null}
            onOpen={() => setOpenId(event.id)}
            onReview={(decision) => review(event, decision)}
          />
        ))}
      </div>
    );
  }

  function renderTrialBody() {
    if (sampleError) return <ErrorState message={sampleError} onRetry={() => setSampleNonce((n) => n + 1)} />;
    if (!moduleCode) {
      return (
        <EmptyState
          icon={<FlaskConical size={18} />}
          title={summary && summary.trialUnreviewed === 0 ? "Baholanmagan sinov signali yo'q" : 'Baholash uchun modulni tanlang'}
          description="Sinov rejimidagi modul signal berganda, uning namunalari shu yerda paydo bo'ladi."
        />
      );
    }
    if (sampleLoading && rows.length === 0) return <SkeletonCards count={6} className="xl:grid-cols-3" />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<CheckCheck size={18} />}
          title={sample.length > 0 ? 'Bu namuna baholandi' : "Bu modulda baholanmagan signal qolmadi"}
          description="Yangi namuna olsangiz, tasodifiy tanlangan boshqa signallar ko'rsatiladi."
          action={
            <button type="button" onClick={() => setSampleNonce((n) => n + 1)} className="btn-glass flex items-center gap-1.5">
              <Shuffle size={14} />
              Yangi namuna
            </button>
          }
        />
      );
    }
    return renderCards();
  }

  return (
    <section className="glass p-4 sm:p-6">
      <PageHeader
        title="Hodisalar jurnali"
        subtitle="AI signallarini ko'rib chiqish: har birini tasdiqlash yoki yolg'on signal deb rad etish"
        action={
          <SegmentedControl
            options={[
              {
                value: 'navbat',
                label: "Ko'rib chiqish navbati",
                count: summary ? summary.unreviewed + (summary.inProgress ?? 0) : undefined,
              },
              { value: 'jurnal', label: "To'liq jurnal" },
              { value: 'sinov', label: 'Sinov namunalari', count: summary?.trialUnreviewed },
            ]}
            value={view}
            ariaLabel="Ko'rinish"
            onChange={(next) => {
              setOpenId(null);
              setParam({ korinish: next === 'navbat' ? null : next, holat: null, modul: null, tez: null });
            }}
          />
        }
      />

      {trialView ? (
        <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900">
          <FlaskConical size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">Sinov rejimidagi modullar signallari</p>
            <p className="mt-1 text-xs leading-relaxed">
              Bu modullar hali kalibrlanmagan, shuning uchun ularning signallari operator navbatiga, ogohlantirishlarga va
              hisobotlarga chiqmaydi. Quyida tasodifiy tanlangan namunalar — kadrga qarab haqqoniy baholang. Modul ishchi
              rejimga o&apos;tishi uchun kamida 30 ta baholangan signal va 80% aniqlik kerak (AI Modullari sahifasida).
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile
            icon={<Inbox size={19} />}
            label="Qaror kutmoqda"
            value={formatCount(summary ? summary.unreviewed + (summary.inProgress ?? 0) : undefined)}
            hint={
              summary
                ? summary.overdue > 0
                  ? `${summary.overdue} tasining muddati o'tgan · jarayonda: ${summary.inProgress}`
                  : `yuqori: ${summary.unreviewedHigh} · jarayonda: ${summary.inProgress}`
                : null
            }
            alert={!!summary && (summary.unreviewedHigh > 0 || summary.overdue > 0)}
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
            hint={summary?.recentPrecision == null ? "kamida 10 ta ko'rib chiqilgan signal kerak" : "tasdiqlangan / ko'rib chiqilgan"}
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
      )}

      {trialView ? (
        <FilterBar>
          <SelectFilter
            label="Modul"
            value={moduleCode}
            onChange={(value) => setParam({ modul: value || null })}
            allLabel="Modulni tanlang"
            options={(summary?.trialModules ?? []).map((m) => ({ value: m.value, label: `${m.label} (${m.count})` }))}
          />
          <button
            type="button"
            onClick={() => setSampleNonce((n) => n + 1)}
            disabled={!moduleCode || sampleLoading}
            className="btn-glass flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            <Shuffle size={13} />
            Yangi namuna
          </button>
          {reviewedThisSession > 0 && (
            <span className="text-xs font-semibold text-slate-500">Bu safar baholandi: {reviewedThisSession} ta</span>
          )}
        </FilterBar>
      ) : (
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
                { value: 'jarayonda', label: STATUS_LABEL.jarayonda, count: summary?.inProgress },
                { value: 'tasdiqlangan', label: STATUS_LABEL.tasdiqlangan, count: summary?.confirmed },
                { value: 'hal_qilindi', label: STATUS_LABEL.hal_qilindi, count: summary?.resolved },
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
      )}

      {!trialView && (
        <div className="-mt-1 mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Tezkor filtrlar">
          {quickFilters.map((filter) => {
            const active = quick === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={active}
                onClick={() => setParam({ tez: active ? null : filter.value })}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : filter.alert
                      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                      : 'border-white/80 bg-white/60 text-slate-600 hover:bg-white'
                }`}
              >
                {filter.icon}
                {filter.label}
                {filter.count !== undefined && (
                  <span className={`tabular-nums ${active ? 'text-white/80' : 'opacity-70'}`}>{filter.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!trialView && pendingNew > 0 && (
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

      {!trialView && error && <ErrorState message={error} onRetry={refreshAll} />}

      {trialView ? (
        renderTrialBody()
      ) : loading && rows.length === 0 ? (
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
        renderCards()
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
              <button
                type="button"
                onClick={() => setBulkResolving(true)}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                <CheckCircle2 size={13} />
                Hal qilindi
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-indigo-700 hover:underline">
                Tanlovni bekor qilish
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-white/70">
            <table className="w-full min-w-[64rem] text-left text-sm">
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
                  <th className="px-3 py-3">Mas&apos;ul / muddat</th>
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
                    <td className="px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs text-slate-600">
                        {event.assignedToName ?? <span className="text-slate-400">—</span>}
                        {!!event.commentsCount && (
                          <span className="inline-flex items-center gap-0.5 text-slate-400" title="Tarix yozuvlari va izohlar">
                            <MessageSquare size={11} aria-hidden="true" />
                            {event.commentsCount}
                          </span>
                        )}
                      </p>
                      <SlaBadge event={event} className="mt-1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!trialView && rows.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      )}

      <EventDrawer
        event={openEvent}
        onClose={() => setOpenId(null)}
        onReview={review}
        onChanged={trialView ? undefined : handleChanged}
        onDelete={canDelete ? setDeleting : undefined}
        onPrev={openIndex > 0 ? () => setOpenId(rows[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => setOpenId(rows[openIndex + 1].id) : undefined}
        position={openEvent ? `${openIndex + 1} / ${rows.length}` : undefined}
        busy={busyId !== null}
      />
      <ResolveDialog
        open={bulkResolving}
        count={selected.size}
        onCancel={() => setBulkResolving(false)}
        onConfirm={async (note) => {
          await bulkReview('hal_qilindi', note);
          setBulkResolving(false);
        }}
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
