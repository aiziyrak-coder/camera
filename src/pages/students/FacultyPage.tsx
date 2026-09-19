import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, RefreshCw, Rows3, SearchX, Users } from 'lucide-react';
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
import { groupsToCourses, normalizeText, sortGroups, sumCounts, type GroupSortKey } from '../../lib/studentAttendance';
import { usePersistedState } from '../../lib/usePersistedState';
import { useViewDate } from '../../lib/viewDate';
import { CountsBar, CountsLegend } from '../../components/students/CountsBreakdown';
import { GroupCard } from '../../components/students/UnitCards';
import { useAsyncData } from '../../components/students/useAsyncData';

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
  const { date, isToday, withDate } = useViewDate();
  const faculty = useAsyncData(`${facultyId}|${date}`, (signal) => loadFaculty(facultyId, date, signal), {
    identity: facultyId,
    refreshMs: isToday ? 60_000 : undefined,
  });
  const data = faculty.data;
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistedState<GroupSortKey>('talabalar.fakultet.saralash', 'name');
  const [view, setView] = usePersistedState<'cards' | 'table'>('talabalar.fakultet.korinish', 'cards');

  const courseTabs: TabItem[] = useMemo(
    () => [
      { id: 'all', label: 'Hammasi', count: data ? data.courses.reduce((n, c) => n + c.groups.length, 0) : null },
      ...(data?.courses ?? []).map((c) => ({ id: c.course === null ? 'none' : String(c.course), label: c.label, count: c.groups.length })),
    ],
    [data],
  );
  const [course, setCourse] = useUrlTab(courseTabs, { param: 'kurs', defaultTab: 'all' });

  const blocks = useMemo(() => {
    const needle = normalizeText(query);
    return (data?.courses ?? [])
      .filter((c) => course === 'all' || (c.course === null ? 'none' : String(c.course)) === course)
      .map((c) => ({ ...c, groups: sortGroups(c.groups.filter((g) => !needle || normalizeText(g.name).includes(needle)), sort) }));
  }, [data, course, query, sort]);
  const flat = useMemo(() => sortGroups(blocks.flatMap((b) => b.groups), sort), [blocks, sort]);
  const summary = course === 'all' ? data?.totals : blocks[0]?.totals;
  const groupCount = data?.courses.reduce((n, c) => n + c.groups.length, 0) ?? 0;

  const columns: DataTableColumn<GroupStat>[] = [
    { key: 'name', header: 'Guruh', cell: (g) => <span className="font-medium text-fg">{g.name}</span>, sortValue: (g) => g.name },
    { key: 'course', header: 'Kurs', cell: (g) => (g.course ? `${g.course}-kurs` : '—'), sortValue: (g) => g.course, hideOnMobile: true },
    { key: 'total', header: 'Talabalar', align: 'right', cell: (g) => formatNumber(g.total), sortValue: (g) => g.total },
    { key: 'on', header: 'Keldi', align: 'right', cell: (g) => formatNumber(g.present - g.late), sortValue: (g) => g.present - g.late },
    { key: 'late', header: 'Kech', align: 'right', cell: (g) => formatNumber(g.late), sortValue: (g) => g.late },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (g) => formatNumber(g.absent), sortValue: (g) => g.absent },
    { key: 'notYet', header: 'Kutilmoqda', align: 'right', cell: (g) => formatNumber(g.notYet), sortValue: (g) => g.notYet, hideOnMobile: !isToday },
    {
      key: 'rate',
      header: 'Davomat',
      width: '11rem',
      sortValue: (g) => g.rate,
      sortFirst: 'asc',
      cell: (g) => (
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
      subtitle={`${data ? `${formatNumber(data.totals.total)} talaba · ${groupCount} guruh · ` : ''}${formatUzDate(date, { weekday: true })}`}
      breadcrumbs={[{ label: 'Talabalar', to: withDate(situationPaths.faculties) }, { label: name }]}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={faculty.reload} loading={faculty.refreshing} />}
    >
      {faculty.loading ? (
        <>
          <Skeleton className="h-32 rounded-card" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-card" />
            ))}
          </div>
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
                  {course === 'all' ? 'Fakultet bo\'yicha' : blocks[0]?.label}
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
                <Select value={sort} onChange={(v) => setSort(v as GroupSortKey)} options={SORTS} ariaLabel="Saralash" />
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
            <EmptyState icon={Users} title="Bu fakultetda guruh yo'q" description="Talabalar «Reestr» bo'limida guruhlarga biriktiriladi." />
          ) : flat.length === 0 ? (
            <EmptyState compact icon={SearchX} title="Guruh topilmadi" action={<Button size="sm" onClick={() => setQuery('')}>Qidiruvni tozalash</Button>} />
          ) : view === 'table' ? (
            <DataTable
              ariaLabel="Guruhlar"
              columns={columns}
              rows={flat}
              rowKey={(g) => g.name}
              onRowClick={(g) => navigate(withDate(situationPaths.group(g.name)))}
              rowTone={(g) => (g.rate === null ? null : g.rate >= 85 ? 'success' : g.rate >= 70 ? 'warning' : 'danger')}
              manualSort
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
