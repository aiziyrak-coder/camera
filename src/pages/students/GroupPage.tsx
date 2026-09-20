import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CalendarClock, LayoutGrid, QrCode, RefreshCw, ScanFace, SearchX, TrendingUp, Users, ZoomIn } from 'lucide-react';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  PersonCard,
  PersonGrid,
  ProgressRing,
  Select,
  Skeleton,
  StatTile,
  StatusDot,
  Tabs,
  FilterBar,
  Button,
  cn,
  formatPercent,
  formatUzDate,
  useShell,
  useUrlTab,
  type DataTableColumn,
  type FilterFieldEntry,
  type TabItem,
} from '../../ui';
import { getGroup, situationPaths, type GroupDetail, type GroupStudent, type Lesson, type TrendPoint } from '../../lib/situationApi';
import {
  STATUS_META,
  applyArrival,
  averageRate,
  countsByStatus,
  countsFromStudents,
  enrolledPct,
  enrollTone,
  hasAttendanceData,
  filterStudents,
  isAwaiting,
  sortStudents,
  type StudentFilter,
  type StudentSort,
} from '../../lib/studentAttendance';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
import { CountsBar } from '../../components/students/CountsBreakdown';
import { LessonDrawer, LessonList } from '../../components/students/LessonViews';
import { StatusFilterTiles, type FilterTile } from '../../components/students/StatusFilterTiles';
import { StudentDrawer } from '../../components/students/StudentDrawer';
import { RateTrendChart, StatusTrendChart } from '../../components/students/TrendCharts';
import { useAsyncData } from '../../components/students/useAsyncData';
import { GroupEnrollDrawer, type EnrollDrawerTarget } from '../../components/students/GroupEnrollDrawer';

type ModeId = 'davomat' | 'yuz';
type FaceFilter = 'all' | 'bor' | 'yoq';
const MODE_PARAM = 'korinish';
const FACE_PARAM = 'yuz';
const MODES: TabItem<ModeId>[] = [
  { id: 'davomat', label: 'Davomat', icon: CalendarCheck },
  { id: 'yuz', label: 'Yuz topshirish', icon: ScanFace },
];

type TabId = 'talabalar' | 'darslar' | 'dinamika';
type Density = 'normal' | 'large';

const FILTER_PARAM = 'holat';
const FILTERS: StudentFilter[] = ['all', 'keldi', 'kech_keldi', 'kelmadi', 'kutilmoqda', 'malumot_yoq', 'dam_olish'];
const SORT_OPTIONS: { value: StudentSort; label: string }[] = [
  { value: 'name', label: 'Ism bo\'yicha' },
  { value: 'status', label: 'Avval kelmaganlar' },
  { value: 'arrival', label: 'Kelish vaqti' },
];
const LIVE_FLASH_MS = 10_000;
const REFRESH_MS = 60_000;

function parseFilter(raw: string | null): StudentFilter {
  return FILTERS.includes(raw as StudentFilter) ? (raw as StudentFilter) : 'all';
}

function GroupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Yuklanmoqda" className="flex flex-col gap-5">
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-5">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[4.25rem]" />
            ))}
          </div>
        </div>
      </div>
      <PersonGrid>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-border bg-surface">
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-2 p-2.5">
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </PersonGrid>
    </div>
  );
}

/** Guruh sahifasi — "yuzlar setkasi": har talaba surati, bugungi holati va
 *  kelgan vaqti. Kamera talabani tanishi bilan karta jonli yangilanadi. */
