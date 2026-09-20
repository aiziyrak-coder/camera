import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Inbox,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Shuffle,
  Timer,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  RANGE_PRESET_LABELS,
  FilterBar,
  filterActiveCount,
  Select,
  Skeleton,
  StatTile,
  StatusBadge,
  Toolbar,
  cn,
  controlBase,
  detectPreset,
  rangeForPreset,
  toneForRate,
  useToast,
  useUrlTab,
  type DataTableColumn,
  type FilterFieldEntry,
  type TabItem,
} from '../../ui';
import EventDrawer from '../../components/events/EventDrawer';
import EventsPager from '../../components/events/EventsPager';
import ResolveDialog from '../../components/events/ResolveDialog';
import ReviewCard, { EventThumb } from '../../components/events/ReviewCard';
import SlaBadge from '../../components/events/SlaBadge';
import { ApiError, api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { SEVERITY_TONE, STATUS_LABEL } from '../../lib/eventLabels';
import { isEventUpdate, isOpenStatus } from '../../lib/eventWorkflow';
import type { FixedPreset } from '../../lib/reportPeriods';
import { useLiveEvents } from '../../lib/realtime';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import { formatCount, formatMinutes, relativeTime, todayInTashkent } from '../../lib/uzDate';
import type { AIEvent, EventStatus, EventSummary } from '../../types';

type View = 'navbat' | 'jurnal' | 'sinov';
type Decision = 'tasdiqlangan' | 'rad_etilgan';
/** Tezkor filtrlar: menga tayinlangan, muddati o'tgan, hech kimga tayinlanmagan. */
type Quick = '' | 'mening' | 'muddati' | 'tayinlanmagan';

// Ko'rib chiqish navbati — qaror kutayotgan hodisalar.
const QUEUE_STATUSES = 'yangi,jarayonda';

const SEVERITY_OPTIONS = [
  { value: 'yuqori', label: 'Yuqori' },
  { value: "o'rta", label: "O'rta" },
  { value: 'past', label: 'Past' },
];

const PERIOD_PRESETS: readonly FixedPreset[] = ['today', 'yesterday', 'last7', 'last30', 'month'];
const PERIOD_OPTIONS = [
  ...PERIOD_PRESETS.map((preset) => ({ value: preset, label: RANGE_PRESET_LABELS[preset] })),
  { value: 'custom', label: 'Oraliq…' },
];

// Sinov namunasi hajmi: bir o'tirishda baholash oson, lekin aniqlik uchun yetarli.
const TRIAL_SAMPLE_SIZE = 12;

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-border bg-surface">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickChip({
  active,
  alert,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  alert?: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
        active
          ? 'border-primary/40 bg-primary-soft text-primary'
          : alert
            ? 'border-danger/30 bg-danger-soft text-danger hover:border-danger/50'
            : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
      {count !== undefined && <span className="tabular-nums opacity-80">{count.toLocaleString('ru-RU')}</span>}
    </button>
  );
}

