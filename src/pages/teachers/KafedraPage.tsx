import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart3, BookOpen, CalendarCheck, Clock, LayoutGrid, Rows3, Timer, UserCheck, UserRound, Users } from 'lucide-react';
import {
  Avatar,
  Badge,
  cn,
  ButtonLink,
  DataTable,
  DateRangePicker,
  EmptyState,
  ErrorState,
  KeyValue,
  Page,
  PageSkeleton,
  PersonCard,
  PersonGrid,
  ProgressRing,
  SearchInput,
  Select,
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  formatPercent,
  formatUzRange,
  rangeForPreset,
  toneForRate,
  useShell,
  useUrlTab,
  type DataTableColumn,
  type DateRangeValue,
  type TabItem,
} from '../../ui';
import { LessonDrawer } from '../../components/lessons/LessonDrawer';
import { LessonsTable } from '../../components/lessons/LessonsTable';
import { TeacherCardMeta, TodayLessons } from '../../components/teachers/TeacherBits';
import { TeacherDayDrawer } from '../../components/teachers/TeacherDayDrawer';
import { useLoader } from '../../components/teachers/useLoader';
import { UnitAnalyticsSection } from '../../components/teachers/UnitAnalyticsSection';
import { getKafedra, getLessons, situationPaths, UNIT_KIND_LABELS, type KafedraDetail, type KafedraTeacher, type Lesson } from '../../lib/situationApi';
import { LESSON_TEACHER_SORTS, matchesName, resolveTeacherSort, sortTeachers, type TeacherSort } from '../../lib/teachersApi';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
import type { FixedPreset } from '../../lib/reportPeriods';

type TabId = 'oqituvchilar' | 'tahlil' | 'darslar';
type View = 'grid' | 'table';

const PERIOD_PRESETS: readonly FixedPreset[] = ['last7', 'last30', 'month'];
const SORT_OPTIONS: { value: TeacherSort; label: string }[] = [
  { value: 'lateness', label: 'Avval ko‘p kechikkanlar' },
  { value: 'onTime', label: "Avval darsga kam kirganlar" },
  { value: 'name', label: 'Ism bo‘yicha' },
];
const REFRESH_MS = 60_000;