export default function GroupPage() {
  const { groupName = '' } = useParams();
  const { date, isToday, withDate } = useViewDate();
  const { presentation } = useShell();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get(FILTER_PARAM));
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistedState<StudentSort>('talabalar.guruh.saralash', 'name');
  const [density, setDensity] = usePersistedState<Density>('talabalar.guruh.olcham', 'normal');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [liveFeed, setLiveFeed] = useState<LiveAttendanceMessage[]>([]);
  const [enrollTarget, setEnrollTarget] = useState<EnrollDrawerTarget | null>(null);

  const group = useAsyncData<GroupDetail>(
    groupName ? `${groupName}|${date}` : null,
    (signal) => getGroup(groupName, date, { signal }),
    { identity: groupName, refreshMs: isToday ? REFRESH_MS : undefined },
  );
  const data = group.data;

  useEffect(() => {
    setSelectedId(null);
    setLesson(null);
    setLiveFeed([]);
  }, [groupName, date]);

  // Jonli: kamera talabani tanidi → karta darhol "Keldi", jami qayta hisoblanadi.
  const mutate = group.mutate;
  const dataRef = useRef(data);
  dataRef.current = data;
  useLiveAttendance(
    useCallback(
      (message: LiveAttendanceMessage) => {
        if (message.date !== date) return;
        if (!dataRef.current?.students.some((s) => s.id === message.personId)) return;
        mutate((current) => {
          const students = applyArrival(current.students, message);
          if (students === current.students) return current;
          return { ...current, students: [...students], group: { ...current.group, totals: countsFromStudents(students) } };
        });
        setFlash((prev) => ({ ...prev, [message.personId]: Date.now() }));
        setLiveFeed((prev) => [message, ...prev.filter((m) => m.personId !== message.personId)].slice(0, 6));
      },
      [date, mutate],
    ),
    isToday,
  );

  // Yorqin halqa bir necha soniyadan keyin o'chadi.
  const flashRef = useRef(flash);
  flashRef.current = flash;
  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const id = window.setTimeout(() => {
      const now = Date.now();
      setFlash(Object.fromEntries(Object.entries(flashRef.current).filter(([, at]) => now - at < LIVE_FLASH_MS)));
    }, LIVE_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  const lessonCount = data?.lessons.length ?? 0;
  const tabs: TabItem<TabId>[] = useMemo(
    () => [
      { id: 'talabalar', label: 'Talabalar', icon: LayoutGrid, count: data?.students.length ?? null },
      // Dars jadvali kiritilmagan bo'lsa tab umuman chiqmaydi (doimo bo'sh
      // ko'rinish o'rniga). Jadval paydo bo'lganda o'zi qaytadi.
      ...(lessonCount > 0
        ? [{ id: 'darslar' as const, label: isToday ? 'Bugungi darslar' : 'Shu kungi darslar', icon: CalendarClock, count: lessonCount }]
        : []),
      { id: 'dinamika', label: 'Dinamika', icon: TrendingUp },
    ],
    [data?.students.length, lessonCount, isToday],
  );
  const [tab, setTab] = useUrlTab(tabs, { defaultTab: 'talabalar' });

  const students = useMemo(() => data?.students ?? [], [data]);
  const ready = data ? hasAttendanceData(data.group.totals) : true;
  const [mode, setMode] = useUrlTab(MODES, { param: MODE_PARAM, defaultTab: ready ? 'davomat' : 'yuz' });
  const rawFace = params.get(FACE_PARAM);
  const faceFilter: FaceFilter = mode === 'yuz' && (rawFace === 'bor' || rawFace === 'yoq') ? rawFace : 'all';
  const visible = useMemo(() => {
    const base = filterStudents(students, mode === 'yuz' ? 'all' : filter, query);
    const byFace = faceFilter === 'all' ? base : base.filter((s) => (s.biometricsStatus === 'tasdiqlangan') === (faceFilter === 'bor'));
    return sortStudents(byFace, sort);
  }, [students, filter, query, sort, mode, faceFilter]);
  const photos = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const selectedIndex = selectedId ? visible.findIndex((s) => s.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : selectedId ? (photos.get(selectedId) ?? null) : null;

  function setFaceFilter(next: FaceFilter) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'all') p.delete(FACE_PARAM);
        else p.set(FACE_PARAM, next);
        return p;
      },
      { replace: true },
    );
    if (tab !== 'talabalar') setTab('talabalar');
  }

  /** Yuz topshirish ko'rinishida yuzi yo'q talaba → QR/ko'rsatma paneli. */
  function openStudent(id: string) {
    const st = photos.get(id);
    if (mode === 'yuz' && st && st.biometricsStatus !== 'tasdiqlangan') {
      setEnrollTarget({ name: groupName, faculty: data?.group.faculty });
      return;
    }
    setSelectedId(id);
  }

  function setFilter(next: StudentFilter) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'all') p.delete(FILTER_PARAM);
        else p.set(FILTER_PARAM, next);
        return p;
      },
      { replace: true },
    );
    if (tab !== 'talabalar') setTab('talabalar');
  }

  const totals = data?.group.totals;
  const byStatus = totals ? countsByStatus(totals) : null;
  const filterTiles: FilterTile[] = byStatus
    ? [
        { id: 'all', label: 'Jami', value: totals!.total, tone: 'neutral' },
        { id: 'keldi', label: STATUS_META.keldi.label, value: byStatus.keldi, tone: 'success' },
        { id: 'kech_keldi', label: STATUS_META.kech_keldi.label, value: byStatus.kech_keldi, tone: 'warning' },
        { id: 'kelmadi', label: STATUS_META.kelmadi.label, value: byStatus.kelmadi, tone: 'danger' },
        ...(isToday || byStatus.kutilmoqda > 0
          ? [{ id: 'kutilmoqda' as const, label: STATUS_META.kutilmoqda.label, value: byStatus.kutilmoqda, tone: 'neutral' as const }]
          : []),
        { id: 'malumot_yoq', label: STATUS_META.malumot_yoq.label, value: byStatus.malumot_yoq + byStatus.dam_olish, tone: 'neutral' },
      ]
    : [];

  const faced = students.filter((s) => s.biometricsStatus === 'tasdiqlangan').length;
  const facePct = totals ? enrolledPct(totals) : null;
  const faceTiles: FilterTile<FaceFilter>[] = [
    { id: 'all', label: 'Jami', value: students.length, tone: 'neutral' },
    { id: 'bor', label: 'Yuzi bor', value: faced, tone: 'success' },
    { id: 'yoq', label: "Yuzi yo'q", value: students.length - faced, tone: 'warning' },
  ];

  const facultyCrumb = data
    ? { label: data.group.faculty ?? 'Fakultetsiz', to: withDate(situationPaths.faculty(data.group.facultyId)) }
    : { label: 'Fakultet' };
  const subtitle = data
    ? [data.group.faculty ?? 'Fakultetsiz', data.group.course ? `${data.group.course}-kurs` : null, `${data.students.length} talaba`, formatUzDate(date, { weekday: true })]
        .filter(Boolean)
        .join(' · ')
    : formatUzDate(date, { weekday: true });

  const minItemWidth = presentation ? (density === 'large' ? 220 : 172) : density === 'large' ? 196 : 148;

  return (
    <Page
      title={`${groupName} guruhi`}
      subtitle={subtitle}
      breadcrumbs={[{ label: 'Talabalar', to: withDate(situationPaths.faculties) }, facultyCrumb, { label: groupName }]}
      titleAddon={
        isToday && data ? (
          <Badge tone="success" className="gap-2" title="Kamera talabani tanishi bilan setka yangilanadi">
            <StatusDot tone="success" pulse />
            Jonli
          </Badge>
        ) : undefined
      }
      actions={
        <>
          {data && !presentation && (
            <div className="hidden sm:block">
              <Tabs variant="segmented" ariaLabel="Ko'rinish" value={mode} onChange={setMode} tabs={MODES} />
            </div>
          )}
          {group.updatedAt && (
            <span className="hidden text-xs tabular-nums text-subtle sm:inline">
              Yangilandi {group.updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={group.reload} loading={group.refreshing} />
        </>
      }
    >
      {group.loading ? (
        <GroupSkeleton />
      ) : group.error && !data ? (
        <Card padding="none">
          <ErrorState
            variant="block"
            title={/topilmadi/i.test(group.error) ? 'Guruh topilmadi' : "Guruh ma'lumotini olib bo'lmadi"}
            message={group.error}
            onRetry={group.reload}
          />
          <div className="flex justify-center pb-8">
            <ButtonLink to={withDate(situationPaths.faculties)} icon={ArrowLeft} variant="ghost">
              Fakultetlarga qaytish
            </ButtonLink>
          </div>
        </Card>
      ) : data && totals ? (
        <>
          {group.error && <ErrorState title="Yangilab bo'lmadi — oxirgi ma'lumot ko'rsatilmoqda" message={group.error} onRetry={group.reload} />}

          {!presentation && (
            <div className="sm:hidden">
              <Tabs variant="segmented" ariaLabel="Ko'rinish" value={mode} onChange={setMode} tabs={MODES} />
            </div>
          )}
          {mode === 'yuz' ? (
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                <div className="flex items-center gap-4 sm:flex-col sm:gap-1.5">
                  <ProgressRing value={facePct} tone={enrollTone(facePct)} size={presentation ? 120 : 96} sublabel="yuzi bor" ariaLabel={`Yuz topshirgan ${formatPercent(facePct)}`} />
                  <p className="text-xs text-muted sm:text-center">
                    <span className="font-semibold tabular-nums text-fg">{faced}</span> / {students.length} talaba
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <StatusFilterTiles
                    tiles={faceTiles}
                    total={students.length}
                    value={faceFilter}
                    onChange={setFaceFilter}
                    big={presentation}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {students.length - faced > 0 && (
                      <Button variant="primary" size="sm" icon={QrCode} onClick={() => setEnrollTarget({ name: groupName, faculty: data.group.faculty })}>
                        Topshirmaganlar va QR karta
                      </Button>
                    )}
                    <p className="text-xs text-muted">
                      {ready
                        ? "Yuzlar yetarli — «Davomat» ko'rinishida bugungi holat."
                        : "Yuzi borlar 50% dan oshgach, guruh davomati ishonchli bo'ladi."}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
              <div className="flex items-center gap-4 sm:flex-col sm:gap-1.5">
                <ProgressRing value={totals.rate} size={presentation ? 120 : 96} sublabel="davomat" ariaLabel={`Guruh davomati ${formatPercent(totals.rate)}`} />
                <p className="text-xs text-muted sm:text-center">
                  <span className="font-semibold tabular-nums text-fg">{totals.present}</span> / {totals.present + totals.absent + totals.notYet} keldi
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <StatusFilterTiles tiles={filterTiles} total={totals.total} value={filter} onChange={setFilter} big={presentation} />
              </div>
            </div>
            <CountsBar counts={totals} size="xs" className="[&>div]:rounded-none" />
          </Card>
          )}

          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'talabalar' && (
            <StudentsTab
              visible={visible}
              total={students.length}
              filter={mode === 'yuz' ? 'all' : filter}
              query={query}
              onQuery={setQuery}
              sort={sort}
              onSort={setSort}
              density={density}
              onDensity={setDensity}
              onResetFilter={() => {
                setQuery('');
                setFilter('all');
                setFaceFilter('all');
              }}
              onOpen={openStudent}
              selectedId={selectedId}
              enrollMode={mode === 'yuz'}
              flash={flash}
              liveFeed={liveFeed}
              minItemWidth={minItemWidth}
              presentation={presentation}
            />
          )}

          {tab === 'darslar' && data.lessons.length > 0 && <LessonList lessons={data.lessons} onOpen={setLesson} />}

          {tab === 'dinamika' && <TrendTab points={data.trend} />}
        </>
      ) : null}

      <StudentDrawer
        student={selected}
        groupName={groupName}
        date={date}
        withDate={withDate}
        onClose={() => setSelectedId(null)}
        onPrev={selectedIndex > 0 ? () => setSelectedId(visible[selectedIndex - 1].id) : undefined}
        onNext={selectedIndex >= 0 && selectedIndex < visible.length - 1 ? () => setSelectedId(visible[selectedIndex + 1].id) : undefined}
      />
      <LessonDrawer lesson={lesson} photos={photos} withDate={withDate} onClose={() => setLesson(null)} />
      <GroupEnrollDrawer target={enrollTarget} onClose={() => setEnrollTarget(null)} withDate={withDate} />
    </Page>
  );
}

function StudentsTab({
  visible,
  total,
  filter,
  query,
  onQuery,
  sort,
  onSort,
  density,
  onDensity,
  onResetFilter,
  onOpen,
  selectedId,
  flash,
  liveFeed,
  minItemWidth,
  presentation,
  enrollMode = false,
}: {
  visible: GroupStudent[];
  total: number;
  filter: StudentFilter;
  query: string;
  onQuery: (value: string) => void;
  sort: StudentSort;
  onSort: (value: StudentSort) => void;
  density: Density;
  onDensity: (value: Density) => void;
  onResetFilter: () => void;
  onOpen: (id: string) => void;
  selectedId: string | null;
  flash: Record<string, number>;
  liveFeed: LiveAttendanceMessage[];
  minItemWidth: number;
  presentation: boolean;
  enrollMode?: boolean;
}) {
  const filterFields: FilterFieldEntry[] = [
    // Taqdimot rejimida qidiruv maydoni ko'rsatilmaydi.
    !presentation && { kind: 'search', value: query, onChange: onQuery, placeholder: 'Talaba ismi…' },
    // Holat filtri yuqoridagi plitkalardan qo'yiladi — bu yerda faqat
    // natijasi ko'rinadi, lekin sanoq va tozalash uchun u ham maydon.
    {
      kind: 'custom',
      active: filter !== 'all',
      render:
        filter !== 'all' ? (
          <Badge tone={STATUS_META[filter].tone === 'neutral' ? 'primary' : STATUS_META[filter].tone} size="md">
            {STATUS_META[filter].label}: {visible.length} / {total}
          </Badge>
        ) : null,
    },
  ];
  return (
    <>
      <FilterBar
        fields={filterFields}
        // Holat/yuz filtrlari bitta joyda tozalanadi (sahifa holati).
        onReset={onResetFilter}
        end={
          <>
            <Select
              value={sort}
              onChange={(value) => onSort(value as StudentSort)}
              options={SORT_OPTIONS}
              ariaLabel="Saralash"
              size="md"
            />
            <IconButton
              icon={ZoomIn}
              label={density === 'large' ? 'Oddiy o\'lcham' : 'Katta kartalar'}
              variant="secondary"
              pressed={density === 'large'}
              className="hidden sm:inline-flex"
              onClick={() => onDensity(density === 'large' ? 'normal' : 'large')}
            />
          </>
        }
      />

      {liveFeed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-success/30 bg-success-soft/50 px-3 py-2 text-[13px]" aria-live="polite">
          <StatusDot tone="success" pulse />
          <span className="font-medium text-fg">Hozirgina keldi:</span>
          {liveFeed.map((m) => (
            <button
              key={m.personId}
              type="button"
              onClick={() => onOpen(m.personId)}
              className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg shadow-sm hover:text-primary"
            >
              {m.fullName ?? "Noma'lum"} <span className="tabular-nums text-muted">{m.checkIn}</span>
            </button>
          ))}
        </div>
      )}

      {total === 0 ? (
        <EmptyState icon={Users} title="Guruhda faol talaba yo'q" description="Talabalar «Reestr» bo'limida guruhga biriktiriladi." />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon={SearchX}
          title="Mos talaba topilmadi"
          description="Filtr yoki qidiruvni o'zgartirib ko'ring."
          action={
            <Button size="sm" onClick={onResetFilter}>
              Filtrni tozalash
            </Button>
          }
        />
      ) : (
        <PersonGrid minItemWidth={minItemWidth} className={presentation ? 'gap-4' : undefined}>
          {visible.map((student) => {
            const fresh = Boolean(flash[student.id]);
            if (student.biometricsStatus !== 'tasdiqlangan') {
              return (
                <PersonCard
                  key={student.id}
                  name={student.fullName}
                  photoUrl={student.photoUrl}
                  status={enrollMode ? null : student.status === 'malumot_yoq' ? 'nomalum' : student.status}
                  subtitle={
                    <span className="inline-flex items-center gap-1 font-medium text-warning">
                      <ScanFace size={12} aria-hidden="true" />
                      {student.biometricsStatus === 'kutilmoqda' ? 'Tasdiq kutilmoqda' : "Yuz yo'q"}
                    </span>
                  }
                  meta={enrollMode ? <span className="text-primary">QR bilan topshirish →</span> : undefined}
                  onClick={() => onOpen(student.id)}
                  selected={student.id === selectedId}
                  className={cn('border-dashed bg-surface-2/60 shadow-none [&_img]:opacity-60 [&_img]:grayscale', presentation && '[&_p]:text-sm')}
                />
              );
            }
            return (
              <PersonCard
                key={student.id}
                name={student.fullName}
                photoUrl={student.photoUrl}
                status={student.status === 'malumot_yoq' ? 'nomalum' : student.status}
                time={student.checkIn}
                subtitle={
                  student.biometricsStatus !== 'tasdiqlangan' ? (
                    <span className="text-warning">Yuzi yo'q</span>
                  ) : student.checkOut ? (
                    `ketdi ${student.checkOut}`
                  ) : isAwaiting(student.status) ? (
                    '—'
                  ) : (
                    'kirdi'
                  )
                }
                onClick={() => onOpen(student.id)}
                selected={student.id === selectedId}
                className={cn(
                  isAwaiting(student.status) && '[&_img]:opacity-75 [&_img]:grayscale',
                  fresh && 'animate-pop-in border-success ring-2 ring-success/60',
                  presentation && '[&_p]:text-sm',
                )}
              />
            );
          })}
        </PersonGrid>
      )}
    </>
  );
}