export default function EventsPage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  // Hodisa — dalil: standart bo'yicha faqat Super Admin o'chiradi.
  const canDelete = can('deleteEvents', role);
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);

  const tabs = useMemo<TabItem<View>[]>(
    () => [
      { id: 'navbat', label: 'Navbat', icon: Inbox, count: summary ? summary.unreviewed + (summary.inProgress ?? 0) : null },
      { id: 'jurnal', label: "To'liq jurnal", icon: ListChecks },
      { id: 'sinov', label: 'Sinov namunalari', icon: FlaskConical, count: summary ? summary.trialUnreviewed : null },
    ],
    [summary],
  );
  const [view] = useUrlTab(tabs, { param: 'korinish', defaultTab: 'navbat' });
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
  const linkedId = params.get('id');
  const [search, setSearch] = useState('');
  const [customPeriod, setCustomPeriod] = useState(false);

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

  const loadSummary = useCallback(() => {
    if (!token) return;
    api
      .get<EventSummary>('/api/events/summary', token)
      .then((next) => {
        setSummary(next);
        setSummaryError(false);
      })
      .catch(() => {
        /* tepa qator ikkinchi darajali — ro'yxat baribir ishlaydi */
        setSummaryError(true);
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

  // Ko'rinish (tab) almashganda — o'sha ko'rinishga xos filtrlar va ochiq panel tozalanadi.
  // Birinchi ochilishda emas: havola bilan kelgan filtrlar (?korinish=sinov&modul=…) saqlanadi.
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    setOpenId(null);
    setParam({ holat: null, modul: null, tez: null });
  }, [view, setParam]);

  // Bildirishnoma havolasi: /hodisalar?id=<uuid> — hodisa panelda ochiladi
  // (joriy sahifada bo'lmasa ham, serverdan alohida olinadi).
  const [linkedEvent, setLinkedEvent] = useState<AIEvent | null>(null);
  useEffect(() => {
    if (!linkedId || !token) {
      setLinkedEvent(null);
      return;
    }
    const controller = new AbortController();
    api
      .get<AIEvent>(`/api/events/${encodeURIComponent(linkedId)}`, token, { signal: controller.signal })
      .then(setLinkedEvent)
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        toast.error(err instanceof ApiError && err.status === 404 ? "Hodisa topilmadi — o'chirilgan bo'lishi mumkin" : errorText(err));
        setParam({ id: null });
      });
    return () => controller.abort();
    // toast barqaror emas bo'lishi mumkin — faqat id bo'yicha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId, token]);

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
        if (linkedEvent?.id === incoming.id) setLinkedEvent((prev) => (prev ? { ...prev, ...stripKind(incoming), commentsCount: incoming.commentsCount ?? prev.commentsCount } : prev));
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
  // Havola bilan ochilgan hodisa ro'yxatda bo'lsa — ro'yxatdagi (yangi) nusxasi.
  const drawerEvent = openEvent ?? (linkedEvent ? (rows.find((r) => r.id === linkedEvent.id) ?? linkedEvent) : null);

  function stripKind(event: AIEvent): AIEvent {
    const fields: AIEvent = { ...event };
    delete fields.kind;
    return fields;
  }

  /** Server qaytargan (yoki WebSocket'dan kelgan) yangi holatni ekranga
   *  qo'yadi. Navbatda qaror qilingan hodisa ro'yxatdan chiqadi. */
  function applyUpdated(updated: AIEvent) {
    const fields = stripKind(updated);
    if (linkedEvent?.id === fields.id) setLinkedEvent((prev) => (prev ? { ...prev, ...fields, commentsCount: fields.commentsCount ?? prev.commentsCount } : prev));
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

  function closeDrawer() {
    setOpenId(null);
    if (linkedId) setParam({ id: null });
  }

  async function review(event: AIEvent, decision: Decision) {
    if (busyId) return;
    const index = rows.findIndex((r) => r.id === event.id);
    const inRows = index >= 0;
    const nextId = inRows ? (rows[index + 1]?.id ?? rows[index - 1]?.id ?? null) : null;
    setBusyId(event.id);
    if (cardView && inRows) {
      setHidden((prev) => new Set(prev).add(event.id));
      if (openId === event.id) setOpenId(nextId);
    } else if (inRows) {
      setOverrides((prev) => ({ ...prev, [event.id]: { status: decision } }));
    }
    try {
      const updated = await api.patch<AIEvent>(`/api/events/${event.id}/review`, { status: decision }, token);
      if (!cardView && inRows) setOverrides((prev) => ({ ...prev, [event.id]: updated }));
      if (linkedEvent?.id === event.id) {
        if (cardView && inRows) closeDrawer();
        else setLinkedEvent(stripKind(updated));
      }
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
      const res = await api.post<{ updated: number; skipped: number }>('/api/events/review-bulk', { ids, status: decision, note }, token);
      const verb = decision === 'tasdiqlangan' ? 'tasdiqlandi' : decision === 'rad_etilgan' ? 'rad etildi' : 'hal qilindi';
      toast.success(`${res.updated} ta hodisa ${verb}${res.skipped ? ` · ${res.skipped} tasi o'tkazib yuborildi (holati mos emas)` : ''}`);
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
    if (linkedEvent?.id === deleting.id) closeDrawer();
    const deletedId = deleting.id;
    setDeleting(null);
    if (trialView) setSample((prev) => prev.filter((e) => e.id !== deletedId));
    refreshAll();
  }

  // --------------------------------------------------------------- filtrlar
  const periodValue = from || to ? detectPreset({ from, to }, PERIOD_PRESETS, todayInTashkent()) : customPeriod ? 'custom' : '';
  const showCustomDates = periodValue === 'custom';

  function selectPeriod(value: string) {
    if (value === '') {
      setCustomPeriod(false);
      setParam({ from: null, to: null });
    } else if (value === 'custom') {
      setCustomPeriod(true);
    } else {
      setCustomPeriod(false);
      const range = rangeForPreset(value as FixedPreset, todayInTashkent());
      setParam({ from: range.from, to: range.to });
    }
  }

  const moduleOptions = (trialView ? summary?.trialModules : summary?.modules) ?? [];
  const filterFields: FilterFieldEntry[] = [
    { kind: 'search', value: search, onChange: setSearch, placeholder: 'Kriteriya, kamera yoki shaxs…', ariaLabel: 'Hodisalarni qidirish' },
    {
      kind: 'select',
      label: 'Muhimlik',
      value: severity,
      onChange: (value: string) => setParam({ muhimlik: value || null }),
      placeholder: 'Barchasi',
      options: SEVERITY_OPTIONS,
    },
    // Navbat ko'rinishida holat allaqachon belgilangan — filtr ko'rinmaydi.
    !queue && {
      kind: 'select',
      label: 'Holat',
      value: statusFilter,
      onChange: (value: string) => setParam({ holat: value || null }),
      placeholder: `Barchasi${summary ? ` (${summary.total})` : ''}`,
      options: (
        [
          ['yangi', summary?.unreviewed],
          ['jarayonda', summary?.inProgress],
          ['tasdiqlangan', summary?.confirmed],
          ['hal_qilindi', summary?.resolved],
          ['rad_etilgan', summary?.rejected],
        ] as const
      ).map(([value, count]) => ({ value, label: `${STATUS_LABEL[value]}${count !== undefined ? ` (${count})` : ''}` })),
    },
    {
      kind: 'select',
      label: 'Modul',
      value: moduleCode,
      onChange: (value: string) => setParam({ modul: value || null }),
      placeholder: 'Barchasi',
      options: moduleOptions.map((m) => ({ value: m.value, label: `${m.label} (${m.count})` })),
    },
    {
      kind: 'select',
      label: 'Bino',
      value: building,
      onChange: (value: string) => setParam({ bino: value || null }),
      placeholder: 'Barchasi',
      options: (summary?.buildings ?? []).map((b) => ({ value: b.value, label: `${b.label} (${b.count})` })),
    },
    {
      kind: 'select',
      label: 'Davr',
      value: periodValue,
      onChange: selectPeriod,
      placeholder: 'Barcha vaqt',
      options: PERIOD_OPTIONS,
    },
    // Qo'lda sana oralig'i — "Davr: boshqa" tanlanganda.
    showCustomDates && {
      kind: 'custom',
      active: Boolean(from || to),
      onClear: () => setParam({ from: null, to: null }),
      render: (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            aria-label="Sanadan"
            value={from}
            max={to || undefined}
            onChange={(e) => setParam({ from: e.target.value || null })}
            className={cn(controlBase, 'h-9 w-auto px-3 text-sm tabular-nums')}
          />
          <span className="text-muted" aria-hidden="true">
            –
          </span>
          <input
            type="date"
            aria-label="Sanagacha"
            value={to}
            min={from || undefined}
            onChange={(e) => setParam({ to: e.target.value || null })}
            className={cn(controlBase, 'h-9 w-auto px-3 text-sm tabular-nums')}
          />
        </span>
      ),
    },
    // Tezkor chiplar alohida qatorda chiziladi, lekin sanoq va tozalash
    // uchun u ham xuddi shu ro'yxatda.
    { kind: 'custom', render: null, active: Boolean(quick), onClear: () => setParam({ tez: null }) },
  ];
  const activeFilters = filterActiveCount(filterFields);

  function resetFilters() {
    setSearch('');
    setCustomPeriod(false);
    // URL parametrlari bitta yozuvda tozalanadi (maydon-maydon emas) —
    // aks holda har biri alohida navigatsiya bo'lardi.
    setParam({ muhimlik: null, holat: null, tez: null, modul: null, bino: null, from: null, to: null });
  }

  const quickFilters: { value: Exclude<Quick, ''>; label: string; count?: number; icon: LucideIcon; alert?: boolean }[] = [
    { value: 'mening', label: 'Menga tayinlangan', count: summary?.assignedToMe, icon: UserCheck },
    { value: 'muddati', label: "Muddati o'tgan", count: summary?.overdue, icon: AlarmClock, alert: !!summary && summary.overdue > 0 },
    { value: 'tayinlanmagan', label: 'Tayinlanmagan', count: summary?.unassigned, icon: UserX },
  ];

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: DataTableColumn<AIEvent>[] = [
    {
      key: 'select',
      width: '2.75rem',
      mobileLabel: 'Tanlash',
      header: (
        <input
          type="checkbox"
          aria-label="Sahifadagi barcha hodisalarni tanlash"
          checked={allOnPageSelected}
          onChange={() => setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          className="h-4 w-4 cursor-pointer rounded accent-primary"
        />
      ),
      cell: (event) => (
        <input
          type="checkbox"
          aria-label={`${event.moduleName} hodisasini tanlash`}
          checked={selected.has(event.id)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(event.id)}
          className="h-4 w-4 cursor-pointer rounded accent-primary"
        />
      ),
    },
    {
      key: 'kadr',
      header: 'Kadr',
      width: '5.5rem',
      hideOnMobile: true,
      cell: (event) => <EventThumb event={event} className="h-10 w-16 rounded-[6px]" />,
    },
    {
      key: 'vaqt',
      header: 'Vaqt',
      mobileLabel: 'Vaqt',
      cell: (event) => (
        <span title={event.timestamp} className="whitespace-nowrap">
          <span className="block text-fg">{event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}</span>
          <span className="hidden font-mono text-[11px] text-subtle md:block">{event.timestamp}</span>
        </span>
      ),
    },
    {
      key: 'modul',
      header: 'Kriteriya',
      cell: (event) => (
        <span className="block min-w-0">
          <span className="block font-medium text-fg">{event.moduleName}</span>
          {event.personName && <span className="block text-xs text-muted">{event.personName}</span>}
        </span>
      ),
    },
    {
      key: 'kamera',
      header: 'Kamera / Bino',
      mobileLabel: 'Kamera',
      cell: (event) => (
        <span className="block min-w-0">
          <span className="block text-fg">{event.cameraName}</span>
          {event.building && <span className="hidden text-xs text-muted md:block">{event.building}</span>}
        </span>
      ),
    },
    { key: 'ishonch', header: 'Ishonch', align: 'right', cell: (event) => <span className="font-medium">{event.confidence}%</span> },
    { key: 'muhimlik', header: 'Muhimlik', cell: (event) => <StatusBadge kind="severity" status={event.severity} /> },
    { key: 'holat', header: 'Holat', cell: (event) => <StatusBadge kind="event" status={event.status} /> },
    {
      key: 'masul',
      header: "Mas'ul / muddat",
      hideOnMobile: true,
      cell: (event) => (
        <span className="block">
          <span className="flex items-center gap-1.5 text-[13px] text-fg">
            {event.assignedToName ?? <span className="text-subtle">—</span>}
            {!!event.commentsCount && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted" title="Tarix yozuvlari va izohlar">
                <MessageSquare size={12} aria-hidden="true" />
                {event.commentsCount}
              </span>
            )}
          </span>
          <SlaBadge event={event} className="mt-1" />
        </span>
      ),
    },
  ];


  const toolbar = trialView ? (
    <Toolbar
      end={
        reviewedThisSession > 0 ? <span className="text-[13px] text-muted">Bu safar baholandi: {reviewedThisSession} ta</span> : undefined
      }
    >
      <Select
        label="Modul"
        value={moduleCode}
        onChange={(value) => setParam({ modul: value || null })}
        placeholder="Modulni tanlang"
        options={moduleOptions.map((m) => ({ value: m.value, label: `${m.label} (${m.count})` }))}
      />
      <Button icon={Shuffle} onClick={() => setSampleNonce((n) => n + 1)} disabled={!moduleCode || sampleLoading}>
        Yangi namuna
      </Button>
    </Toolbar>
  ) : (
    <div className="flex flex-col gap-2.5">
      <FilterBar fields={filterFields} onReset={resetFilters} />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tezkor filtrlar">
        {quickFilters.map((filter) => (
          <QuickChip
            key={filter.value}
            active={quick === filter.value}
            alert={filter.alert}
            icon={filter.icon}
            label={filter.label}
            count={filter.count}
            onClick={() => setParam({ tez: quick === filter.value ? null : filter.value })}
          />
        ))}
      </div>
    </div>
  );

  // --------------------------------------------------------------- tanasi
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
          icon={FlaskConical}
          title={summary && summary.trialUnreviewed === 0 ? "Baholanmagan sinov signali yo'q" : 'Baholash uchun modulni tanlang'}
          description="Sinov rejimidagi modul signal berganda, uning namunalari shu yerda paydo bo'ladi."
        />
      );
    }
    if (sampleLoading && rows.length === 0) return <CardsSkeleton />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={CheckCheck}
          title={sample.length > 0 ? 'Bu namuna baholandi' : 'Bu modulda baholanmagan signal qolmadi'}
          description="Yangi namuna olsangiz, tasodifiy tanlangan boshqa signallar ko'rsatiladi."
          action={
            <Button icon={Shuffle} onClick={() => setSampleNonce((n) => n + 1)}>
              Yangi namuna
            </Button>
          }
        />
      );
    }
    return renderCards();
  }

  function renderQueueBody() {
    if (error && rows.length === 0) return <ErrorState variant="block" message={error} onRetry={refreshAll} />;
    if (loading && rows.length === 0) return <CardsSkeleton />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={CheckCheck}
          title={activeFilters ? "Filtrlarga mos ko'rib chiqilmagan signal yo'q" : "Navbat bo'sh — barcha signallar ko'rib chiqilgan"}
          description="Yangi signal kelsa, u shu yerda avtomatik paydo bo'ladi."
          action={activeFilters > 0 ? <Button onClick={resetFilters}>Filtrlarni tozalash</Button> : undefined}
        />
      );
    }
    return (
      <>
        {error && <ErrorState message={error} onRetry={refreshAll} />}
        {renderCards()}
      </>
    );
  }

  function renderJournal() {
    return (
      <>
        {selected.size > 0 && (
          <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-card border border-primary/30 bg-primary-soft px-3 py-2 shadow-card">
            <span className="text-sm font-semibold text-primary">{selected.size} ta tanlandi</span>
            <Button size="sm" variant="primary" icon={Check} onClick={() => bulkReview('tasdiqlangan')} disabled={bulkBusy}>
              Tasdiqlash
            </Button>
            <Button size="sm" icon={X} onClick={() => bulkReview('rad_etilgan')} disabled={bulkBusy}>
              Rad etish
            </Button>
            <Button size="sm" icon={CheckCircle2} onClick={() => setBulkResolving(true)} disabled={bulkBusy}>
              Hal qilindi
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
              Tanlovni bekor qilish
            </Button>
          </div>
        )}
        <DataTable
          ariaLabel="Hodisalar jurnali"
          columns={columns}
          rows={rows}
          rowKey={(event) => event.id}
          onRowClick={(event) => setOpenId(event.id)}
          selectedKey={drawerEvent?.id ?? null}
          rowTone={(event) => (event.severity === 'past' ? null : SEVERITY_TONE[event.severity])}
          loading={loading && rows.length === 0}
          loadingRows={8}
          error={error && rows.length === 0 ? error : null}
          onRetry={refreshAll}
          emptyTitle="Filtrlarga mos hodisa topilmadi"
          emptyAction={activeFilters > 0 ? <Button onClick={resetFilters}>Filtrlarni tozalash</Button> : undefined}
          mobileTitleKey="modul"
          maxHeight="none"
          dense
          manualSort
          footer={
            totalPages > 1 ? <EventsPager page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} /> : undefined
          }
        />
      </>
    );
  }

  const staleSerious = summary?.staleSeriousUnreviewed ?? 0;
  const waiting = summary ? summary.unreviewed + (summary.inProgress ?? 0) : null;

  return (
    <Page
      title="Hodisalar"
      subtitle="AI signallarini ko'rib chiqish: tasdiqlash yoki yolg'on signal deb rad etish, mas'ul tayinlash va yopish"
      tabs={tabs}
      tabParam="korinish"
      defaultTab="navbat"
      actions={
        <Button icon={RefreshCw} onClick={trialView ? () => setSampleNonce((n) => n + 1) : refreshAll} loading={!trialView && loading && rows.length > 0}>
          Yangilash
        </Button>
      }
      toolbar={toolbar}
    >
      {trialView ? (
        <div className="flex gap-3 rounded-card border border-warning/30 bg-warning-soft p-4">
          <FlaskConical size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm text-fg">
            <p className="font-semibold">Sinov rejimidagi modullar signallari</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Bu modullar hali kalibrlanmagan, shuning uchun ularning signallari operator navbatiga, ogohlantirishlarga va hisobotlarga
              chiqmaydi. Quyida tasodifiy tanlangan namunalar — kadrga qarab haqqoniy baholang. Modul ishchi rejimga o&apos;tishi uchun
              kamida 30 ta baholangan signal va 80% aniqlik kerak (AI modullari sahifasida).
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Qaror kutmoqda"
            icon={Inbox}
            value={formatCount(waiting)}
            tone={summary && (summary.unreviewedHigh > 0 || summary.overdue > 0) ? 'danger' : 'primary'}
            hint={
              summary
                ? summary.overdue > 0
                  ? `${summary.overdue} tasining muddati o'tgan · jarayonda: ${summary.inProgress}`
                  : `yuqori: ${summary.unreviewedHigh} · jarayonda: ${summary.inProgress}`
                : summaryError
                  ? "Ma'lumot yo'q"
                  : undefined
            }
            loading={!summary && !summaryError}
          />
          <StatTile
            label="Bugun"
            icon={BellRing}
            value={formatCount(summary?.today)}
            hint={summary ? `shundan jiddiy: ${summary.todaySerious}` : undefined}
            loading={!summary && !summaryError}
          />
          <StatTile
            label="Signallar aniqligi (30 kun)"
            icon={Gauge}
            value={summary?.recentPrecision == null ? '—' : `${summary.recentPrecision}%`}
            tone={toneForRate(summary?.recentPrecision ?? null)}
            progress={summary?.recentPrecision ?? null}
            hint={summary?.recentPrecision == null ? "kamida 10 ta ko'rib chiqilgan signal kerak" : "tasdiqlangan / ko'rib chiqilgan"}
            loading={!summary && !summaryError}
          />
          <StatTile
            label="O'rtacha ko'rib chiqish vaqti"
            icon={Timer}
            value={formatMinutes(summary?.avgReviewMinutes)}
            tone={staleSerious > 0 ? 'danger' : 'neutral'}
            hint={staleSerious > 0 ? `${staleSerious} ta jiddiy signal 24 soatdan beri kutmoqda` : 'signal kelgandan qarorgacha (30 kun)'}
            loading={!summary && !summaryError}
          />
        </div>
      )}

      {!trialView && pendingNew > 0 && (
        <Button
          variant="soft"
          icon={BellRing}
          fullWidth
          onClick={() => {
            setPendingNew(0);
            setPage(1);
            refreshAll();
          }}
        >
          {pendingNew} ta yangi hodisa — ko&apos;rsatish
        </Button>
      )}

      {trialView ? renderTrialBody() : queue ? renderQueueBody() : renderJournal()}

      {!trialView && queue && rows.length > 0 && (
        <EventsPager page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      )}

      <EventDrawer
        event={drawerEvent}
        onClose={closeDrawer}
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
        message={
          deleting ? `"${deleting.moduleName}" hodisasini o'chirishni tasdiqlaysizmi? Kadr ham o'chiriladi va buni ortga qaytarib bo'lmaydi.` : ''
        }
        confirmLabel="O'chirish"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Page>
  );
}
