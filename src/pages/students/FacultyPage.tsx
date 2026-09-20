import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, LayoutGrid, RefreshCw, Rows3, ScanFace, SearchX, Users } from 'lucide-react';
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  ProgressBar,
  ProgressRing,
  SearchInput,
  Select,
  Skeleton,
  SkeletonCards,
  Tabs,
  Toolbar,
  formatNumber,
  formatPercent,
  formatUzDate,
  useUrlTab,
  type DataTableColumn,
  type TabItem,
} from '../../ui';
import { NO_FACULTY_ID, getFaculty, getGroups, situationPaths, type CourseBlock, type Counts, type GroupStat } from '../../lib/situationApi';
import { courseLabel, enrolledPct, groupsToCourses, hasAttendanceData, normalizeText, sortGroups, sumCounts, type GroupSortKey } from '../../lib/studentAttendance';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
import { CountsBar, CountsLegend } from '../../components/students/CountsBreakdown';
import { GroupCard } from '../../components/students/UnitCards';
import { useAsyncData } from '../../components/students/useAsyncData';
import { EnrollmentCampaign } from '../../components/students/EnrollmentCampaign';

type ViewId = 'davomat' | 'yuz';
const VIEW_PARAM = 'korinish';
const QUERY_PARAM = 'qidiruv';
const COURSE_PARAM = 'kurs';
const VIEWS: TabItem<ViewId>[] = [
  { id: 'davomat', label: 'Davomat', icon: CalendarCheck },
  { id: 'yuz', label: 'Yuz topshirish', icon: ScanFace },
];

interface FacultyView {
  name: string;
  totals: Counts;
  courses: CourseBlock[];
}

const SORTS: { value: GroupSortKey; label: string }[] = [
  { value: 'name', label: 'Nomi bo\'yicha' },
  { value: 'rate-asc', label: 'Avval past davomat' },
  { value: 'rate-desc', label: 'Avval yuqori davomat' },
];

async function loadFaculty(id: string, date: string, signal: AbortSignal): Promise<FacultyView> {
  if (id === NO_FACULTY_ID) {
    const groups = (await getGroups({ date }, { signal })).filter((g) => g.facultyId === null);
    const courses = groupsToCourses(groups);
    return { name: 'Fakultetsiz', totals: sumCounts(courses.map((c) => c.totals)), courses };
  }
  const detail = await getFaculty(id, date, { signal });
  return { name: detail.name, totals: detail.totals, courses: detail.courses };
}

