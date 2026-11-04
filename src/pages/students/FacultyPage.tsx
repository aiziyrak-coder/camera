import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, RefreshCw, ScanFace, SearchX, Users } from 'lucide-react';
import {
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  IntelPanel,
  Page,
  SearchInput,
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
import { RATE_RAG, rag } from '../../ui/rag';
import { KpiReadout, RateCell, StaleNote } from '../../components/attendance/readout';
import { NO_FACULTY_ID, getFaculty, getGroups, situationPaths, type CourseBlock, type Counts, type GroupStat } from '../../lib/situationApi';
import { courseLabel, enrolledPct, groupsToCourses, hasAttendanceData, normalizeText, sortGroups, sumCounts, type GroupSortKey } from '../../lib/studentAttendance';
import { useViewDate } from '../../lib/viewDate';
import PdfButton from '../../components/situation/PdfButton';
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

async function loadFaculty(id: string, date: string, signal: AbortSignal): Promise<FacultyView> {
  if (id === NO_FACULTY_ID) {
    const groups = (await getGroups({ date }, { signal })).filter((g) => g.facultyId === null);
    const courses = groupsToCourses(groups);
    return { name: 'Fakultetsiz', totals: sumCounts(courses.map((c) => c.totals)), courses };
  }
  const detail = await getFaculty(id, date, { signal });
  return { name: detail.name, totals: detail.totals, courses: detail.courses };
}

/** Guruh o'lchangan davomatga egami: bo'sh guruhda ham, yuzlar yig'ilmagan
 *  guruhda ham foiz bor, lekin u hukm chiqarishga yaramaydi. */
function measured(g: GroupStat): boolean {
  return g.total > 0 && hasAttendanceData(g);
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
  // Standart tartib — YOMONI BIRINCHI: rahbar ekranni ochganda avval chora
  // kerak bo'lgan guruhni ko'radi. Tanlov saqlanadi (ilgari ham shunday edi).
  const sort: GroupSortKey = 'rate-asc';
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
  // Jadvalda saralash ustun sarlavhalari orqali bo'ladi, tanlagich esa
  // ko'rsatilmaydi — shuning uchun boshlang'ich tartib doim nom bo'yicha.
  // Ikkita raqobatdosh saralash bir-birini bekor qilardi.
  const tableRows = useMemo(() => sortGroups(blocks.flatMap((b) => b.groups), 'name'), [blocks]);
  // Qidiruv faol bo'lganda yuqoridagi umumiy ko'rsatkichlar ham FAQAT
  // ko'rinayotgan guruhlardan hisoblanadi — ilgari foiz butun fakultetni
  // ko'rsatib, pastdagi bitta topilgan guruh bilan zid chiqardi.
  const searching = normalizeText(query).length > 0;
  const summary = searching ? (flat.length ? sumCounts(flat) : undefined) : course === 'all' ? data?.totals : blocks[0]?.totals;
  const groupCount = data?.courses.reduce((n, c) => n + c.groups.length, 0) ?? 0;

  const title = data?.name ?? (facultyId === NO_FACULTY_ID ? 'Fakultetsiz' : 'Fakultet');
  const scopeLabel = searching ? "Topilgan guruhlar bo'yicha" : course === 'all' ? "Fakultet bo'yicha" : (blocks[0]?.label ?? 'Kurs bo\'yicha');

  /** Guruhlar → holat taxtasi kataklari. */
  const columns: DataTableColumn<GroupStat>[] = [
    { key: 'name', header: 'Guruh', cell: (g) => <span className="text-[13px] font-medium text-fg">{g.name}</span>, sortValue: (g) => g.name },
    // Ilgari kursi ko'rsatilmagan guruhda izohsiz "—" turardi — endi sababi yoziladi.
    { key: 'course', header: 'Kurs', cell: (g) => courseLabel(g.course), sortValue: (g) => g.course, hideOnMobile: true },
    { key: 'total', header: 'Jami', align: 'right', cell: (g) => formatNumber(g.total), sortValue: (g) => g.total },
    {
      key: 'faces',
      header: 'Yuzi bor',
      align: 'right',
      hideOnMobile: true,
      sortValue: (g) => enrolledPct(g),
      cell: (g) => (
        <span
          className={hasAttendanceData(g) ? undefined : 'font-semibold text-warning'}
          title="Kamera faqat yuzi topshirilgan talabani taniydi"
        >
          {formatPercent(enrolledPct(g))}
        </span>
      ),
    },
    // Math.max — CountsLegend bilan bir xil: buzuq ma'lumotda "-1" chiqmasin.
    { key: 'on', header: 'Vaqtida', align: 'right', cell: (g) => formatNumber(Math.max(0, g.present - g.late)), sortValue: (g) => Math.max(0, g.present - g.late) },
    { key: 'late', header: 'Kech keldi', align: 'right', cell: (g) => formatNumber(g.late), sortValue: (g) => g.late },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (g) => formatNumber(g.absent), sortValue: (g) => g.absent },
    // O'tgan kunda "hali kelmagan" bo'lmaydi (server pending=false) — o'rniga
    // kamera taniy olmagan (yuzi yo'q) va dam olish kunlari ko'rsatiladi.
    isToday
      ? { key: 'notYet', header: 'Kutilmoqda', align: 'right' as const, cell: (g: GroupStat) => formatNumber(g.notYet), sortValue: (g: GroupStat) => g.notYet }
      : {
          key: 'noData',
          header: "Yozuv yo'q",
          align: 'right' as const,
          cell: (g: GroupStat) => (
            <span title={g.dayOff > 0 ? `Kamera tanimagan ${g.noData} · dam olish kuni ${g.dayOff}` : 'Kamera tanimagan'}>
              {formatNumber(g.noData + g.dayOff)}
            </span>
          ),
          sortValue: (g: GroupStat) => g.noData + g.dayOff,
          hideOnMobile: true,
        },
    {
      key: 'rate',
      header: 'Keldi',
      align: 'right',
      width: '9rem',
      sortValue: (g) => g.rate,
      sortFirst: 'asc',
      // Bo'sh guruhda sabab boshqa: yuz kam emas, talabaning o'zi yo'q.
      cell: (g) => (
        <RateCell
          value={measured(g) ? g.rate : null}
          digits={1}
          note={g.total === 0 ? "talaba yo'q" : 'yuzlar yetarli emas'}
        />
      ),
    },
  ];

  return (
    <Page
      title={title}
      subtitle={`${data ? `${groupCount} guruh · ` : ''}${formatUzDate(date, { weekday: true })}`}
      breadcrumbs={[{ label: 'Talabalar', to: withDate(situationPaths.faculties) }, { label: title }]}
      actions={
        <>
          {data && facultyId !== NO_FACULTY_ID && (
            <PdfButton path="/api/situation/pdf/groups" params={{ facultyId, date }} filename={`${title}-${date}.pdf`} />
          )}
          <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={faculty.reload} loading={faculty.refreshing} />
        </>
      }
      tabs={data ? VIEWS : undefined}
      defaultTab={defaultMode}
      tabParam={VIEW_PARAM}
    >
      {data && mode === 'yuz' ? (
        <EnrollmentCampaign facultyId={facultyId} today={today} withDate={withDate} />
      ) : faculty.loading ? (
        <>
          <Skeleton className="h-32" />
          <SkeletonCards count={8} height="h-36" className="sm:grid-cols-2 xl:grid-cols-4" />
        </>
      ) : faculty.error && !data ? (
        <div className="border border-border bg-surface">
          <ErrorState variant="block" title={/topilmadi/i.test(faculty.error) ? 'Fakultet topilmadi' : undefined} message={faculty.error} onRetry={faculty.reload} />
          <div className="flex justify-center pb-8">
            <ButtonLink to={withDate(situationPaths.faculties)} icon={ArrowLeft} variant="ghost">
              Orqaga
            </ButtonLink>
          </div>
        </div>
      ) : data ? (
        <div className="flex min-w-0 flex-col gap-3">
          {faculty.error && <StaleNote message={faculty.error} onRetry={faculty.reload} />}

          <Tabs tabs={courseTabs} value={course} onChange={setCourse} ariaLabel="Kurslar" />

          {summary && (
            <IntelPanel title={scopeLabel}>
              {/* Qamrov nomi va foiz maxraji BITTA qatorda: "nimadan" degan
                  savol ekranni tark etmasin. */}
              <p className="border-b border-border px-3 py-1.5 text-[13px] text-muted">
                <span className="intel-code">
                  {formatNumber(summary.present)} / {formatNumber(summary.present + summary.absent + summary.notYet)} keldi
                </span>
              </p>
              <KpiReadout
                className="lg:grid-cols-3"
                items={[
                  { label: 'Keldi', value: formatPercent(summary.rate, 1), rate: summary.rate },
                  { label: 'Kech keldi', value: formatNumber(summary.late), unit: 'talaba' },
                  { label: 'Kelmadi', value: formatNumber(summary.absent), unit: 'talaba' },
                ]}
              />
            </IntelPanel>
          )}

          {/* Guruhlar — kartalar emas, filtrli jadval (2026-11-04, buyurtmachi
              so'rovi): kurs tugmalari va qidiruv tepada, saralash ustunlarda. */}
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Guruh nomi…" />
          </Toolbar>

          {groupCount === 0 ? (
            <EmptyState
              icon={Users}
              title="Guruh yo'q"
              description="Guruhlar «Shaxslar reestri» bo'limida biriktiriladi."
            />
          ) : flat.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="Topilmadi"
              description={course === 'all' ? undefined : "Boshqa kursda bo'lishi mumkin."}
              action={
                <Button size="sm" onClick={resetSearch}>
                  Tozalash
                </Button>
              }
            />
          ) : (
            <IntelPanel title="Guruhlar" code={`${tableRows.length} qator`}>
              <DataTable
                ariaLabel="Guruhlar"
                columns={columns}
                rows={tableRows}
                rowKey={(g) => g.name}
                onRowClick={(g) => navigate(withDate(situationPaths.group(g.name)))}
                rowRag={(g) => (measured(g) ? rag(g.rate, RATE_RAG) : 'yoq')}
                dense
              />
            </IntelPanel>
          )}

        </div>
      ) : null}
    </Page>
  );
}