export default function KafedraPage() {
  const { departmentId = '' } = useParams();
  const { date, isToday } = useViewDate();
  const { presentation } = useShell();

  // Punktuallik davri: standart — ko'rilayotgan sanagacha 30 kun.
  const [period, setPeriod] = useState<DateRangeValue>(() => rangeForPreset('last30', date));
  const [view, setView] = usePersistedState<View>('kafedra.view', 'grid');
  const [sort, setSort] = usePersistedState<TeacherSort>('kafedra.sort', 'lateness');
  const [search, setSearch] = useState('');
  useEffect(() => {
    setPeriod((p) => (p.preset === 'custom' ? p : rangeForPreset(p.preset as FixedPreset, date)));
  }, [date]);

  const periodValid = period.from <= period.to;
  const detailKey = periodValid ? `${departmentId}:${date}:${period.from}:${period.to}` : null;
  const detail = useLoader(
    detailKey,
    (signal) => getKafedra(departmentId, { date, from: period.from, to: period.to }, { signal }),
    { refreshMs: isToday ? REFRESH_MS : undefined, group: `${departmentId}:${date}` },
  );
  const data = detail.data;
  // Dars jadvali kiritilmagan bo'lsa "Darslar" tabi ham, so'rovi ham yo'q.
  // `lessonsScheduled` o'qituvchilar ro'yxati bilan kelgan — qo'shimcha
  // so'rovsiz. Jadval paydo bo'lishi bilan tab o'zi qaytadi.
  const scheduledLessons = useMemo(
    () => (data?.teachers ?? []).reduce((sum, t) => sum + t.lessonsScheduled, 0),
    [data?.teachers],
  );
  const lessons = useLoader(
    scheduledLessons > 0 ? `${departmentId}:${date}` : null,
    (signal) => getLessons({ date, departmentId, pageSize: 500 }, { signal }),
    { refreshMs: isToday ? REFRESH_MS : undefined },
  );

  // Dars jadvali yo'q bo'lsa dars asosidagi tartiblar ro'yxatdan chiqadi
  // (saqlangan tanlov ham "kechikish"ga qaytadi — Select bo'sh qolmasin).
  const periodLessons = data?.period.lessons ?? 0;
  const hasPeriodLessonsForSort = periodLessons > 0;
  const sortOptions = hasPeriodLessonsForSort ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => !LESSON_TEACHER_SORTS.includes(o.value));
  const effectiveSort = resolveTeacherSort(sort, hasPeriodLessonsForSort);

  const tabs: TabItem<TabId>[] = [
    { id: 'oqituvchilar', label: "O'qituvchilar", icon: Users, count: data?.teachers.length ?? null },
    { id: 'tahlil', label: 'Tahlil', icon: BarChart3 },
    // Tab ro'yxatda bo'lmasa `?tab=darslar` standart tabga tushadi (resolveTab).
    ...(scheduledLessons > 0
      ? [{ id: 'darslar' as const, label: 'Darslar', icon: BookOpen, count: lessons.data?.total ?? null }]
      : []),
  ];
  const [tab] = useUrlTab(tabs, { defaultTab: 'oqituvchilar' });

  const notFound = detail.error && !data && /topilmadi|404/i.test(detail.error);
  const title = data?.name ?? (notFound ? "Bo'linma topilmadi" : "Bo'linma");
  const crumbs = [{ label: "Xodimlar va o'qituvchilar", to: '/oqituvchilar' }];

  if (detail.loading && !data && !detail.error) {
    return (
      <Page title="Bo'linma" breadcrumbs={[...crumbs, { label: "Bo'linma" }]}>
        <PageSkeleton />
      </Page>
    );
  }

  return (
    <Page
      title={title}
      subtitle={
        data
          ? [
              "Bo'linma xodimlari bugun ishga kelganmi va darsga o'z vaqtida kirganmi",
              data.building,
              `${data.today.total} xodim`,
              data.unassigned ? "Bu ro'yxatda reestrda bo'linmasi ko'rsatilmagan xodimlar turibdi" : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      titleAddon={
        data ? (
          <Badge tone={data.unassigned ? 'warning' : data.kind === 'kafedra' ? 'primary' : data.kind === 'dekanat' ? 'info' : 'neutral'}>
            {data.unassigned ? 'Biriktirilmagan' : (UNIT_KIND_LABELS[data.kind] ?? data.kind)}
          </Badge>
        ) : undefined
      }
      breadcrumbs={[...crumbs, { label: title }]}
      tabs={data ? tabs : undefined}
      defaultTab="oqituvchilar"
      toolbar={
        data && tab === 'oqituvchilar' ? (
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
                    { id: 'grid', label: 'Yuzlar', icon: LayoutGrid },
                    { id: 'table', label: 'Jadval', icon: Rows3 },
                  ]}
                />
              )
            }
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Ism bo'yicha…" ariaLabel="O'qituvchini qidirish" />
            <Select value={effectiveSort} onChange={(v) => setSort(v as TeacherSort)} options={sortOptions} label="Tartib:" ariaLabel="Tartiblash" />
            {!presentation && <DateRangePicker value={period} onChange={setPeriod} presets={PERIOD_PRESETS} size="sm" showSummary={false} />}
          </Toolbar>
        ) : data && tab === 'tahlil' && !presentation ? (
          <Toolbar>
            <DateRangePicker value={period} onChange={setPeriod} presets={PERIOD_PRESETS} size="sm" />
          </Toolbar>
        ) : undefined
      }
    >
      {detail.error && !data ? (
        notFound ? (
          <EmptyState
            icon={Users}
            title="Bo'linma topilmadi"
            description="Bo'linma nomi reestrda o'zgargan yoki havola eskirgan. Ro'yxatga qayting."
            action={
              <ButtonLink to="/oqituvchilar" variant="secondary">
                Bo'linmalar ro'yxati
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState variant="block" message={detail.error} onRetry={detail.reload} />
        )
      ) : data ? (
        <>
          {tab !== 'tahlil' && <KafedraTiles data={data} />}
          {tab === 'oqituvchilar' ? (
            <TeachersSection data={data} date={date} view={presentation ? 'grid' : view} sort={effectiveSort} search={search} />
          ) : tab === 'tahlil' ? (
            <UnitAnalyticsSection unitId={data.id} unitName={data.name} kind={data.kind} from={period.from} to={period.to} />
          ) : (
            <LessonsSection
              rows={lessons.data?.items ?? []}
              loading={lessons.loading}
              error={lessons.data ? null : lessons.error}
              onRetry={lessons.reload}
            />
          )}
        </>
      ) : null}
    </Page>
  );
}

