import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CalendarClock, LayoutGrid, QrCode, RefreshCw, Rows3, ScanFace, SearchX, TrendingUp, Users, ZoomIn } from 'lucide-react';
import {
  Badge,
  ButtonLink,
  CodeText,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  EmptyState,
  ErrorState,
  IconButton,
  IntelPanel,
  MicroLabel,
  Page,
  PersonCard,
  PersonGrid,
  Select,
  Skeleton,
  StatusLamp,
  Tabs,
  FilterBar,
  Button,
  cn,
  focusRing,
  formatNumber,
  formatPercent,
  formatUzDate,
  useShell,
  useUrlTab,
  type DataTableColumn,
  type FilterFieldEntry,
  type TabItem,
} from '../../ui';
import { RATE_RAG, rag } from '../../ui/rag';
import { KpiReadout, RateCell, StaleNote, StatusMark, stamp } from '../../components/attendance/readout';
import { dayReference, idToken, unitCode } from '../../components/attendance/references';
import { branding } from '../../lib/branding';
import { getGroup, situationPaths, type GroupDetail, type GroupStudent, type Lesson, type TrendPoint } from '../../lib/situationApi';
import {
  STATUS_META,
  applyArrival,
  averageRate,
  countsByStatus,
  countsFromStudents,
  enrolledPct,
  hasAttendanceData,
  filterStudents,
  isAwaiting,
  sortStudents,
  statusMeta,
  type StudentFilter,
  type StudentSort,
} from '../../lib/studentAttendance';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
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
/** Ro'yxat — asosiy ko'rinish; setka suratlar kerak bo'lganda. */
type Layout = 'royxat' | 'setka';

const FILTER_PARAM = 'holat';
const QUERY_PARAM = 'qidiruv';
/** useUrlTab'ning standart parametri — filtr bilan bitta yangilanishda o'zgarishi uchun kerak. */
const TAB_PARAM = 'tab';
// dam_olish bu yerda yo'q: u "Ma'lumot yo'q" plitkasiga qo'shib ko'rsatiladi
// (matchesFilter). Aks holda ?holat=dam_olish hech bir plitka belgilanmagan,
// tushunarsiz holatga olib kelardi.
const FILTERS: StudentFilter[] = ['all', 'keldi', 'kech_keldi', 'kelmadi', 'kutilmoqda', 'malumot_yoq'];
const SORT_OPTIONS: { value: StudentSort; label: string }[] = [
  { value: 'status', label: 'Avval kelmaganlar' },
  { value: 'arrival', label: 'Kelish vaqti' },
  { value: 'name', label: 'Ism bo\'yicha' },
];
const LIVE_FLASH_MS = 10_000;
const REFRESH_MS = 60_000;

function parseFilter(raw: string | null): StudentFilter {
  return FILTERS.includes(raw as StudentFilter) ? (raw as StudentFilter) : 'all';
}

/** Talabaning kuni bir og'iz so'z bilan. "—" o'rniga holatning O'ZI
 *  yoziladi: bo'sh chiziqcha nimani anglatishini hech kim bilmasdi. */
function arrivalNote(student: GroupStudent): string {
  if (student.checkOut) return `ketdi ${student.checkOut}`;
  if (student.status === 'kutilmoqda') return 'hali kelmadi';
  if (student.status === 'kelmadi') return 'kelmadi';
  return 'kirdi';
}

function GroupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Yuklanmoqda" className="flex flex-col gap-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-20" />
      <div className="flex flex-col gap-px bg-border">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-8 rounded-none" />
        ))}
      </div>
    </div>
  );
}

/** Guruh sahifasi — ro'yxat asbobi: har talabaning holati, kelgan vaqti va
 *  surati. Kamera talabani tanishi bilan qator jonli yangilanadi. */
