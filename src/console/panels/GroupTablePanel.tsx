import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Users } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import {
  getGroups,
  getKafedras,
  type GroupStat,
  type GroupStudent,
  type KafedraStat,
  type PeopleStatusKey,
  type StatusCounts,
} from '../../lib/situationApi';
import { Button, DataTable, DatePicker, SearchInput, Select, StatusBadge, Tabs, cn, type DataTableColumn } from '../../ui';
import StatusCounters, { COUNTER_META, type CounterKey } from '../../components/situation/StatusCounters';
import StatusPeopleTable from '../../components/situation/StatusPeopleTable';
import Panel from '../Panel';
import type { GroupLive } from '../useGroupLive';
import type { NazoratSelection, Who } from '../nazoratSelection';

/**
 * NAZORAT — chap jadval.
 *
 * Tepada: Talabalar | O'qituvchi va xodimlar. Filtrlar aniq nomlangan:
 *   talabalar — fakultet, kurs, guruh, holat, F.I.Sh.;
 *   xodimlar  — kafedra/bo'lim, holat, F.I.Sh.
 *
 * Talabalar, guruh tanlanmagan: holat va qidiruv bo'sh bo'lsa — guruhlar
 * jadvali (sanoqlar bosiladi); holat yoki F.I.Sh. berilsa — shu filtrdagi
 * talabalarning o'zi (butun institut / fakultet / kurs bo'yicha).
 * Guruh tanlangan: guruh talabalari — holati, kelgan vaqti, hozirgi darsda
 * ko'ringanmi, yuzi bazadami.
 */

const WHO_TABS = [
  { id: 'talaba' as const, label: 'Talabalar', icon: GraduationCap },
  { id: 'xodim' as const, label: 'O‘qituvchi va xodimlar', icon: Users },
];

const DAY_KEYS: CounterKey[] = ['hammasi', 'kelgan', 'kech_keldi', 'kelmadi', 'kutilmoqda', 'yuzsiz'];
const COUNT_FIELD: Record<string, keyof StatusCounts> = {
  hammasi: 'hammasi',
  kelgan: 'kelgan',
  kech_keldi: 'kechKeldi',
  kelmadi: 'kelmadi',
  kutilmoqda: 'kutilmoqda',
  yuzsiz: 'yuzsiz',
};

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
  const keys: CounterKey[] = [...DAY_KEYS];
  if (seen) keys.push('darsda', 'darsda_emas');
  return keys.map((key) => ({ key, value: students.filter((s) => studentMatches(s, key, seen)).length }));
}