/** Fakultet: kurslar bo'yicha guruhlar va ularning shu kungi davomati. */
export default function FacultyPage() {
  const { facultyId = '' } = useParams();
  const navigate = useNavigate();
  const { date, today, isToday, withDate } = useViewDate();
  const faculty = useAsyncData(`${facultyId}|${date}`, (signal) => loadFaculty(facultyId, date, signal), {
    identity: facultyId,
    refreshMs: isToday ? 60_000 : undefined,
  });
  const data = faculty.data;
  // Qidiruv URL'da saqlanadi: sahifa yangilanganda yoki havola ulashilganda
  // ro'yxat aynan o'sha holatda ochiladi (ilgari faqat komponent holatida edi).
  const [params, setParams] = useSearchParams();
  const query = params.get(QUERY_PARAM) ?? '';
  const setQuery = useCallback(
    (next: string) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(QUERY_PARAM, next);
          else p.delete(QUERY_PARAM);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  // Qidiruv ham, kurs tabi ham BITTA setParams'da tozalanadi: ketma-ket ikki
  // chaqiruv bir-birini bosib ketardi (ikkinchisi eski parametrlardan boshlab
  // birinchisining o'chirganini qaytarib qo'yardi).
  const resetSearch = useCallback(
    () =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete(QUERY_PARAM);
          p.delete(COURSE_PARAM);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  const [sort, setSort] = usePersistedState<GroupSortKey>('talabalar.fakultet.saralash', 'name');
  const [view, setView] = usePersistedState<'cards' | 'table'>('talabalar.fakultet.korinish', 'cards');
  // Talabasi yo'q fakultet "Yuz topshirish" bilan ochilmaydi — yig'iladigan
  // yuz ham yo'q, foydalanuvchi bo'sh kampaniya ko'rinishiga tushib qolardi.
  const defaultMode: ViewId = data && data.totals.total > 0 && !hasAttendanceData(data.totals) ? 'yuz' : 'davomat';
  const [mode] = useUrlTab(VIEWS, { param: VIEW_PARAM, defaultTab: defaultMode });

  const courseTabs: TabItem[] = useMemo(
    () => [
      { id: 'all', label: 'Hammasi', count: data ? data.courses.reduce((n, c) => n + c.groups.length, 0) : null },
      ...(data?.courses ?? []).map((c) => ({ id: c.course === null ? 'none' : String(c.course), label: c.label, count: c.groups.length })),
    ],
    [data],
  );
  const [course, setCourse] = useUrlTab(courseTabs, { param: COURSE_PARAM, defaultTab: 'all' });

  const blocks = useMemo(() => {
    const needle = normalizeText(query);
    return (data?.courses ?? [])
      .filter((c) => course === 'all' || (c.course === null ? 'none' : String(c.course)) === course)
      .map((c) => {
        const groups = sortGroups(c.groups.filter((g) => !needle || normalizeText(g.name).includes(needle)), sort);
        // Qidiruv guruhlarni kesganda sarlavhadagi "N guruh" kesilgan
        // ro'yxatdan, "M talaba · davomat X%" esa butun kursdan olinardi —
        // bitta qatorda ikki xil to'plam. Endi jami ham ko'rinayotgan
        // guruhlardan hisoblanadi.
        return { ...c, groups, totals: needle ? sumCounts(groups) : c.totals };
      });
  }, [data, course, query, sort]);
  const flat = useMemo(() => sortGroups(blocks.flatMap((b) => b.groups), sort), [blocks, sort]);
  // Qidiruv faol bo'lganda yuqoridagi umumiy karta ham FAQAT ko'rinayotgan
  // guruhlardan hisoblanadi — ilgari halqa butun fakultetni ko'rsatib,
  // pastdagi bitta topilgan guruh bilan zid chiqardi.
  const searching = normalizeText(query).length > 0;
  const summary = searching ? (flat.length ? sumCounts(flat) : undefined) : course === 'all' ? data?.totals : blocks[0]?.totals;
  const groupCount = data?.courses.reduce((n, c) => n + c.groups.length, 0) ?? 0;

  const columns: DataTableColumn<GroupStat>[] = [
    { key: 'name', header: 'Guruh', cell: (g) => <span className="font-medium text-fg">{g.name}</span>, sortValue: (g) => g.name },
    // Ilgari kursi ko'rsatilmagan guruhda izohsiz "—" turardi — endi sababi yoziladi.
    { key: 'course', header: 'Kurs', cell: (g) => courseLabel(g.course), sortValue: (g) => g.course, hideOnMobile: true },
    { key: 'total', header: 'Jami talaba', align: 'right', cell: (g) => formatNumber(g.total), sortValue: (g) => g.total },
    {
      key: 'faces',
      header: "Yuzi ro'yxatda",
      align: 'right',
      hideOnMobile: true,
      sortValue: (g) => enrolledPct(g),
      cell: (g) => (
        <span
          className={hasAttendanceData(g) ? 'tabular-nums' : 'tabular-nums font-medium text-warning'}
          title="Kamera faqat yuzi ro'yxatdan o'tgan talabani taniy oladi"
        >
          {formatPercent(enrolledPct(g))}
        </span>
      ),
    },
    // Math.max — CountsLegend bilan bir xil: buzuq ma'lumotda "-1" chiqmasin.
    { key: 'on', header: "O'z vaqtida", align: 'right', cell: (g) => formatNumber(Math.max(0, g.present - g.late)), sortValue: (g) => Math.max(0, g.present - g.late) },
    { key: 'late', header: 'Kech keldi', align: 'right', cell: (g) => formatNumber(g.late), sortValue: (g) => g.late },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (g) => formatNumber(g.absent), sortValue: (g) => g.absent },
    // O'tgan kunda "hali kelmagan" bo'lmaydi (server pending=false) — o'rniga
    // kamera taniy olmagan (yuzi yo'q) talabalar soni ko'rsatiladi.
    isToday
      ? { key: 'notYet', header: 'Hali kelmagan', align: 'right' as const, cell: (g: GroupStat) => formatNumber(g.notYet), sortValue: (g: GroupStat) => g.notYet }
      : {
          key: 'noData',
          header: "Ma'lumot yo'q",
          align: 'right' as const,
          cell: (g: GroupStat) => formatNumber(g.noData + g.dayOff),
          sortValue: (g: GroupStat) => g.noData + g.dayOff,
          hideOnMobile: true,
        },
    {
      key: 'rate',
      header: 'Kelganlar ulushi',
      width: '11rem',
      sortValue: (g) => g.rate,
      sortFirst: 'asc',
      // Bo'sh guruhda sabab boshqa: yuz kam emas, talabaning o'zi yo'q.
      cell: (g) => g.total === 0 ? (
        <span className="text-xs text-muted" title="Guruhga talaba biriktirilmagan">
          talaba yo'q
        </span>
      ) : !hasAttendanceData(g) ? (
        <span className="text-xs text-muted" title="Guruhda yuzini ro'yxatdan o'tkazgan talaba juda kam">
          hisoblab bo'lmaydi
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <ProgressBar value={g.rate} size="xs" className="flex-1" />
          <span className="w-12 text-right font-semibold tabular-nums">{formatPercent(g.rate)}</span>
        </div>
      ),
    },
  ];

  const name = data?.name ?? (facultyId === NO_FACULTY_ID ? 'Fakultetsiz' : 'Fakultet');

  return (
    <Page
      title={name}
      subtitle={`Fakultetdagi har bir guruhda ${isToday ? 'bugun' : 'shu kuni'} nechta talaba kelgani${data ? ` · ${groupCount} guruh, ${formatNumber(data.totals.total)} talaba` : ''} · ${formatUzDate(date, { weekday: true })}`}
      breadcrumbs={[{ label: 'Talabalar', to: withDate(situationPaths.faculties) }, { label: name }]}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={faculty.reload} loading={faculty.refreshing} />}
      tabs={data ? VIEWS : undefined}
      defaultTab={defaultMode}
      tabParam={VIEW_PARAM}
    >
      {data && mode === 'yuz' ? (
        <EnrollmentCampaign facultyId={facultyId} today={today} withDate={withDate} />
      ) : faculty.loading ? (
        <>
          <Skeleton className="h-32 rounded-card" />
          <SkeletonCards count={8} height="h-36" className="sm:grid-cols-2 xl:grid-cols-4" />
        </>
      ) : faculty.error && !data ? (
        <Card padding="none">
          <ErrorState variant="block" title={/topilmadi/i.test(faculty.error) ? 'Fakultet topilmadi' : undefined} message={faculty.error} onRetry={faculty.reload} />
          <div className="flex justify-center pb-8">
            <ButtonLink to={withDate(situationPaths.faculties)} icon={ArrowLeft} variant="ghost">
              Fakultetlarga qaytish
            </ButtonLink>
          </div>
        </Card>
      ) : data ? (
        <>
          <Tabs tabs={courseTabs} value={course} onChange={setCourse} ariaLabel="Kurslar" />
          {summary && (
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <ProgressRing value={summary.rate} size={88} sublabel="davomat" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">
                  {searching ? 'Topilgan guruhlar bo\'yicha' : course === 'all' ? 'Fakultet bo\'yicha' : blocks[0]?.label}
                  <span className="ml-2 font-normal text-muted">
                    {formatNumber(summary.present)} / {formatNumber(summary.present + summary.absent + summary.notYet)} keldi
                  </span>
                </p>
                <CountsBar counts={summary} size="md" className="mt-3" />
                <CountsLegend counts={summary} size="md" className="mt-3" />
              </div>
            </Card>
          )}

          <Toolbar
            end={
              <>
                {/* Jadvalda saralash ustun sarlavhalari orqali bo'ladi —
                    ikkinchi tanlagich faqat chalg'itardi: ikkita raqobatdosh
                    saralash bir-birini bekor qilardi. */}
                {view === 'cards' && <Select value={sort} onChange={(v) => setSort(v as GroupSortKey)} options={SORTS} ariaLabel="Saralash" />}
                <Tabs
                  variant="segmented"
                  ariaLabel="Ko'rinish"
                  value={view}
                  onChange={setView}
                  tabs={[
                    { id: 'cards', label: 'Kartalar', icon: LayoutGrid },
                    { id: 'table', label: 'Jadval', icon: Rows3 },
                  ]}
                />
              </>
            }
          >
            <SearchInput value={query} onChange={setQuery} placeholder="Guruh nomi…" />
          </Toolbar>

          {groupCount === 0 ? (
            <EmptyState
              icon={Users}
              title="Bu fakultetda guruh yo'q"
              description="Talabalar «Shaxslar reestri» bo'limida guruhlarga biriktiriladi. Shundan keyin guruhlar shu yerda ko'rinadi."
            />
          ) : flat.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="Guruh topilmadi"
              description={course === 'all' ? undefined : "Qidirilayotgan guruh boshqa kursda bo'lishi mumkin."}
              action={
                <Button size="sm" onClick={resetSearch}>
                  {course === 'all' ? 'Qidiruvni tozalash' : 'Qidiruv va kurs filtrini tozalash'}
                </Button>
              }
            />
          ) : view === 'table' ? (
            <DataTable
              ariaLabel="Guruhlar"
              columns={columns}
              rows={flat}
              rowKey={(g) => g.name}
              onRowClick={(g) => navigate(withDate(situationPaths.group(g.name)))}
              rowTone={(g) => (g.rate === null || !hasAttendanceData(g) ? null : g.rate >= 85 ? 'success' : g.rate >= 70 ? 'warning' : 'danger')}
            />
          ) : (
            blocks
              .filter((b) => b.groups.length > 0)
              .map((block) => (
                <section key={block.label} className="flex flex-col gap-3">
                  {course === 'all' && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="text-base font-semibold text-fg">{block.label}</h2>
                      <span className="text-[13px] text-muted">
                        {block.groups.length} guruh · {formatNumber(block.totals.total)} talaba · davomat{' '}
                        <span className="font-semibold tabular-nums text-fg">{formatPercent(block.totals.rate)}</span>
                      </span>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {block.groups.map((g) => (
                      <GroupCard key={g.name} group={g} to={withDate(situationPaths.group(g.name))} />
                    ))}
                  </div>
                </section>
              ))
          )}
        </>
      ) : null}
    </Page>
  );
}