export default function GroupPage() {
  const { groupName = '' } = useParams();
  const { date, isToday, withDate } = useViewDate();
  const { presentation } = useShell();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get(FILTER_PARAM));
  // Qidiruv ham URL'da: havolani ulashganda yoki sahifani yangilaganda
  // ro'yxat aynan o'sha holatda ochiladi.
  const query = params.get(QUERY_PARAM) ?? '';
  // Bir necha parametr HAR DOIM bitta yangilanishda o'zgaradi. Ilgari
  // setFilter/setFaceFilter/setTab ketma-ket chaqirilardi va ikkinchisi eski
  // parametrlardan boshlab birinchisining o'chirganini qaytarib qo'yardi
  // (masalan "Filtrni tozalash" holat filtrini tozalamasdi).
  const patchParams = useCallback(
    (apply: (p: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          apply(p);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  const setQuery = useCallback(
    (next: string) => patchParams((p) => (next ? p.set(QUERY_PARAM, next) : p.delete(QUERY_PARAM))),
    [patchParams],
  );
  const [sort, setSort] = usePersistedState<StudentSort>('talabalar.guruh.saralash', 'status');
  const [density, setDensity] = usePersistedState<Density>('talabalar.guruh.olcham', 'normal');
  const [layout, setLayout] = usePersistedState<Layout>('talabalar.guruh.royxat', 'royxat');
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

  // Jonli: kamera talabani tanidi → qator darhol "Keldi", jami qayta hisoblanadi.
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

  // Yangi kelgan qatorning belgisi bir necha soniyadan keyin o'chadi.
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
      { id: 'dinamika', label: "So'nggi 14 kun", icon: TrendingUp },
    ],
    [data?.students.length, lessonCount, isToday],
  );
  const [tab, setTab] = useUrlTab(tabs, { defaultTab: 'talabalar' });

  const students = useMemo(() => data?.students ?? [], [data]);
  // Talabasi yo'q guruh "Yuz topshirish" bilan ochilmaydi (yig'iladigan yuz yo'q).
  const ready = data ? data.group.totals.total === 0 || hasAttendanceData(data.group.totals) : true;
  const [mode, setMode] = useUrlTab(MODES, { param: MODE_PARAM, defaultTab: ready ? 'davomat' : 'yuz' });
  const rawFace = params.get(FACE_PARAM);
  const faceFilter: FaceFilter = mode === 'yuz' && (rawFace === 'bor' || rawFace === 'yoq') ? rawFace : 'all';
  const visible = useMemo(() => {
    const base = filterStudents(students, mode === 'yuz' ? 'all' : filter, query);
    const byFace = faceFilter === 'all' ? base : base.filter((s) => (s.biometricsStatus === 'tasdiqlangan') === (faceFilter === 'bor'));
    return sortStudents(byFace, sort);
  }, [students, filter, query, sort, mode, faceFilter]);
  const photos = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  // Xizmat raqami — serverdan kelgan tartibda: qatorni telefonda aytish,
  // qog'ozda belgilash uchun. Filtr yoki saralash raqamni ko'chirmaydi.
  const rowCodes = useMemo(() => new Map(students.map((s, i) => [s.id, unitCode('T', i)])), [students]);
  const selectedIndex = selectedId ? visible.findIndex((s) => s.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : selectedId ? (photos.get(selectedId) ?? null) : null;

  function setFaceFilter(next: FaceFilter) {
    patchParams((p) => {
      if (next === 'all') p.delete(FACE_PARAM);
      else p.set(FACE_PARAM, next);
      // Filtr ro'yxatga tegishli — "Talabalar" tabiga qaytariladi
      // (TAB_PARAM o'chirilishi = standart tab).
      p.delete(TAB_PARAM);
    });
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
    patchParams((p) => {
      if (next === 'all') p.delete(FILTER_PARAM);
      else p.set(FILTER_PARAM, next);
      p.delete(TAB_PARAM);
    });
  }

  /** Qidiruv + holat + yuz filtri — bittada (FilterBar "Tozalash"). */
  function resetFilters() {
    patchParams((p) => {
      p.delete(QUERY_PARAM);
      p.delete(FILTER_PARAM);
      p.delete(FACE_PARAM);
    });
  }

  const totals = data?.group.totals;
  const byStatus = totals ? countsByStatus(totals) : null;
  const filterTiles: FilterTile[] = totals && byStatus
    ? [
        { id: 'all', label: 'Jami', value: totals.total, tone: 'neutral' },
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
    ? [
        isToday ? 'Har bir talabaning surati va bugungi holati' : 'Har bir talabaning surati va shu kungi holati',
        data.group.faculty ?? 'Fakultetsiz',
        data.group.course ? `${data.group.course}-kurs` : null,
        `${data.students.length} talaba`,
        formatUzDate(date, { weekday: true }),
      ]
        .filter(Boolean)
        .join(' · ')
    : formatUzDate(date, { weekday: true });

  const reference = dayReference(`GUR-${idToken(groupName)}`, date);
  const generatedAt = useMemo(stamp, [date, data]);
  const minItemWidth = presentation ? (density === 'large' ? 220 : 172) : density === 'large' ? 196 : 148;
  const effectiveLayout: Layout = presentation ? 'setka' : layout;

  return (
    <Page
      title={`${groupName} guruhi`}
      subtitle={subtitle}
      breadcrumbs={[{ label: 'Talabalar', to: withDate(situationPaths.faculties) }, facultyCrumb, { label: groupName }]}
      titleAddon={
        isToday && data ? (
          <StatusLamp status="ok" label="Jonli" pulse />
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
            <span className="intel-code hidden text-[12px] text-subtle sm:inline">
              {/* Butun tizim Toshkent vaqtida ishlaydi — brauzer boshqa mintaqada
                  bo'lsa bu yerda boshqa soat chiqib, "eskirgan" degan noto'g'ri
                  taassurot qoldirardi. */}
              Yangilandi {group.updatedAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' })}
            </span>
          )}
          <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={group.reload} loading={group.refreshing} />
        </>
      }
    >
      {group.loading ? (
        <GroupSkeleton />
      ) : group.error && !data ? (
        <div className="border border-border bg-surface">
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
        </div>
      ) : data && totals ? (
        <div className="flex min-w-0 flex-col gap-3">
          {/* 1. Hujjat blanki. */}
          <DocumentHeader
            org={branding.orgFullName}
            title={`${groupName} guruhi — ${mode === 'yuz' ? 'yuz topshirish' : 'kunlik davomat'}`}
            reference={reference}
            generatedAt={generatedAt}
            readouts={[
              { label: 'Fakultet', value: data.group.faculty ?? 'Fakultetsiz' },
              { label: 'Kurs', value: data.group.course ? `${data.group.course}-kurs` : '—' },
              { label: 'Kun', value: formatUzDate(date, { weekday: true }) },
              {
                label: mode === 'yuz' ? 'Yuzi topshirilgan' : 'Umumiy holat',
                value: mode === 'yuz' ? formatPercent(facePct, 1) : formatPercent(totals.rate, 1),
              },
            ]}
          />

          {group.error && <StaleNote message={group.error} onRetry={group.reload} />}

          {!presentation && (
            <div className="sm:hidden">
              <Tabs variant="segmented" ariaLabel="Ko'rinish" value={mode} onChange={setMode} tabs={MODES} />
            </div>
          )}

          {mode === 'yuz' ? (
            <IntelPanel
              title="Yuz topshirish holati"
              code={`${formatNumber(faced)} / ${formatNumber(students.length)}`}
              right={
                students.length - faced > 0 ? (
                  <Button variant="secondary" size="sm" icon={QrCode} onClick={() => setEnrollTarget({ name: groupName, faculty: data.group.faculty })}>
                    Topshirmaganlar va QR karta
                  </Button>
                ) : undefined
              }
            >
              <StatusFilterTiles tiles={faceTiles} total={students.length} value={faceFilter} onChange={setFaceFilter} big={presentation} />
              <p className="border-t border-border px-3 py-2 text-[12px] leading-snug text-muted">
                {ready
                  ? "Yuzlar yetarli yig'ilgan — «Davomat» ko'rinishida bugungi holat ko'rinadi."
                  : "Kamera faqat yuzi ro'yxatdan o'tgan talabani taniydi. Guruhning yarmidan ko'pi topshirgach, davomat foizi haqiqatga yaqin bo'ladi."}
              </p>
            </IntelPanel>
          ) : (
            <IntelPanel title="Kunlik holat" code={reference}>
              <KpiReadout
                className="lg:grid-cols-4"
                items={[
                  {
                    label: 'Kelganlar ulushi',
                    value: formatPercent(totals.rate, 1),
                    rate: hasAttendanceData(totals) ? totals.rate : null,
                    hint: `${formatNumber(totals.present)} / ${formatNumber(totals.present + totals.absent + totals.notYet)} keldi`,
                  },
                  { label: "Yuzi ro'yxatda", value: formatPercent(facePct, 1), hint: `${formatNumber(faced)} / ${formatNumber(students.length)} talaba` },
                  { label: 'Kech keldi', value: formatNumber(totals.late), unit: 'talaba' },
                  {
                    label: isToday ? 'Hali kelmagan' : "Ma'lumot yo'q",
                    value: formatNumber(isToday ? totals.notYet : totals.noData + totals.dayOff),
                    unit: 'talaba',
                    hint:
                      !isToday && totals.dayOff > 0
                        ? `Kamera tanimagan ${formatNumber(totals.noData)} · dam olish kuni ${formatNumber(totals.dayOff)}`
                        : undefined,
                  },
                ]}
              />
              <div className="border-t border-border">
                <StatusFilterTiles tiles={filterTiles} total={totals.total} value={filter} onChange={setFilter} big={presentation} />
              </div>
            </IntelPanel>
          )}

          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'talabalar' && (
            <StudentsTab
              visible={visible}
              codes={rowCodes}
              total={students.length}
              filter={mode === 'yuz' ? 'all' : filter}
              query={query}
              onQuery={setQuery}
              sort={sort}
              onSort={setSort}
              layout={effectiveLayout}
              onLayout={setLayout}
              density={density}
              onDensity={setDensity}
              onResetFilter={resetFilters}
              onOpen={openStudent}
              selectedId={selectedId}
              enrollMode={mode === 'yuz'}
              flash={flash}
              liveFeed={liveFeed}
              minItemWidth={minItemWidth}
              presentation={presentation}
            />
          )}

          {tab === 'darslar' && (
            <IntelPanel title={isToday ? 'Bugungi darslar' : 'Shu kungi darslar'} code={`${lessonCount} ta`}>
              <LessonList lessons={data.lessons} onOpen={setLesson} />
            </IntelPanel>
          )}

          {tab === 'dinamika' && <TrendTab points={data.trend} />}

          <DocumentFooter
            note={`Xizmat uchun. Hujjat ${reference} raqami bilan tizimda tuzilgan; holatlar ${formatUzDate(date, { weekday: true })} kuni uchun. Yuzi ro'yxatdan o'tmagan talabaning kuni "ma'lumot yo'q" — "kelmadi" degani emas.`}
          />
        </div>
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

/** Ro'yxatdagi bitta talaba — 32 px li qator: kod, ism, holat belgisi,
 *  monoshrift kelish/ketish vaqti. */
function RosterRow({
  student,
  code,
  selected,
  fresh,
  enrollMode,
  onOpen,
}: {
  student: GroupStudent;
  code: string;
  selected: boolean;
  fresh: boolean;
  enrollMode: boolean;
  onOpen: (id: string) => void;
}) {
  const faceless = student.biometricsStatus !== 'tasdiqlangan';
  const status = student.status === 'malumot_yoq' ? 'malumot_yoq' : student.status;
  const meta = statusMeta(status);
  return (
    <li className="bg-surface">
      <button
        type="button"
        onClick={() => onOpen(student.id)}
        aria-pressed={selected}
        className={cn(
          'grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1 text-left sm:grid-cols-[3.25rem_minmax(0,1fr)_7rem_4.5rem_4.5rem_6rem]',
          selected ? 'bg-primary-soft' : 'hover:bg-surface-2',
          fresh && 'shadow-[inset_2px_0_0_rgb(var(--c-success))]',
          focusRing,
        )}
      >
        <CodeText className="text-[11px] text-subtle">{code}</CodeText>
        <span className="min-w-0">
          {/* Odam ismi — proza: sans shriftda qoladi. */}
          <span className="block truncate text-[13px] font-medium text-fg" title={student.fullName}>
            {student.fullName}
          </span>
          {faceless && (
            <span className="intel-micro !text-warning" title="Kamera bu talabani taniy olmaydi — yuzi ro'yxatdan o'tmagan">
              {student.biometricsStatus === 'kutilmoqda' ? 'Yuzi tekshiruvda' : "Yuzi ro'yxatda yo'q"}
            </span>
          )}
        </span>
        <span className="justify-self-end sm:justify-self-start">
          {enrollMode && faceless ? (
            <MicroLabel className="!text-primary">QR bilan topshirish →</MicroLabel>
          ) : (
            <StatusMark status={status} label={meta.label} showLabel />
          )}
        </span>
        <CodeText className="hidden text-[12px] text-fg sm:block">{student.checkIn ?? '—'}</CodeText>
        <CodeText className="hidden text-[12px] text-muted sm:block">{student.checkOut ?? '—'}</CodeText>
        <span className="intel-micro hidden truncate sm:block">{arrivalNote(student)}</span>
      </button>
    </li>
  );
}

function StudentsTab({
  visible,
  codes,
  total,
  filter,
  query,
  onQuery,
  sort,
  onSort,
  layout,
  onLayout,
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
  codes: Map<string, string>;
  total: number;
  filter: StudentFilter;
  query: string;
  onQuery: (value: string) => void;
  sort: StudentSort;
  onSort: (value: StudentSort) => void;
  layout: Layout;
  onLayout: (value: Layout) => void;
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
            <Select value={sort} onChange={(value) => onSort(value as StudentSort)} options={SORT_OPTIONS} ariaLabel="Saralash" size="md" />
            {!presentation && (
              <Tabs
                variant="segmented"
                size="sm"
                ariaLabel="Ro'yxat ko'rinishi"
                value={layout}
                onChange={onLayout}
                tabs={[
                  { id: 'royxat' as const, label: "Ro'yxat", icon: Rows3 },
                  { id: 'setka' as const, label: 'Suratlar', icon: LayoutGrid },
                ]}
              />
            )}
            {layout === 'setka' && (
              <IconButton
                icon={ZoomIn}
                label={density === 'large' ? 'Oddiy o\'lcham' : 'Katta kartalar'}
                variant="secondary"
                pressed={density === 'large'}
                className="hidden sm:inline-flex"
                onClick={() => onDensity(density === 'large' ? 'normal' : 'large')}
              />
            )}
          </>
        }
      />

      {liveFeed.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 border border-success/40 bg-success-soft px-3 py-1.5 text-[13px]" aria-live="polite">
          <StatusLamp status="ok" label="Hozirgina keldi" pulse />
          {liveFeed.map((m) => (
            <button
              key={m.personId}
              type="button"
              onClick={() => onOpen(m.personId)}
              className={cn('border border-border bg-surface px-1.5 py-0.5 text-[12px] font-medium text-fg hover:text-primary', focusRing)}
            >
              {m.fullName ?? "Noma'lum"} <CodeText className="text-muted">{m.checkIn ?? 'hozir'}</CodeText>
            </button>
          ))}
        </p>
      )}

      {total === 0 ? (
        <EmptyState
          icon={Users}
          title="Guruhda faol talaba yo'q"
          description="Talabalar «Shaxslar reestri» bo'limida guruhga biriktiriladi. Shundan keyin ularning suratlari shu yerda ko'rinadi."
        />
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
        <IntelPanel
          title="Talabalar ro'yxati"
          code={`${visible.length} / ${total}`}
          right={<MicroLabel>Vaqt — Toshkent</MicroLabel>}
        >
          {layout === 'royxat' ? (
            <>
              {/* Ustun sarlavhalari — qog'ozdagi jadval kabi. */}
              <div className="hidden grid-cols-[3.25rem_minmax(0,1fr)_7rem_4.5rem_4.5rem_6rem] gap-x-3 border-b border-border bg-surface-2 px-3 py-1 sm:grid">
                <MicroLabel>Kod</MicroLabel>
                <MicroLabel>Talaba</MicroLabel>
                <MicroLabel>Holat</MicroLabel>
                <MicroLabel>Kirdi</MicroLabel>
                <MicroLabel>Chiqdi</MicroLabel>
                <MicroLabel>Izoh</MicroLabel>
              </div>
              <ul className="grid grid-cols-1 gap-px bg-border">
                {visible.map((student) => (
                  <RosterRow
                    key={student.id}
                    student={student}
                    code={codes.get(student.id) ?? 'T-00'}
                    selected={student.id === selectedId}
                    fresh={Boolean(flash[student.id])}
                    enrollMode={enrollMode}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </>
          ) : (
            <PersonGrid minItemWidth={minItemWidth} className={cn('gap-px bg-border p-px', presentation && 'gap-0.5')}>
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
                        <span
                          className="text-warning"
                          title="Kamera bu talabani taniy olmaydi — yuzi ro'yxatdan o'tmagan"
                        >
                          {student.biometricsStatus === 'kutilmoqda' ? 'Yuzi tekshiruvda' : "Yuzi ro'yxatda yo'q"}
                        </span>
                      }
                      meta={enrollMode ? <span className="text-primary">QR bilan topshirish →</span> : undefined}
                      onClick={() => onOpen(student.id)}
                      selected={student.id === selectedId}
                      className={cn('[&_img]:opacity-60 [&_img]:grayscale', presentation && '[&_p]:text-sm')}
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
                    // Bu tarmoqqa faqat yuzi tasdiqlangan talaba tushadi, shuning
                    // uchun "yuzi yo'q" shoxobchasi o'lik edi — olib tashlandi.
                    subtitle={arrivalNote(student)}
                    onClick={() => onOpen(student.id)}
                    selected={student.id === selectedId}
                    className={cn(
                      isAwaiting(student.status) && '[&_img]:opacity-75 [&_img]:grayscale',
                      fresh && 'border-success shadow-[inset_0_0_0_2px_rgb(var(--c-success))]',
                      presentation && '[&_p]:text-sm',
                    )}
                  />
                );
              })}
            </PersonGrid>
          )}
          <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
            Bu yerda bitta kun ko&apos;rsatiladi — kunlik holatga foiz hukmi (svetofor) qo&apos;yilmaydi. Talabaning davr bo&apos;yicha foizi uning o&apos;z sahifasida.
          </p>
        </IntelPanel>
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
    { key: 'date', header: 'Sana', cell: (p) => formatUzDate(p.date, { weekday: true, year: false }), sortValue: (p) => p.date, mono: true },
    { key: 'present', header: 'Keldi', align: 'right', cell: (p) => p.present, sortValue: (p) => p.present },
    { key: 'late', header: 'Kech keldi', align: 'right', cell: (p) => p.late, sortValue: (p) => p.late },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (p) => p.absent, sortValue: (p) => p.absent },
    {
      key: 'rate',
      header: 'Kelganlar ulushi',
      align: 'right',
      width: '9rem',
      // Yozuvi yo'q kunga hukm chiqarilmaydi — sababi yoziladi.
      cell: (p) => <RateCell value={p.rate} digits={1} note="yozuv yo'q" />,
      sortValue: (p) => p.rate,
    },
  ];

  if (!withData.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="So'nggi 14 kunda birorta yozuv yo'q"
        description="Bu guruhda hali hech kim kamerada tanilmagan — ehtimol talabalar yuzini ro'yxatdan o'tkazmagan. Birinchi kun qayd etilishi bilan grafik to'ladi."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <IntelPanel title="14 kunlik xulosa" code={`${withData.length} / ${points.length} kun`}>
        <KpiReadout
          items={[
            { label: "14 kunlik o'rtacha", value: formatPercent(avg, 1), rate: avg, hint: "Ma'lumot bor kunlar bo'yicha" },
            {
              label: "Eng ko'p kelgan kun",
              value: formatPercent(best?.rate ?? null, 1),
              rate: best?.rate ?? null,
              hint: best ? formatUzDate(best.date, { weekday: true, year: false }) : undefined,
            },
            {
              label: 'Eng kam kelgan kun',
              value: formatPercent(worst?.rate ?? null, 1),
              rate: worst?.rate ?? null,
              hint: worst ? formatUzDate(worst.date, { weekday: true, year: false }) : undefined,
            },
            {
              label: 'Kelmagan / kech kelgan',
              value: `${formatNumber(absentTotal)} / ${formatNumber(lateTotal)}`,
              hint: '14 kun davomida jami qayd etilgan holatlar',
            },
          ]}
        />
      </IntelPanel>
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <IntelPanel title="Kelgan talabalar ulushi" right={<MicroLabel>Punktir — 85% maqsad</MicroLabel>} bodyClassName="p-3">
          <RateTrendChart points={points} />
        </IntelPanel>
        <IntelPanel title="Kunlik holatlar" right={<MicroLabel>Keldi / kech / kelmadi</MicroLabel>} bodyClassName="p-3">
          <StatusTrendChart points={points} />
        </IntelPanel>
      </div>
      <IntelPanel title="Kun-kun jadval" code={`${points.length} qator`}>
        <DataTable
          ariaLabel="14 kunlik davomat jadvali"
          columns={columns}
          rows={[...points].reverse()}
          rowKey={(p) => p.date}
          rowRag={(p) => (p.rate === null ? 'yoq' : rag(p.rate, RATE_RAG))}
          dense
        />
      </IntelPanel>
    </div>
  );
}
