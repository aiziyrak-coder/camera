import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarX2, Camera, Clock, LayoutGrid, Rows3, Timer, UserCheck, Users } from 'lucide-react';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  ProgressBar,
  ProgressRing,
  SearchInput,
  SkeletonCard,
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  formatPercent,
  formatUzDate,
  relativeDayLabel,
  toneForRate,
  useShell,
  useUrlTab,
  type DataTableColumn,
  type TabItem,
} from '../../ui';
import { AttendanceCamerasPanel } from '../../components/teachers/AttendanceCamerasPanel';
import { KafedraCard } from '../../components/teachers/KafedraCard';
import { TeacherDayDrawer } from '../../components/teachers/TeacherDayDrawer';
import { TeacherSearch } from '../../components/teachers/TeacherSearch';
import { useLoader, type Loader } from '../../components/teachers/useLoader';
import { getKafedras, getLessons, situationPaths, type KafedraStat } from '../../lib/situationApi';
import { getTeachersDay, hhmm, kafedraSegments, summarizeKafedras, summarizePunctuality } from '../../lib/teachersApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
import type { TeacherDaySummary } from '../../types';

type TabId = 'kafedralar' | 'kuzatuv' | 'kameralar';
type View = 'cards' | 'table';

const REFRESH_MS = 60_000;

export default function KafedrasPage() {
  const { date, isToday, today, withDate } = useViewDate();
  const kafedras = useLoader(`k:${date}`, (signal) => getKafedras(date, { signal }), { refreshMs: isToday ? REFRESH_MS : undefined });
  const count = kafedras.data?.filter((k) => !k.unassigned).length;

  const tabs: TabItem<TabId>[] = [
    { id: 'kafedralar', label: 'Kafedralar', icon: Building2, count: count ?? null },
    { id: 'kuzatuv', label: 'Kun kuzatuvi', icon: Clock },
    { id: 'kameralar', label: 'Kameralar diagnostikasi', icon: Camera },
  ];
  const [tab] = useUrlTab(tabs, { defaultTab: 'kafedralar' });
  const dayLabel = relativeDayLabel(date, today) ?? formatUzDate(date, { weekday: true });

  return (
    <Page
      title="O'qituvchilar"
      subtitle={`Kafedralar kesimida xodimlar davomati va darsga punktuallik · ${dayLabel}`}
      breadcrumbs={[{ label: "O'qituvchilar" }]}
      tabs={tabs}
      defaultTab="kafedralar"
    >
      {tab === 'kafedralar' && <KafedrasTab loader={kafedras} date={date} isToday={isToday} withDate={withDate} />}
      {tab === 'kuzatuv' && <DayTrackingTab date={date} />}
      {tab === 'kameralar' && <AttendanceCamerasPanel />}
    </Page>
  );
}