function statusOptions(keys: readonly CounterKey[]) {
  return keys.filter((k) => k !== 'hammasi').map((k) => ({ value: k, label: COUNTER_META[k].label }));
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
  const { who, group, status, setWho, setGroup, setStatus } = selection;
  const students = who === 'talaba';
  const [groups, setGroups] = useState<GroupStat[] | null>(null);
  const [units, setUnits] = useState<KafedraStat[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [faculty, setFaculty] = useState('');
  const [course, setCourse] = useState('');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<StatusCounts | null>(null);

  useEffect(() => setSearch(''), [who, group]);

  useEffect(() => {
    const controller = new AbortController();
    const load = students
      ? getGroups({ date }, { signal: controller.signal }).then(setGroups)
      : getKafedras(date, { signal: controller.signal }, 'all').then(setUnits);
    load
      .then(() => setLoadError(null))
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err instanceof ApiError ? err.message : "Ma'lumotni olib bo'lmadi");
      });
    return () => controller.abort();
  }, [date, pulse, students]);

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
  const filteredGroups = useMemo(
    () =>
      (groups ?? []).filter(
        (g) => g.total > 0 && (!faculty || g.facultyId === faculty) && (!course || String(g.course) === course),
      ),
    [groups, faculty, course],
  );
  const groupOptions = useMemo(() => filteredGroups.map((g) => ({ value: g.name, label: g.name })), [filteredGroups]);
  const unitOptions = useMemo(
    () =>
      (units ?? [])
        .filter((u) => u.staffTotal > 0)
        .map((u) => ({ value: u.id, label: `${u.name} (${u.staffTotal})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [units],
  );

  const seen = lessonSeenIds(live);
  const groupStudents = live.detail?.students ?? [];
  const needle = search.trim().toLowerCase();
  const shownStudents = groupStudents.filter(
    (s) => studentMatches(s, status, seen) && (!needle || s.fullName.toLowerCase().includes(needle)),
  );

  // Talabalar, guruh tanlanmagan: holat/F.I.Sh. berilsa — odamlar ro'yxati, aks holda guruhlar.
  const peopleMode = !students || (!group && (status !== 'hammasi' || needle.length > 0));

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
      title={`${row.name}: ${COUNTER_META[key].label.toLowerCase()} — ro‘yxat`}
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

  const statusKeys: CounterKey[] = students && group && seen ? [...DAY_KEYS, 'darsda', 'darsda_emas'] : DAY_KEYS;
  const peopleQuery = students
    ? {
        date,
        type: 'talaba' as const,
        facultyId: faculty || undefined,
        course: course ? Number(course) : undefined,
        search: needle || undefined,
      }
    : { date, type: 'xodim' as const, departmentId: group || undefined, search: needle || undefined };

  const filters = (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs<Who> tabs={WHO_TABS} value={who} onChange={setWho} variant="segmented" size="sm" ariaLabel="Kimlar" />
        <span className="ms-auto">
          <DatePicker value={date} onChange={setDate} size="sm" quick stepper ariaLabel="Sana" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {students && group && (
          <Button size="sm" icon={ArrowLeft} onClick={() => setGroup('')}>
            Barcha guruhlar
          </Button>
        )}
        {students ? (
          <>
            {!group && (
              <>
                <Select label="Fakultet" value={faculty} onChange={setFaculty} options={facultyOptions} placeholder="hammasi" size="sm" highlightActive />
                <Select label="Kurs" value={course} onChange={setCourse} options={courseOptions} placeholder="hammasi" size="sm" highlightActive />
              </>
            )}
            <Select label="Guruh" value={group} onChange={setGroup} options={groupOptions} placeholder="hammasi" size="sm" highlightActive />
          </>
        ) : (
          <Select label="Kafedra / bo‘lim" value={group} onChange={setGroup} options={unitOptions} placeholder="hammasi" size="sm" highlightActive />
        )}
        <Select
          label="Holat"
          value={status === 'hammasi' ? '' : status}
          onChange={(value) => setStatus((value || 'hammasi') as CounterKey)}
          options={statusOptions(statusKeys)}
          placeholder="hammasi"
          size="sm"
          highlightActive
        />
        <SearchInput value={search} onChange={setSearch} placeholder="F.I.Sh. bo‘yicha qidirish" size="sm" className="w-52" />
      </div>
    </div>
  );

  let body;
  if (students && group) {
    body = (
      <>
        <StatusCounters items={groupCounters(groupStudents, seen)} active={status} onPick={setStatus} size="sm" className="shrink-0" />
        <div className="min-h-0 flex-1">
          <DataTable
            columns={studentColumns}
            rows={shownStudents}
            rowKey={(r) => r.id}
            loading={live.loading && !live.detail}
            error={live.error}
            emptyTitle={status === 'hammasi' ? 'Hech kim topilmadi' : `${COUNTER_META[status].label}: hech kim`}
            maxHeight="100%"
            dense
          />
        </div>
      </>
    );
  } else if (peopleMode) {
    body = (
      <>
        <StatusCounters
          items={DAY_KEYS.map((key) => ({ key, value: counts ? counts[COUNT_FIELD[key]] : null }))}
          active={status}
          onPick={setStatus}
          size="sm"
          className="shrink-0"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StatusPeopleTable
            query={peopleQuery}
            status={(status === 'darsda' || status === 'darsda_emas' ? 'hammasi' : status) as PeopleStatusKey}
            refreshKey={pulse}
            onLoaded={(page) => setCounts(page.counts)}
          />
        </div>
      </>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1">
        <DataTable
          columns={groupColumns}
          rows={filteredGroups}
          rowKey={(r) => r.name}
          onRowClick={(r) => openGroup(r.name)}
          loading={!groups && !loadError}
          error={loadError}
          emptyTitle="Guruh topilmadi"
          maxHeight="100%"
          defaultSort={{ key: 'name', dir: 'asc' }}
          dense
        />
      </div>
    );
  }

  const content = (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 pb-3">
      {filters}
      {body}
      {!isToday && <p className="shrink-0 text-[11px] text-muted">Arxiv: {date} holati</p>}
    </div>
  );

  const unitName = !students && group ? units?.find((u) => u.id === group)?.name : null;
  const title = students ? (group ? `Guruh ${group}` : 'Talabalar') : unitName ?? 'O‘qituvchi va xodimlar';
  const badge =
    students && group ? `${shownStudents.length}/${groupStudents.length}` : students && !peopleMode ? `${filteredGroups.length} guruh` : null;

  return (
    <Panel
      id="groups"
      title={title}
      live={isToday}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      clickToExpand={false}
      badge={badge ? <span className="text-[11px] tabular-nums text-muted">{badge}</span> : undefined}
      full={content}
    >
      {expanded ? null : content}
    </Panel>
  );
}
