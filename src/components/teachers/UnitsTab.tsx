import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarX2, Clock, LayoutGrid, Rows3, Timer, UserCheck } from 'lucide-react';
import {
  Badge,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  ProgressBar,
  ProgressRing,
  SkeletonCard,
  StatTile,
  Tabs,
  Toolbar,
  formatPercent,
  formatUzRange,
  rangeForPreset,
  toneForRate,
  useShell,
  type DataTableColumn,
} from '../../ui';
import { getAnalyticsUnits, getLessons, situationPaths, type KafedraStat, type UnitKind } from '../../lib/situationApi';
import { kafedraSegments, summarizeKafedras, summarizePunctuality, unitKindLabel } from '../../lib/teachersApi';
import { usePersistedState } from '../../lib/usePersistedState';
import { DeltaBadge } from '../analytics';
import { KafedraCard } from './KafedraCard';
import { TeacherSearch } from './TeacherSearch';
import { useLoader, type Loader } from './useLoader';

type View = 'cards' | 'table';
type KindFilter = 'kafedra' | 'dekanat' | 'bolim' | 'all';

const REFRESH_MS = 60_000;

/** "Bo'linmalar" tabi: tur bo'yicha filtr, kartalar/jadval, 7 kunlik trend. */
export function UnitsTab({ loader, date, isToday, withDate }: { loader: Loader<KafedraStat[]>; date: string; isToday: boolean; withDate: (path: string) => string }) {
  const { presentation } = useShell();
  const navigate = useNavigate();
  const [view, setView] = usePersistedState<View>('oqituvchilar.view', 'cards');
  const [kind, setKind] = usePersistedState<KindFilter>('oqituvchilar.kind', 'all');
  // Bo'linmalar ro'yxatidagi `lessonsToday` — darslar bor-yo'qligining
  // tekin manbasi. Jadval kiritilmagan kunda 500 ta darsni so'ramaymiz;
  // jadval paydo bo'lishi bilan so'rov o'zi qayta tiklanadi.
  const scheduledLessons = useMemo(() => (loader.data ?? []).reduce((sum, u) => sum + u.lessonsToday, 0), [loader.data]);
  const lessons = useLoader(
    scheduledLessons > 0 ? `l:${date}` : null,
    (signal) => getLessons({ date, pageSize: 500 }, { signal }),
    { refreshMs: isToday ? REFRESH_MS : undefined },
  );
  // Trend: tanlangan kungacha 7 kun vs undan oldingi 7 kun.
  const week = useMemo(() => rangeForPreset('last7', date), [date]);
  const trends = useLoader(`tr:${week.from}:${week.to}`, (signal) => getAnalyticsUnits({ from: week.from, to: week.to, kind: 'all' }, { signal }));
  const trendById = useMemo(() => new Map((trends.data ?? []).map((u) => [u.id, u.trend])), [trends.data]);
  // O'tgan kunni ko'rayotganda "oxirgi 7 kun" yolg'on bo'lardi — haqiqiy oraliq yoziladi.
  const trendHint = `${formatUzRange(week.from, week.to)} davomati undan oldingi 7 kunga nisbatan`;

  const all = useMemo(() => loader.data ?? [], [loader.data]);
  const counts = useMemo(() => {
    const c: Record<UnitKind, number> = { kafedra: 0, dekanat: 0, bolim: 0, lavozim: 0 };
    for (const u of all) c[u.kind] = (c[u.kind] ?? 0) + 1;
    return c;
  }, [all]);
  const rows = useMemo(() => (kind === 'all' ? all : all.filter((u) => u.kind === kind)), [all, kind]);
  const summary = useMemo(() => summarizeKafedras(rows), [rows]);
  const punctuality = useMemo(() => (lessons.data ? summarizePunctuality(lessons.data.items) : null), [lessons.data]);
  // Dars plitkalari ko'rsatilayotgan bo'linmalarga bog'liq: filtr ostidagi
  // bo'linmalarda dars bo'lmasa plitkalar chizilmaydi.
  const hasLessons = summary.lessons > 0;
  // Foiz AYNAN kartadagi halqa bilan bir xil formulada: present /
  // (present + absent + notYet). Jami xodimga bo'lish yuzi ro'yxatdan
  // o'tmagan ~80 xodimni "kelmagan" qilib ko'rsatardi.
  const staffRate = summary.rate;
  const effectiveView: View = presentation ? 'cards' : view;

  const columns: DataTableColumn<KafedraStat>[] = [
    {
      key: 'name',
      header: "Bo'linma",
      sortValue: (k) => `${k.unassigned ? 1 : 0}${k.name}`,
      cell: (k) => (
        <div className="min-w-0">
          {/* Bo'linma nomlari uzun ("Patologik fiziologiya va patologik
              anatomiya") — kesiladi, to'lig'i tooltipda. */}
          <p className={cn('truncate font-medium', k.unassigned ? 'text-muted' : 'text-fg')} title={k.name}>
            {k.name}
          </p>
          <p className="truncate text-xs text-muted">{unitKindLabel(k)}</p>
        </div>
      ),
    },
    { key: 'staffTotal', header: 'Jami xodim', align: 'right', sortValue: (k) => k.staffTotal, sortFirst: 'desc' },
    {
      key: 'rate',
      header: 'Bugun ishga kelgani',
      width: '15rem',
      sortValue: (k) => k.rate,
      cell: (k) => (
        <div className="flex items-center gap-3">
          <ProgressRing value={k.rate} size={36} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs tabular-nums text-muted">
              <span className="font-semibold text-fg">{k.present}</span> keldi · {k.late} kech · {k.absent} yo'q
            </p>
            <ProgressBar size="xs" segments={kafedraSegments(k)} />
          </div>
        </div>
      ),
    },
    {
      key: 'trend',
      header: "O'zgarish",
      align: 'right',
      sortValue: (k) => trendById.get(k.id) ?? null,
      cell: (k) => (
        <DeltaBadge value={trendById.get(k.id)} unit="pp" emptyLabel="—" title={trendHint} />
      ),
    },
    { key: 'lessonsToday', header: 'Bugungi darslar', align: 'right', hideOnMobile: true, sortValue: (k) => k.lessonsToday, sortFirst: 'desc' },
    {
      key: 'lessonIssues',
      header: "O'qituvchi kech kirgan / kirmagan",
      align: 'right',
      hideOnMobile: true,
      sortValue: (k) => k.teacherLateLessons + k.teacherMissedLessons,
      sortFirst: 'desc',
      cell: (k) =>
        k.teacherLateLessons + k.teacherMissedLessons === 0 ? (
          <span className="text-subtle">0</span>
        ) : (
          <span className="inline-flex gap-1">
            {k.teacherLateLessons > 0 && <Badge tone="warning">{k.teacherLateLessons} kech</Badge>}
            {k.teacherMissedLessons > 0 && <Badge tone="danger">{k.teacherMissedLessons} yo'q</Badge>}
          </span>
        ),
    },
  ];

  const kindTabs = [
    { id: 'all' as const, label: 'Hammasi', count: all.length || null },
    { id: 'kafedra' as const, label: 'Kafedralar', count: counts.kafedra || null },
    { id: 'dekanat' as const, label: 'Dekanatlar', count: counts.dekanat || null },
    { id: 'bolim' as const, label: "Bo'limlar", count: counts.bolim || null },
  ];

  return (
    <>
      <Toolbar
        end={
          !presentation && (
            <Tabs
              variant="segmented"
              size="sm"
              value={view}
              onChange={setView}
              ariaLabel="Ko'rinish"
              tabs={[
                { id: 'cards', label: 'Kartalar', icon: LayoutGrid },
                { id: 'table', label: 'Jadval', icon: Rows3 },
              ]}
            />
          )
        }
      >
        <Tabs variant="segmented" size="sm" value={kind} onChange={setKind} ariaLabel="Bo'linma turi" tabs={kindTabs} />
        <TeacherSearch />
      </Toolbar>

      <div className={cn('grid grid-cols-2 gap-3', hasLessons ? 'lg:grid-cols-4' : 'lg:grid-cols-2')}>
        <StatTile
          label="Xodimlar keldi"
          icon={UserCheck}
          tone={toneForRate(staffRate)}
          loading={loader.loading}
          value={summary.present}
          unit={`/ ${summary.staffTotal}`}
          progress={staffRate}
          hint={
            staffRate === null
              ? undefined
              : `Holati aniq ${summary.decided} xodimdan ${formatPercent(staffRate)} keldi${
                  summary.noData ? ` · yana ${summary.noData} xodimning yuzi ro'yxatdan o'tmagan — foizga kirmaydi` : ''
                }`
          }
        />
        <StatTile
          label="Kech kelgan xodimlar"
          icon={Timer}
          tone={summary.late ? 'warning' : 'neutral'}
          loading={loader.loading}
          value={summary.late}
          hint={`Bundan tashqari ${summary.absent} kishi umuman kelmagan`}
        />
        {hasLessons && (
          <>
            <StatTile
              label="Darsga o'z vaqtida kirgan"
              icon={Clock}
              tone={toneForRate(punctuality?.rate)}
              loading={lessons.loading}
              value={formatPercent(punctuality?.rate)}
              progress={punctuality?.rate}
              hint={
                punctuality
                  ? `Tekshirilgan ${punctuality.onTime + punctuality.late + punctuality.missed} darsdan ${punctuality.onTime} tasiga o'qituvchi o'z vaqtida kirgan${
                      kind === 'all' ? '' : ' · barcha bo‘linmalar bo‘yicha'
                    }`
                  : undefined
              }
            />
            <StatTile
              label="O'qituvchi kech kirgan yoki kirmagan darslar"
              icon={CalendarX2}
              tone={summary.lateLessons + summary.missedLessons ? 'danger' : 'neutral'}
              loading={loader.loading}
              value={summary.lateLessons + summary.missedLessons}
              hint={`Bugungi ${summary.lessons} darsdan: ${summary.lateLessons} tasiga kech kirgan · ${summary.missedLessons} tasiga umuman kirmagan`}
            />
          </>
        )}
      </div>

      {loader.error && !loader.data ? (
        <ErrorState variant="block" message={loader.error} onRetry={loader.reload} />
      ) : loader.loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={kind === 'all' ? "Bo'linmalar yo'q" : `${kindTabs.find((t) => t.id === kind)?.label} topilmadi`}
          description="Bo'linmalar ro'yxati alohida kiritilmaydi — u xodimlar reestridagi lavozim va bo'lim yozuvlaridan avtomatik yig'iladi."
        />
      ) : effectiveView === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((k) => (
            <KafedraCard key={k.id} kafedra={k} to={withDate(situationPaths.kafedra(k.id))} trend={trendById.get(k.id)} trendHint={trendHint} />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(k) => k.id} onRowClick={(k) => navigate(withDate(situationPaths.kafedra(k.id)))} ariaLabel="Bo'linmalar" />
      )}
    </>
  );
}
