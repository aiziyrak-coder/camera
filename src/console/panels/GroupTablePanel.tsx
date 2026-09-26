import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { getGroups, type GroupStat, type GroupStudent } from '../../lib/situationApi';
import { Button, DataTable, DatePicker, SearchInput, Select, StatusBadge, cn, type DataTableColumn } from '../../ui';
import StatusCounters, { COUNTER_META, type CounterKey } from '../../components/situation/StatusCounters';
import Panel from '../Panel';
import type { GroupLive } from '../useGroupLive';
import type { NazoratSelection } from '../nazoratSelection';

/**
 * NAZORAT — chap jadval.
 *
 * Guruh tanlanmagan: barcha guruhlar (fakultet/kurs filtri bilan) bugungi
 * sanoqlari bilan; qatorni bosish — guruhni ochadi, sanoqni bosish — o'sha
 * holatdagilar bilan ochadi.
 * Guruh tanlangan: talabalar ro'yxati — holati, kelgan vaqti, hozirgi
 * darsda ko'ringanmi va yuzi bazadami. Tepadagi sanoqlar filtr.
 */

export function studentMatches(student: GroupStudent, key: CounterKey, lessonSeen: ReadonlySet<string> | null): boolean {
  switch (key) {
    case 'hammasi':
      return true;
    case 'kelgan':
      return student.status === 'keldi' || student.status === 'kech_keldi';
    case 'kech_keldi':
    case 'kelmadi':
    case 'kutilmoqda':
      return student.status === key;
    case 'yuzsiz':
      return student.biometricsStatus !== 'tasdiqlangan';
    case 'darsda':
      return Boolean(lessonSeen?.has(student.id));
    case 'darsda_emas':
      return Boolean(lessonSeen) && !lessonSeen!.has(student.id);
  }
}

export function lessonSeenIds(live: GroupLive): Set<string> | null {
  if (!live.current || !live.lessonRows) return null;
  return new Set(live.lessonRows.rows.filter((row) => row.firstSeenAt || row.sightings > 0).map((row) => row.studentId));
}

export function groupCounters(students: readonly GroupStudent[], seen: ReadonlySet<string> | null) {
  const keys: CounterKey[] = ['hammasi', 'kelgan', 'kech_keldi', 'kelmadi', 'kutilmoqda', 'yuzsiz'];
  if (seen) keys.push('darsda', 'darsda_emas');
  return keys.map((key) => ({ key, value: students.filter((s) => studentMatches(s, key, seen)).length }));
}