function TrendTab({ points }: { points: TrendPoint[] }) {
  const withData = points.filter((p) => p.rate !== null);
  const avg = averageRate(points);
  const best = withData.reduce<TrendPoint | null>((b, p) => (!b || (p.rate ?? 0) > (b.rate ?? 0) ? p : b), null);
  const worst = withData.reduce<TrendPoint | null>((w, p) => (!w || (p.rate ?? 101) < (w.rate ?? 101) ? p : w), null);
  const absentTotal = points.reduce((sum, p) => sum + p.absent, 0);
  const lateTotal = points.reduce((sum, p) => sum + p.late, 0);

  const columns: DataTableColumn<TrendPoint>[] = [
    { key: 'date', header: 'Sana', cell: (p) => formatUzDate(p.date, { weekday: true, year: false }), sortValue: (p) => p.date },
    { key: 'present', header: 'Keldi', align: 'right', cell: (p) => p.present, sortValue: (p) => p.present },
    { key: 'late', header: 'Kech keldi', align: 'right', cell: (p) => p.late, sortValue: (p) => p.late },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (p) => p.absent, sortValue: (p) => p.absent },
    {
      key: 'rate',
      header: 'Davomat',
      align: 'right',
      cell: (p) => <span className="font-semibold tabular-nums">{formatPercent(p.rate, 1)}</span>,
      sortValue: (p) => p.rate,
    },
  ];

  if (!withData.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="So'nggi 14 kunda davomat yozuvi yo'q"
        description="Kameralar guruh talabalarini tanigach yoki davomat kiritilgach grafik to'ladi."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="14 kunlik o'rtacha" value={formatPercent(avg, 1)} progress={avg} tone={avg === null ? 'neutral' : undefined} />
        <StatTile
          label="Eng yaxshi kun"
          value={formatPercent(best?.rate ?? null, 1)}
          hint={best ? formatUzDate(best.date, { weekday: true, year: false }) : undefined}
          tone="success"
        />
        <StatTile
          label="Eng past kun"
          value={formatPercent(worst?.rate ?? null, 1)}
          hint={worst ? formatUzDate(worst.date, { weekday: true, year: false }) : undefined}
          tone="danger"
        />
        <StatTile label="Kelmaganlar / kechikkanlar" value={`${absentTotal} / ${lateTotal}`} hint="14 kunda jami holatlar" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Davomat foizi" subtitle="Kunlik, so'nggi 14 kun · punktir — 85% maqsad" icon={TrendingUp} />
          <RateTrendChart points={points} />
        </Card>
        <Card>
          <CardHeader title="Holatlar" subtitle="Har kuni nechta talaba keldi, kechikdi yoki kelmadi" icon={Users} />
          <StatusTrendChart points={points} />
        </Card>
      </div>
      <DataTable
        ariaLabel="14 kunlik davomat jadvali"
        columns={columns}
        rows={[...points].reverse()}
        rowKey={(p) => p.date}
        dense
      />
    </>
  );
}