function KafedraTiles({ data }: { data: KafedraDetail }) {
  const t = data.today;
  const p = data.period;
  const checked = p.onTime + p.late + p.missed;
  const hasLessons = p.lessons > 0;
  return (
    <div className={cn('grid grid-cols-2 gap-3', hasLessons ? 'lg:grid-cols-4' : 'lg:grid-cols-2')}>
      <StatTile
        label="Bugun ishga kelgan xodimlar"
        icon={UserCheck}
        tone={toneForRate(t.rate)}
        value={t.present}
        unit={`/ ${t.total}`}
        progress={t.rate}
        hint={`Bo'linmadagi ${t.total} xodimning ${formatPercent(t.rate)} qismi · ${t.absent} kishi kelmadi${t.notYet ? ` · ${t.notYet} kishi hali kelmagan` : ''}`}
      />
      <StatTile
        label="Bugun kech kelgan xodimlar"
        icon={Timer}
        tone={t.late ? 'warning' : 'neutral'}
        value={t.late}
        hint={t.noData ? `Yana ${t.noData} xodimning holati aniqlanmagan — yuzi ro'yxatdan o'tmagan` : 'Ish boshlanish vaqtidan keyin kelganlar'}
      />
      {hasLessons && (
        <>
          <StatTile
            label="Darsga o'z vaqtida kirgan"
            icon={Clock}
            tone={toneForRate(p.onTimeRate)}
            value={formatPercent(p.onTimeRate)}
            progress={p.onTimeRate}
            hint={`${formatUzRange(p.dateFrom, p.dateTo)} oralig'ida tekshirilgan ${checked} darsdan ${p.onTime} tasi`}
          />
          <StatTile
            label="O'qituvchi kech kirgan / kirmagan darslar"
            icon={CalendarCheck}
            tone={p.late + p.missed ? 'danger' : 'neutral'}
            value={`${p.late} / ${p.missed}`}
            hint={`${formatUzRange(p.dateFrom, p.dateTo)} oralig'idagi ${p.lessons} darsdan`}
          />
        </>
      )}
    </div>
  );
}

