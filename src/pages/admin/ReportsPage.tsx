import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, Download, FileText, Landmark, ListChecks, RefreshCw, Trophy, Users2 } from 'lucide-react';
import {
  Button,
  DatePicker,
  DateRangePicker,
  ErrorState,
  IconButton,
  Menu,
  Page,
  SearchInput,
  Select,
  StatTile,
  Tabs,
  Toolbar,
  cn,
  focusRing,
  formatNumber,
  formatPercent,
  formatUzDate,
  formatUzRange,
  rangeForPreset,
  useToast,
  useUrlTab,
  type DateRangeValue,
  type TabItem,
} from '../../ui';
import CriteriaCards from '../../components/reports/CriteriaCards';
import CriterionPeople from '../../components/reports/CriterionPeople';
import CriterionEvents from '../../components/reports/CriterionEvents';
import PersonReport from '../../components/reports/PersonReport';
import AnalyticsView from '../../components/reports/AnalyticsView';
import { GroupsRanking, KafedrasRanking } from '../../components/reports/RankingTables';
import { rankByRate } from '../../components/reports/rankByRate';
import EventDrawer from '../../components/events/EventDrawer';
import { ApiError, api, buildQuery } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { exportRowsAsCsv } from '../../lib/csvExport';
import { situationPaths, type GroupStat, type KafedraStat } from '../../lib/situationApi';
import { useApiResource } from '../../lib/useApiResource';
import { useServerPage } from '../../lib/useServerPage';
import { useViewDate } from '../../lib/viewDate';
import type { AIEvent, ReportAnalytics, ReportCriteria, ReportPeriodKey, ReportPersonDetail, ReportPersonRow, ReportPopulation } from '../../types';

/** Hisobotlar.
 *
 * «Mezonlar» — "kriteriya → ro'yxat → isbot" uch darajasi: populyatsiya
 * (o'qituvchi/xodim yoki talaba) → davr → kriteriya kartalari → raqam
 * ortidagi odamlar → odamning o'zi (o'ng panel). Har daraja URL'da:
 * ?bolim=&davr=&kriteriya=&guruh=&odam= — havolani ulashish va "orqaga"
 * ishlaydi. «Tahlil» — davr tahlili (KPI, grafiklar) va rasmiy PDF.
 * «Guruhlar» / «Kafedralar» — tanlangan kun bo'yicha davomat reytingi. */

type TabId = 'mezonlar' | 'tahlil' | 'guruhlar' | 'kafedralar';

const TABS: TabItem<TabId>[] = [
  { id: 'mezonlar', label: 'Mezonlar', icon: ListChecks },
  { id: 'tahlil', label: 'Tahlil', icon: BarChart3 },
  { id: 'guruhlar', label: 'Guruhlar reytingi', icon: Users2 },
  { id: 'kafedralar', label: 'Kafedralar reytingi', icon: Landmark },
];

const POPULATIONS: TabItem<ReportPopulation>[] = [
  { id: 'xodim', label: "O'qituvchilar" },
  { id: 'talaba', label: 'Talabalar' },
];

const PERIODS: TabItem<ReportPeriodKey>[] = [
  { id: 'bugun', label: 'Bugun' },
  { id: 'kecha', label: 'Kecha' },
  { id: 'hafta', label: 'Hafta' },
  { id: 'oy', label: 'Oylik' },
];