export default function GroupTablePanel({
  selection,
  live,
  date,
  setDate,
  isToday,
  pulse,
  expanded,
  onExpand,
  area,
}: {
  selection: NazoratSelection;
  live: GroupLive;
  date: string;
  setDate: (date: string) => void;
  isToday: boolean;
  pulse: number;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}) {
  const { group, status, setGroup, setStatus } = selection;
  const [groups, setGroups] = useState<GroupStat[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [faculty, setFaculty] = useState('');
  const [course, setCourse] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getGroups({ date }, { signal: controller.signal })
      .then((rows) => {
        setGroups(rows);
        setGroupsError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setGroupsError(err instanceof ApiError ? err.message : "Ma'lumotni olib bo'lmadi");
      });
    return () => controller.abort();
  }, [date, pulse]);

  const facultyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of groups ?? []) if (g.facultyId && g.faculty) seen.set(g.facultyId, g.faculty);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [groups]);
  const courseOptions = useMemo(() => {
    const seen = new Set<number>();
    for (const g of groups ?? []) if (g.course) seen.add(g.course);
    return [...seen].sort((a, b) => a - b).map((c) => ({ value: String(c), label: `${c}-kurs` }));
  }, [groups]);
  const groupOptions = useMemo(
    () => (groups ?? []).filter((g) => g.total > 0).map((g) => ({ value: g.name, label: g.name })),
    [groups],
  );

  const shownGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (groups ?? []).filter(
      (g) =>
        g.total > 0 &&
        (!faculty || g.facultyId === faculty) &&
        (!course || String(g.course) === course) &&
        (!needle || g.name.toLowerCase().includes(needle)),
    );
  }, [groups, faculty, course, search]);

  const seen = lessonSeenIds(live);
  const students = live.detail?.students ?? [];
  const shownStudents = students.filter((s) => studentMatches(s, status, seen));

  const openGroup = (name: string, key: CounterKey = 'hammasi') => {
    setGroup(name);
    if (key !== 'hammasi') window.setTimeout(() => setStatus(key), 0);
  };

  const countCell = (row: GroupStat, key: CounterKey, value: number, tone: string) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openGroup(row.name, key);
      }}
      className={cn('tabular-nums font-semibold hover:underline', tone)}
      title={`${row.name}: ${COUNTER_META[key].label.toLowerCase()}`}
    >
      {value}
    </button>
  );

  const groupColumns: DataTableColumn<GroupStat>[] = [
    { key: 'name', header: 'Guruh', sortValue: (r) => r.name, cell: (r) => <b>{r.name}</b> },
    { key: 'course', header: 'Kurs', sortValue: (r) => r.course ?? 0, cell: (r) => r.course ?? '—', align: 'center' },
    { key: 'total', header: 'Jami', sortValue: (r) => r.total, align: 'right', cell: (r) => countCell(r, 'hammasi', r.total, 'text-fg') },
    { key: 'present', header: 'Keldi', sortValue: (r) => r.present, align: 'right', cell: (r) => countCell(r, 'kelgan', r.present, 'text-success') },
    { key: 'late', header: 'Kech', sortValue: (r) => r.late, align: 'right', cell: (r) => countCell(r, 'kech_keldi', r.late, 'text-warning') },
    { key: 'absent', header: 'Kelmadi', sortValue: (r) => r.absent, align: 'right', cell: (r) => countCell(r, 'kelmadi', r.absent, 'text-danger') },
    { key: 'notYet', header: 'Hali yo‘q', sortValue: (r) => r.notYet, align: 'right', cell: (r) => countCell(r, 'kutilmoqda', r.notYet, 'text-muted') },
    { key: 'noFace', header: 'Yuzsiz', sortValue: (r) => r.total - r.enrolled, align: 'right', cell: (r) => countCell(r, 'yuzsiz', r.total - r.enrolled, 'text-danger') },
    { key: 'rate', header: '%', sortValue: (r) => r.rate ?? -1, align: 'right', cell: (r) => (r.rate == null ? '—' : `${Math.round(r.rate)}%`) },
  ];

  const studentColumns: DataTableColumn<GroupStudent>[] = [
    { key: 'n', header: '№', width: '2.5rem', cell: (_r, i) => i + 1, mono: true },
    {
      key: 'name',
      header: 'F.I.Sh.',
      sortValue: (r) => r.fullName,
      cell: (r) => (
        <Link to={`/shaxs/${encodeURIComponent(r.id)}`} className="font-medium text-fg hover:text-primary">
          {r.fullName}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status === 'malumot_yoq' ? 'nomalum' : r.status} size="sm" />,
    },
    { key: 'checkIn', header: 'Kelgan', sortValue: (r) => r.checkIn ?? '99', cell: (r) => r.checkIn ?? '—', mono: true },
    ...(seen
      ? [
          {
            key: 'lesson',
            header: 'Hozirgi dars',
            sortValue: (r: GroupStudent) => (seen.has(r.id) ? 0 : 1),
            cell: (r: GroupStudent) =>
              seen.has(r.id) ? (
                <span className="text-[12px] font-semibold text-success">darsda</span>
              ) : (
                <span className="text-[12px] font-semibold text-danger">yo‘q</span>
              ),
          } satisfies DataTableColumn<GroupStudent>,
        ]
      : []),
    {
      key: 'face',
      header: 'Yuz',
      sortValue: (r) => (r.biometricsStatus === 'tasdiqlangan' ? 0 : 1),
      cell: (r) =>
        r.biometricsStatus === 'tasdiqlangan' ? (
          <span className="text-[12px] text-success">bazada</span>
        ) : (
          <span className="text-[12px] font-semibold text-danger">yo‘q</span>
        ),
    },
  ];

  const content = (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 pb-3">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {group ? (
          <Button size="sm" icon={ArrowLeft} onClick={() => setGroup('')}>
            Guruhlar
          </Button>
        ) : null}
        <Select
          value={group}
          onChange={(value) => setGroup(value)}
          options={groupOptions}
          placeholder="Guruhni tanlang"
          ariaLabel="Guruh"
          size="sm"
          highlightActive
          className="min-w-[10rem]"
        />
        {!group && (
          <>
            <Select value={faculty} onChange={setFaculty} options={facultyOptions} placeholder="Barcha fakultetlar" ariaLabel="Fakultet" size="sm" highlightActive />
            <Select value={course} onChange={setCourse} options={courseOptions} placeholder="Barcha kurslar" ariaLabel="Kurs" size="sm" highlightActive />
            <SearchInput value={search} onChange={setSearch} placeholder="Guruh nomi" size="sm" className="w-36" />
          </>
        )}
        <span className="ms-auto">
          <DatePicker value={date} onChange={setDate} size="sm" quick stepper ariaLabel="Sana" />
        </span>
      </div>

      {group ? (
        <>
          <StatusCounters items={groupCounters(students, seen)} active={status} onPick={setStatus} size="sm" className="shrink-0" />
          <div className="min-h-0 flex-1">
            <DataTable
              columns={studentColumns}
              rows={shownStudents}
              rowKey={(r) => r.id}
              loading={live.loading && !live.detail}
              error={live.error}
              emptyTitle={status === 'hammasi' ? 'Guruhda talaba yo‘q' : `${COUNTER_META[status].label}: hech kim`}
              maxHeight="100%"
              dense
            />
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1">
          <DataTable
            columns={groupColumns}
            rows={shownGroups}
            rowKey={(r) => r.name}
            onRowClick={(r) => openGroup(r.name)}
            loading={!groups && !groupsError}
            error={groupsError}
            emptyTitle="Guruh topilmadi"
            maxHeight="100%"
            defaultSort={{ key: 'name', dir: 'asc' }}
            dense
          />
        </div>
      )}
      {!isToday && <p className="shrink-0 text-[11px] text-muted">Arxiv: {date} holati</p>}
    </div>
  );

  return (
    <Panel
      id="groups"
      title={group ? `Guruh ${group}` : 'Talabalar — guruhlar'}
      live={isToday}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={
        <span className="text-[11px] tabular-nums text-muted">
          {group ? `${shownStudents.length}/${students.length}` : `${shownGroups.length} guruh`}
        </span>
      }
      full={content}
    >
      {expanded ? null : content}
    </Panel>
  );
}