function KafedrasTab({
  loader,
  date,
  isToday,
  withDate,
}: {
  loader: Loader<KafedraStat[]>;
  date: string;
  isToday: boolean;
  withDate: (path: string) => string;
}) {
  const { presentation } = useShell();
  const navigate = useNavigate();
  const [view, setView] = usePersistedState<View>('oqituvchilar.view', 'cards');
  const lessons = useLoader(`l:${date}`, (signal) => getLessons({ date, pageSize: 500 }, { signal }), { refreshMs: isToday ? REFRESH_MS : undefined });

  const rows = useMemo(() => loader.data ?? [], [loader.data]);
  const summary = useMemo(() => summarizeKafedras(rows), [rows]);
  const punctuality = useMemo(() => (lessons.data ? summarizePunctuality(lessons.data.items) : null), [lessons.data]);
  const staffRate = summary.staffTotal ? (summary.present / summary.staffTotal) * 100 : null;
  const effectiveView: View = presentation ? 'cards' : view;

  const columns: DataTableColumn<KafedraStat>[] = [
    {
      key: 'name',
      header: 'Kafedra',
      sortValue: (k) => `${k.unassigned ? 1 : 0}${k.name}`,
      cell: (k) => (
        <div className="min-w-0">
          <p className={k.unassigned ? 'font-medium text-muted' : 'font-medium text-fg'}>{k.name}</p>
          <p className="truncate text-xs text-muted">{k.building ?? '—'}</p>
        </div>
      ),
    },
    { key: 'staffTotal', header: 'Xodimlar', align: 'right', sortValue: (k) => k.staffTotal, sortFirst: 'desc' },
    {
      key: 'rate',
      header: 'Davomat',
      width: '14rem',
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
    { key: 'lessonsToday', header: 'Darslar', align: 'right', sortValue: (k) => k.lessonsToday, sortFirst: 'desc' },
    {
      key: 'late',
      header: 'Kechikkan darslar',
      align: 'right',
      sortValue: (k) => k.teacherLateLessons,
      sortFirst: 'desc',
      cell: (k) => (k.teacherLateLessons ? <Badge tone="warning">{k.teacherLateLessons}</Badge> : <span className="text-subtle">0</span>),
    },
    {
      key: 'missed',
      header: 'Kelmagan darslar',
      align: 'right',
      sortValue: (k) => k.teacherMissedLessons,
      sortFirst: 'desc',
      cell: (k) => (k.teacherMissedLessons ? <Badge tone="danger">{k.teacherMissedLessons}</Badge> : <span className="text-subtle">0</span>),
    },
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
        <TeacherSearch />
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Xodimlar keldi"
          icon={UserCheck}
          tone={toneForRate(staffRate)}
          loading={loader.loading}
          value={summary.present}
          unit={`/ ${summary.staffTotal}`}
          progress={staffRate}
          hint={staffRate === null ? undefined : `${formatPercent(staffRate)} kafedralar xodimlari`}
        />
        <StatTile label="Kech qolganlar" icon={Timer} tone={summary.late ? 'warning' : 'neutral'} loading={loader.loading} value={summary.late} hint={`${summary.absent} kishi kelmadi`} />
        <StatTile
          label="Darsga o'z vaqtida"
          icon={Clock}
          tone={toneForRate(punctuality?.rate)}
          loading={lessons.loading}
          value={formatPercent(punctuality?.rate)}
          progress={punctuality?.rate}
          hint={punctuality ? `${punctuality.onTime} / ${punctuality.onTime + punctuality.late + punctuality.missed} tekshirilgan dars` : undefined}
        />
        <StatTile
          label="Kechikkan darslar"
          icon={CalendarX2}
          tone={summary.lateLessons + summary.missedLessons ? 'danger' : 'neutral'}
          loading={loader.loading}
          value={summary.lateLessons + summary.missedLessons}
          hint={`${summary.lateLessons} kechikkan · ${summary.missedLessons} kelmagan · ${summary.lessons} dars`}
        />
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
          title="Kafedralar yo'q"
          description="Tashkiliy tuzilma sahifasida kafedralarni qo'shing — xodimlar lavozimi (bo'limi) kafedra nomi bilan bog'lanadi."
        />
      ) : effectiveView === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((k) => (
            <KafedraCard key={k.id} kafedra={k} to={withDate(situationPaths.kafedra(k.id))} />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(k) => k.id}
          onRowClick={(k) => navigate(withDate(situationPaths.kafedra(k.id)))}
          ariaLabel="Kafedralar"
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────── Kun kuzatuvi

function DayTrackingTab({ date }: { date: string }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const [selected, setSelected] = useState<TeacherDaySummary | null>(null);
  const load = useCallback((signal: AbortSignal) => getTeachersDay({ date, search: debounced }, { signal }), [date, debounced]);
  const teachers = useLoader(`t:${date}:${debounced}`, load);

  const columns: DataTableColumn<TeacherDaySummary>[] = [
    {
      key: 'fullName',
      header: 'F.I.Sh.',
      sortValue: (r) => r.fullName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{r.fullName}</p>
          <p className="truncate text-xs text-muted">{r.unit}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Davomat',
      sortValue: (r) => r.attendanceStatus ?? '',
      cell: (r) => <StatusBadge status={r.attendanceStatus ?? 'nomalum'} />,
    },
    { key: 'firstSeen', header: "Birinchi ko'rilgan", align: 'right', sortValue: (r) => r.firstSeen ?? '99', cell: (r) => hhmm(r.firstSeen) },
    { key: 'lastSeen', header: "Oxirgi ko'rilgan", align: 'right', hideOnMobile: true, sortValue: (r) => r.lastSeen ?? '', cell: (r) => hhmm(r.lastSeen) },
    {
      key: 'buildings',
      header: 'Binolar',
      hideOnMobile: true,
      cell: (r) => <span className="text-[13px] text-muted">{r.buildings.join(', ') || '—'}</span>,
    },
    { key: 'visits', header: 'Tashriflar', align: 'right', sortValue: (r) => r.visits, sortFirst: 'desc' },
    {
      key: 'lessons',
      header: 'Darslariga kirgan',
      align: 'right',
      sortValue: (r) => (r.lessonsScheduled ? r.lessonsAttended / r.lessonsScheduled : null),
      cell: (r) =>
        r.lessonsScheduled === 0 ? (
          <span className="text-[13px] text-subtle">jadvalda yo'q</span>
        ) : (
          <Badge tone={r.lessonsAttended < r.lessonsScheduled ? 'danger' : 'success'}>
            {r.lessonsAttended} / {r.lessonsScheduled}
          </Badge>
        ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="O'qituvchi ismi…" ariaLabel="O'qituvchini qidirish" />
        <p className="text-[13px] text-muted">Kameralar tanigan yoki shu kuni darsi bor xodimlar — kim soat nechida qaysi binoda bo'lgan.</p>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={teachers.data ?? []}
        rowKey={(r) => r.id}
        loading={teachers.loading}
        error={teachers.data ? null : teachers.error}
        onRetry={teachers.reload}
        onRowClick={setSelected}
        selectedKey={selected?.id ?? null}
        rowTone={(r) => (r.lessonsScheduled > r.lessonsAttended ? 'danger' : null)}
        emptyTitle="Xodim topilmadi"
        emptyDescription="Bu kunda kameralar tanigan yoki darsi bor xodim yo'q. Xodim kuzatuvda ko'rinishi uchun yuzi tasdiqlangan bo'lishi kerak."
        ariaLabel="O'qituvchilar kuni"
        defaultSort={{ key: 'firstSeen', dir: 'asc' }}
      />
      <TeacherDayDrawer
        person={selected ? { id: selected.id, fullName: selected.fullName, subtitle: [selected.unit, selected.faculty].filter(Boolean).join(' · ') } : null}
        date={date}
        onClose={() => setSelected(null)}
      />
      {teachers.data && (
        <p className="text-xs text-muted">
          <Users size={12} className="mr-1 inline" aria-hidden="true" />
          {teachers.data.length} ta xodim
        </p>
      )}
    </>
  );
}