const PEOPLE_PAGE_SIZE = 20;
const EVENTS_PAGE_SIZE = 20;

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return `${fallback}: ${err.message}`;
  return fallback;
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, userName } = useAuth();
  const viewDate = useViewDate();
  const [tab] = useUrlTab(TABS);

  // ───────────── Mezonlar (URL holati)
  const population: ReportPopulation = params.get('bolim') === 'talaba' ? 'talaba' : 'xodim';
  const periodKey = (PERIODS.find((item) => item.id === params.get('davr'))?.id ?? 'bugun') as ReportPeriodKey;
  const criterionKey = params.get('kriteriya');
  const bucket = params.get('guruh') ?? '';
  const personId = params.get('odam');

  const [search, setSearch] = useState('');
  const [openEvent, setOpenEvent] = useState<AIEvent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      });
    },
    [setParams],
  );

  const onCriteria = tab === 'mezonlar';
  const criteriaUrl = onCriteria ? `/api/reports/criteria${buildQuery({ population, period: periodKey })}` : null;
  const { data: criteria, loading: criteriaLoading, error: criteriaError, reload: reloadCriteria } = useApiResource<ReportCriteria>(criteriaUrl);

  const criterion = useMemo(() => criteria?.criteria.find((item) => item.key === criterionKey) ?? null, [criteria, criterionKey]);
  const activeBucket = bucket || criterion?.buckets[0]?.key || '';

  const peopleEnabled = Boolean(onCriteria && criterion && criterion.detail === 'people');
  const people = useServerPage<ReportPersonRow>(
    `/api/reports/criteria/${criterion?.key ?? 'davomat'}/people`,
    { population, period: periodKey, bucket: activeBucket, search: search.trim() || undefined },
    PEOPLE_PAGE_SIZE,
    { enabled: peopleEnabled },
  );

  const eventsEnabled = Boolean(onCriteria && criterion && criterion.detail === 'events');
  const events = useServerPage<AIEvent>(
    '/api/events',
    {
      moduleCodes: criterion?.moduleCodes.join(',') || undefined,
      from: criteria?.period.start,
      to: criteria?.period.end,
      status: activeBucket || undefined,
    },
    EVENTS_PAGE_SIZE,
    { enabled: eventsEnabled },
  );

  const personUrl = personId ? `/api/reports/people/${personId}${buildQuery({ period: periodKey })}` : null;
  const { data: person, loading: personLoading, error: personError, reload: reloadPerson } = useApiResource<ReportPersonDetail>(personUrl);

  const level: 'cards' | 'people' | 'events' = criterion?.detail === 'people' ? 'people' : criterion?.detail === 'events' ? 'events' : 'cards';

  // ───────────── Tahlil
  const [range, setRange] = useState<DateRangeValue>(() => rangeForPreset('week'));
  const analyticsUrl = tab === 'tahlil' ? `/api/reports/analytics${buildQuery({ from: range.from, to: range.to })}` : null;
  const { data: analytics, loading: analyticsLoading, error: analyticsError, reload: reloadAnalytics } = useApiResource<ReportAnalytics>(analyticsUrl);
  const analyticsRef = useRef<HTMLDivElement>(null);

  // ───────────── Reytinglar (global sana)
  const [rankSearch, setRankSearch] = useState('');
  const [rankFaculty, setRankFaculty] = useState('');
  const [rankCourse, setRankCourse] = useState('');
  const groupsUrl = tab === 'guruhlar' ? `/api/situation/groups${buildQuery({ date: viewDate.date })}` : null;
  const kafedrasUrl = tab === 'kafedralar' ? `/api/situation/kafedras${buildQuery({ date: viewDate.date })}` : null;
  const groupsRes = useApiResource<GroupStat[]>(groupsUrl);
  const kafedrasRes = useApiResource<KafedraStat[]>(kafedrasUrl);

  const rankQuery = rankSearch.trim().toLocaleLowerCase('uz');
  const rankedGroups = useMemo(() => {
    const rows = (groupsRes.data ?? []).filter(
      (g) =>
        (!rankQuery || g.name.toLocaleLowerCase('uz').includes(rankQuery)) &&
        (!rankFaculty || (g.faculty ?? '') === rankFaculty) &&
        (!rankCourse || String(g.course ?? '') === rankCourse),
    );
    return rankByRate(rows);
  }, [groupsRes.data, rankQuery, rankFaculty, rankCourse]);
  const rankedKafedras = useMemo(
    () => rankByRate((kafedrasRes.data ?? []).filter((k) => !rankQuery || k.name.toLocaleLowerCase('uz').includes(rankQuery))),
    [kafedrasRes.data, rankQuery],
  );
  const facultyOptions = useMemo(
    () =>
      Array.from(new Set((groupsRes.data ?? []).map((g) => g.faculty ?? '')))
        .filter(Boolean)
        .sort()
        .map((name) => ({ value: name, label: name })),
    [groupsRes.data],
  );
  const courseOptions = useMemo(
    () =>
      Array.from(new Set((groupsRes.data ?? []).map((g) => g.course).filter((c): c is number => c !== null)))
        .sort((a, b) => a - b)
        .map((c) => ({ value: String(c), label: `${c}-kurs` })),
    [groupsRes.data],
  );

  // ───────────── Eksport
  async function run(key: string, task: () => Promise<void>, fallback: string) {
    setBusy(key);
    try {
      await task();
    } catch (err) {
      toast.error(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  /** Excel: sahifadagi filtr bo'yicha. Qisqa — faqat raqamlar, to'liq —
   *  har raqam ortidagi odamlar ism-familiyasi bilan. */
  function exportCriteria(variant: 'qisqa' | 'toliq') {
    return run(
      `xlsx-${variant}`,
      async () => {
        const openCriterion = level !== 'cards' ? criterion : null;
        const query = buildQuery({
          population,
          period: periodKey,
          variant,
          criterion: openCriterion?.key,
          bucket: openCriterion ? activeBucket || undefined : undefined,
          search: openCriterion && search.trim() ? search.trim() : undefined,
        });
        const span = criteria
          ? criteria.period.start === criteria.period.end
            ? criteria.period.start
            : `${criteria.period.start}_${criteria.period.end}`
          : periodKey;
        const blob = await api.blob(`/api/reports/criteria.xlsx${query}`, token);
        downloadBlob(blob, `hisobot-${population}-${span}-${variant}.xlsx`);
      },
      "Faylni yuklab bo'lmadi",
    );
  }

  function pdfRange(): { from: string; to: string } {
    if (tab === 'tahlil') return { from: range.from, to: range.to };
    if (criteria) return { from: criteria.period.start, to: criteria.period.end };
    return { from: viewDate.date, to: viewDate.date };
  }

  function exportPdf() {
    return run(
      'pdf',
      async () => {
        const { from, to } = pdfRange();
        const data =
          tab === 'tahlil' && analytics ? analytics : await api.get<ReportAnalytics>(`/api/reports/analytics${buildQuery({ from, to })}`, token);
        const { exportAnalyticsPdf } = await import('../../lib/reportPdf');
        await exportAnalyticsPdf(data, { preparedBy: userName, root: tab === 'tahlil' ? analyticsRef.current : null });
        toast.success('PDF hisobot tayyor');
      },
      "PDF tayyorlab bo'lmadi",
    );
  }

  function exportAnalyticsXlsx() {
    return run(
      'xlsx-tahlil',
      async () => {
        const blob = await api.blob(`/api/reports/analytics.xlsx${buildQuery({ from: range.from, to: range.to })}`, token);
        downloadBlob(blob, `tahlil-${range.from}_${range.to}.xlsx`);
      },
      "Faylni yuklab bo'lmadi",
    );
  }

  function exportRanking() {
    if (tab === 'guruhlar') {
      exportRowsAsCsv(
        ['#', 'Guruh', 'Fakultet', 'Kurs', 'Talabalar', 'Keldi', 'Kech keldi', 'Kelmadi', 'Davomat %'],
        rankedGroups.map((g) => [g.rank, g.name, g.faculty ?? '', g.course ?? '', g.total, g.present, g.late, g.absent, g.rate ?? '']),
        `guruhlar-reytingi-${viewDate.date}.csv`,
      );
    } else {
      exportRowsAsCsv(
        ['#', 'Kafedra', 'Bino', 'Xodimlar', 'Keldi', 'Kech keldi', 'Kelmadi', 'Darslar', 'Kechikkan darslar', "O'tilmagan darslar", 'Davomat %'],
        rankedKafedras.map((k) => [
          k.rank,
          k.name,
          k.building ?? '',
          k.staffTotal,
          k.present,
          k.late,
          k.absent,
          k.lessonsToday,
          k.teacherLateLessons,
          k.teacherMissedLessons,
          k.rate ?? '',
        ]),
        `kafedralar-reytingi-${viewDate.date}.csv`,
      );
    }
  }

  // ───────────── Sarlavha harakatlari (tabga qarab)
  let actions;
  if (tab === 'mezonlar') {
    actions = (
      <>
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" loading={criteriaLoading} onClick={reloadCriteria} />
        <Menu
          align="end"
          trigger={(props) => (
            <Button {...props} icon={Download} iconRight={ChevronDown} loading={busy?.startsWith('xlsx') ?? false}>
              Excel
            </Button>
          )}
          items={[
            { label: 'Qisqa — faqat raqamlar', onSelect: () => void exportCriteria('qisqa') },
            { label: "To'liq — ism-familiyalar bilan", onSelect: () => void exportCriteria('toliq') },
          ]}
        />
        <Button variant="primary" icon={FileText} loading={busy === 'pdf'} onClick={() => void exportPdf()}>
          PDF
        </Button>
      </>
    );
  } else if (tab === 'tahlil') {
    actions = (
      <>
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" loading={analyticsLoading} onClick={reloadAnalytics} />
        <Button icon={Download} loading={busy === 'xlsx-tahlil'} onClick={() => void exportAnalyticsXlsx()}>
          Excel
        </Button>
        <Button variant="primary" icon={FileText} loading={busy === 'pdf'} disabled={!analytics} onClick={() => void exportPdf()}>
          PDF hisobot
        </Button>
      </>
    );
  } else {
    const res = tab === 'guruhlar' ? groupsRes : kafedrasRes;
    const count = tab === 'guruhlar' ? rankedGroups.length : rankedKafedras.length;
    actions = (
      <>
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" loading={res.loading} onClick={res.reload} />
        <Button icon={Download} disabled={count === 0} onClick={exportRanking}>
          CSV
        </Button>
      </>
    );
  }

  // ───────────── Filtrlar
  let toolbar;
  if (tab === 'mezonlar') {
    toolbar = (
      <Toolbar
        end={
          criteria && (
            <span className="text-[13px] text-muted">
              {formatUzRange(criteria.period.start, criteria.period.end)} · {criteria.populationLabel}: {formatNumber(criteria.peopleTotal)} ta, yuzi
              tasdiqlangan {formatNumber(criteria.enrolledTotal)} ta
            </span>
          )
        }
      >
        <Tabs
          variant="segmented"
          ariaLabel="Kim bo'yicha hisobot"
          tabs={POPULATIONS}
          value={population}
          onChange={(value) => setQuery({ bolim: value, kriteriya: null, guruh: null, odam: null })}
        />
        <Tabs variant="segmented" ariaLabel="Davr" tabs={PERIODS} value={periodKey} onChange={(value) => setQuery({ davr: value, odam: null })} />
      </Toolbar>
    );
  } else if (tab === 'tahlil') {
    toolbar = (
      <Toolbar>
        <DateRangePicker value={range} onChange={setRange} presets={['today', 'week', 'last7', 'month', 'lastMonth']} />
      </Toolbar>
    );
  } else {
    const filters = (rankQuery ? 1 : 0) + (tab === 'guruhlar' ? (rankFaculty ? 1 : 0) + (rankCourse ? 1 : 0) : 0);
    toolbar = (
      <Toolbar
        activeCount={filters}
        onReset={() => {
          setRankSearch('');
          setRankFaculty('');
          setRankCourse('');
        }}
      >
        <DatePicker value={viewDate.date} onChange={viewDate.setDate} ariaLabel="Sana" />
        <SearchInput value={rankSearch} onChange={setRankSearch} placeholder={tab === 'guruhlar' ? 'Guruh nomi…' : 'Kafedra nomi…'} />
        {tab === 'guruhlar' && (
          <>
            <Select value={rankFaculty} onChange={setRankFaculty} placeholder="Barcha fakultetlar" ariaLabel="Fakultet" options={facultyOptions} highlightActive />
            <Select value={rankCourse} onChange={setRankCourse} placeholder="Barcha kurslar" ariaLabel="Kurs" options={courseOptions} highlightActive />
          </>
        )}
      </Toolbar>
    );
  }

  // ───────────── Mezonlar: sahifa ichidagi non-yo'l
  const crumbs =
    level !== 'cards' && criterion ? (
      <nav aria-label="Hisobot darajalari" className="flex flex-wrap items-center gap-1 text-[13px]">
        <button
          type="button"
          onClick={() => setQuery({ kriteriya: null, guruh: null, odam: null })}
          className={cn('rounded font-medium text-primary hover:underline', focusRing)}
        >
          Mezonlar
        </button>
        <ChevronRight size={14} className="text-subtle" aria-hidden="true" />
        <span className="font-semibold text-fg">{criterion.title}</span>
        <ChevronRight size={14} className="text-subtle" aria-hidden="true" />
        <span className="text-muted" aria-current="page">
          {criterion.buckets.find((b) => b.key === activeBucket)?.label ?? ''} ·{' '}
          {level === 'people' ? `${formatNumber(people.total)} ta odam` : `${formatNumber(events.total)} ta signal`}
        </span>
      </nav>
    ) : null;

  const groupsTotal = groupsRes.data ?? [];
  const withRate = groupsTotal.filter((g) => g.rate !== null);
  const avgGroupRate = withRate.length ? withRate.reduce((s, g) => s + (g.rate ?? 0), 0) / withRate.length : null;
  const worstGroup = rankByRate(withRate).at(-1);

  return (
    <Page
      title="Hisobotlar"
      subtitle="Mezon bo'yicha raqam, raqam ortidagi ro'yxat va kamera isboti; davr tahlili va reytinglar"
      tabs={TABS}
      actions={actions}
      toolbar={toolbar}
    >
      {tab === 'mezonlar' && (
        <>
          {criteriaError && <ErrorState message={criteriaError} onRetry={reloadCriteria} />}
          {crumbs}
          {level === 'cards' && !criteriaError && (
            <CriteriaCards
              criteria={criteria?.criteria ?? []}
              loading={criteriaLoading}
              onOpen={(item, bucketKey) => setQuery({ kriteriya: item.key, guruh: bucketKey, odam: null })}
            />
          )}
          {level === 'people' && criterion && (
            <CriterionPeople
              criterion={criterion}
              population={population}
              bucket={activeBucket}
              onBucketChange={(value) => setQuery({ guruh: value })}
              people={people.items}
              total={people.total}
              page={people.page}
              pageSize={PEOPLE_PAGE_SIZE}
              totalPages={people.totalPages}
              loading={people.loading}
              error={people.error}
              onRetry={people.reload}
              onPageChange={people.setPage}
              search={search}
              onSearchChange={setSearch}
              onOpenPerson={(row) => setQuery({ odam: row.id })}
              selectedId={personId}
            />
          )}
          {level === 'events' && criterion && (
            <CriterionEvents
              criterion={criterion}
              bucket={activeBucket}
              onBucketChange={(value) => setQuery({ guruh: value })}
              events={events.items}
              total={events.total}
              page={events.page}
              pageSize={EVENTS_PAGE_SIZE}
              totalPages={events.totalPages}
              loading={events.loading}
              error={events.error}
              onRetry={events.reload}
              onPageChange={events.setPage}
              onOpenEvent={setOpenEvent}
              selectedId={openEvent?.id}
            />
          )}
        </>
      )}

      {tab === 'tahlil' && <AnalyticsView ref={analyticsRef} data={analytics} loading={analyticsLoading} error={analyticsError} onRetry={reloadAnalytics} />}

      {tab === 'guruhlar' && (
        <>
          {groupsRes.data && groupsTotal.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile icon={Users2} tone="primary" label="Guruhlar" value={formatNumber(groupsTotal.length)} hint={`${formatUzDate(viewDate.date)} holati`} />
              <StatTile icon={Trophy} tone="success" label="O'rtacha davomat" value={formatPercent(avgGroupRate, 1)} progress={avgGroupRate} />
              <StatTile
                tone="danger"
                label="Eng past davomat"
                value={worstGroup ? formatPercent(worstGroup.rate, 1) : '—'}
                hint={worstGroup?.name}
                to={worstGroup ? viewDate.withDate(situationPaths.group(worstGroup.name)) : undefined}
              />
            </div>
          )}
          <GroupsRanking
            rows={rankedGroups}
            loading={groupsRes.loading}
            error={groupsRes.error}
            onRetry={groupsRes.reload}
            onOpen={(row) => navigate(viewDate.withDate(situationPaths.group(row.name)))}
            filtered={Boolean(rankQuery || rankFaculty || rankCourse)}
          />
        </>
      )}

      {tab === 'kafedralar' && (
        <KafedrasRanking
          rows={rankedKafedras}
          loading={kafedrasRes.loading}
          error={kafedrasRes.error}
          onRetry={kafedrasRes.reload}
          onOpen={(row) => navigate(viewDate.withDate(situationPaths.kafedra(row.id)))}
          filtered={Boolean(rankQuery)}
        />
      )}

      <PersonReport
        personId={onCriteria ? personId : null}
        person={person}
        loading={personLoading}
        error={personError}
        onRetry={reloadPerson}
        onClose={() => setQuery({ odam: null })}
      />
      <EventDrawer event={openEvent} onClose={() => setOpenEvent(null)} onReview={() => setOpenEvent(null)} />
    </Page>
  );
}