function TeachersSection({ data, date, view, sort, search }: { data: KafedraDetail; date: string; view: View; sort: TeacherSort; search: string }) {
  // Dars jadvali yo'q bo'lsa dars ustunlari/qatorlari chizilmaydi:
  // har satrda "Darsi yo'q" va har joyda "—" turishining ma'nosi yo'q.
  const hasTodayLessons = data.teachers.some((t) => t.lessonsScheduled > 0);
  const hasPeriodLessons = data.period.lessons > 0;
  const { presentation } = useShell();
  const [selected, setSelected] = useState<KafedraTeacher | null>(null);

  const rows = useMemo(() => {
    const filtered = search.trim() ? data.teachers.filter((t) => matchesName(t.fullName, search)) : data.teachers;
    return sortTeachers(filtered, sort);
  }, [data.teachers, search, sort]);

  const columns: DataTableColumn<KafedraTeacher>[] = [
    {
      key: 'name',
      header: "O'qituvchi",
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={t.fullName} src={t.photoUrl} size="md" />
          <div className="min-w-0">
            <Link to={situationPaths.person(t.id)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-fg hover:text-primary hover:underline">
              {t.fullName}
            </Link>
            <p className="truncate text-xs text-muted">{t.position}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Bugun',
      cell: (t) => <StatusBadge status={t.status === 'malumot_yoq' ? 'nomalum' : t.status} time={t.checkIn} />,
    },
    ...(hasTodayLessons
      ? [{ key: 'lessons', header: 'Darslar', cell: (t: KafedraTeacher) => <TodayLessons t={t} /> }]
      : []),

    {
      key: 'onTime',
      header: "Darsga o'z vaqtida kirgani",
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <ProgressRing value={t.onTimeRate} size={34} thickness={4} />
          <span className="text-xs tabular-nums text-muted">
            {t.periodLessons} dars
            {t.periodLate > 0 && <span className="text-warning"> · {t.periodLate} kech</span>}
            {t.periodMissed > 0 && <span className="text-danger"> · {t.periodMissed} yo'q</span>}
          </span>
        </div>
      ),
    },
    {
      key: 'days',
      header: 'Ishga kelgan kunlari',
      hideOnMobile: true,
      cell: (t) => (
        <span className="text-xs tabular-nums text-muted">
          <span className="font-medium text-fg">{t.periodPresentDays}</span> kun
          {t.periodLateDays > 0 && <span className="text-warning"> · {t.periodLateDays} kech</span>}
          {t.periodAbsentDays > 0 && <span className="text-danger"> · {t.periodAbsentDays} yo'q</span>}
        </span>
      ),
    },
  ];

  return (
    <>
      {data.teachers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Bu bo'linmada xodim yo'q"
          description="Xodim bu bo'linmaga «Shaxslar reestri» bo'limidagi lavozim va bo'lim yozuvi orqali bog'lanadi."
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} compact title="Hech kim topilmadi" description="Qidiruv so'zini o'zgartiring." />
      ) : view === 'grid' ? (
        <PersonGrid minItemWidth={presentation ? 170 : 180}>
          {rows.map((t) => (
            <PersonCard
              key={t.id}
              name={t.fullName}
              photoUrl={t.photoUrl}
              subtitle={t.position}
              status={t.status === 'malumot_yoq' ? 'nomalum' : t.status}
              time={t.checkIn}
              meta={<TeacherCardMeta t={t} />}
              onClick={() => setSelected(t)}
              selected={selected?.id === t.id}
            />
          ))}
        </PersonGrid>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={setSelected}
          selectedKey={selected?.id ?? null}
          manualSort
          rowTone={(t) => (t.lessonsMissed ? 'danger' : t.lessonsLate || t.status === 'kech_keldi' ? 'warning' : null)}
          ariaLabel="Kafedra o'qituvchilari"
        />
      )}

      <TeacherDayDrawer
        person={selected ? { id: selected.id, fullName: selected.fullName, photoUrl: selected.photoUrl, subtitle: selected.position } : null}
        date={date}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <ButtonLink to={situationPaths.person(selected.id)} variant="secondary" icon={UserRound} className="w-full">
            To'liq profil
          </ButtonLink>
        )}
        {selected && (
          <div className="rounded-card border border-border bg-surface-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-fg">Davr: {formatUzRange(data.period.dateFrom, data.period.dateTo)}</p>
                <p className="text-xs text-muted">{hasPeriodLessons ? "Darsga o'z vaqtida kelish va ishga kelish" : 'Ishga kelish'}</p>
              </div>
              {hasPeriodLessons && <ProgressRing value={selected.onTimeRate} size={52} ariaLabel="O'z vaqtida" />}
            </div>
            <KeyValue
              layout="stacked"
              columns={4}
              items={[
                ...(hasPeriodLessons
                  ? [
                      { label: 'Darslar', value: selected.periodLessons },
                      { label: "O'z vaqtida", value: selected.periodOnTime },
                      { label: 'Kech keldi', value: selected.periodLate },
                      { label: 'Kelmagan', value: selected.periodMissed },
                    ]
                  : []),
                { label: 'Kelgan kunlar', value: selected.periodPresentDays },
                { label: 'Kech kelgan kunlar', value: selected.periodLateDays },
                { label: 'Kelmagan kunlar', value: selected.periodAbsentDays },
              ]}
            />
          </div>
        )}
      </TeacherDayDrawer>
    </>
  );
}

function LessonsSection({ rows, loading, error, onRetry }: { rows: Lesson[]; loading: boolean; error: string | null; onRetry: () => void }) {
  const [selected, setSelected] = useState<Lesson | null>(null);
  return (
    <>
      <LessonsTable
        rows={rows}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onRowClick={setSelected}
        selectedId={selected?.id ?? null}
        showState
        emptyTitle="Bu kunda darslar yo'q"
        emptyDescription={
          <>
            Dars jadvali hali yuklanmagan bo'lishi mumkin —{' '}
            <span className="font-medium text-fg">HEMIS ulangach avtomatik yuklanadi</span>
            . Darslar bo'linmaga o'qituvchi orqali bog'lanadi.
          </>
        }
      />
      <LessonDrawer lesson={selected} onClose={() => setSelected(null)} />
    </>
  );
}
