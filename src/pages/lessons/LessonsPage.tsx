import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartNoAxesColumn, ChevronLeft, ChevronRight, CirclePlay, Clock, FileUp, History, ListChecks, Plus } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DateRangePicker,
  Page,
  SearchInput,
  Select,
  StatTile,
  Toolbar,
  formatPercent,
  formatUzDate,
  rangeForPreset,
  relativeDayLabel,
  toneForRate,
  useToast,
  useUrlTab,
  type DateRangeValue,
  type TabItem,
} from '../../ui';
import LessonImportModal from '../../components/admin/LessonImportModal';
import ScheduleLessonModal, { type ScheduleTarget } from '../../components/admin/ScheduleLessonModal';
import { LessonAnalytics } from '../../components/lessons/LessonAnalytics';
import { LessonDrawer } from '../../components/lessons/LessonDrawer';
import { LessonsTable } from '../../components/lessons/LessonsTable';
import { useLoader } from '../../components/teachers/useLoader';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { getKafedras, getLessons, type Lesson, type LessonState } from '../../lib/situationApi';
import { deleteLessonSession, isLessonTracked, matchesName, summarizePunctuality } from '../../lib/teachersApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useFaculties } from '../../lib/useFaculties';
import { useGroups } from '../../lib/useGroups';
import { useViewDate } from '../../lib/viewDate';
import type { FixedPreset } from '../../lib/reportPeriods';

type TabId = 'barchasi' | LessonState | 'tahlil';

const PAGE_SIZE = 500;
const REFRESH_MS = 60_000;
const ANALYTICS_PRESETS: readonly FixedPreset[] = ['last7', 'last30', 'month'];
const SCHEDULE_OPTIONS = [
  { value: 'tracked', label: 'AI kuzatadi' },
  { value: 'incomplete', label: "Jadval to'liq emas" },
];

/** URL'dagi filtrlar — havola bilan ulashish va orqaga qaytishda saqlanadi.
 *  Bir nechta parametr bitta chaqiruvda yangilanadi (ketma-ket setSearchParams
 *  bir-birini bosib ketadi). */
function useFilterParams<K extends string>(names: readonly K[]): [Record<K, string>, (patch: Partial<Record<K, string>>) => void] {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(names.map((n) => [n, params.get(n) ?? ''])) as Record<K, string>;
  const update = useCallback(
    (patch: Partial<Record<K, string>>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch) as [K, string | undefined][]) {
            if (value) p.set(key, value);
            else p.delete(key);
          }
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [values, update];
}

const FILTER_KEYS = ['fakultet', 'guruh', 'kafedra', 'jadval'] as const;

export default function LessonsPage() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('manageLessons', role);
  const toast = useToast();
  const { date, today, isToday } = useViewDate();

  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const { fakultet: facultyId, guruh: group, kafedra: departmentId, jadval: scheduleFilter } = filters;
  const [teacherQuery, setTeacherQuery] = useState('');
  const teacherSearch = useDebouncedValue(teacherQuery.trim(), 200);
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Lesson | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [scheduling, setScheduling] = useState<ScheduleTarget | null>(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<DateRangeValue>(() => rangeForPreset('last30', date));

  const { faculties } = useFaculties();
  const { groups } = useGroups();
  const kafedras = useLoader(`k:${date}`, (signal) => getKafedras(date, { signal }));

  // Tablar: sonlar API'dan (status filtrisiz). Standart — "Barchasi".
  const baseQuery = { date, facultyId: facultyId || undefined, group: group || undefined, departmentId: departmentId || undefined };
  const baseKey = `${date}|${facultyId}|${group}|${departmentId}`;
  const [countsSnapshot, setCountsSnapshot] = useState<{ key: string; counts: Record<LessonState, number> } | null>(null);
  const counts = countsSnapshot?.key === baseKey ? countsSnapshot.counts : null;
  const tabs: TabItem<TabId>[] = [
    { id: 'barchasi', label: 'Barchasi', icon: ListChecks, count: counts ? counts.ongoing + counts.upcoming + counts.finished : null },
    { id: 'ongoing', label: 'Davom etmoqda', icon: CirclePlay, count: counts?.ongoing ?? null },
    { id: 'upcoming', label: 'Kutilmoqda', icon: Clock, count: counts?.upcoming ?? null },
    { id: 'finished', label: "O'tgan", icon: History, count: counts?.finished ?? null },
    { id: 'tahlil', label: 'Tahlil', icon: ChartNoAxesColumn },
  ];
  const [tab] = useUrlTab(tabs, { defaultTab: 'barchasi' });
  const status = tab === 'barchasi' || tab === 'tahlil' ? undefined : tab;
  useEffect(() => setPage(1), [tab, date]);

  const listKey = tab === 'tahlil' ? null : `${baseKey}|${status ?? ''}|${page}`;
  const lessons = useLoader(
    listKey,
    async (signal) => {
      const res = await getLessons({ ...baseQuery, status, page, pageSize: PAGE_SIZE }, { signal });
      setCountsSnapshot({ key: baseKey, counts: res.counts });
      return res;
    },
    { refreshMs: isToday ? REFRESH_MS : undefined },
  );

  // Filtr o'zgarsa — birinchi sahifaga.
  function applyFilters(patch: Partial<Record<(typeof FILTER_KEYS)[number], string>>) {
    setPage(1);
    setFilters(patch);
  }

  const rows = useMemo(() => {
    let items = lessons.data?.items ?? [];
    if (teacherSearch) items = items.filter((l) => matchesName(l.teacher, teacherSearch));
    if (scheduleFilter === 'tracked') items = items.filter(isLessonTracked);
    else if (scheduleFilter === 'incomplete') items = items.filter((l) => !isLessonTracked(l));
    return items;
  }, [lessons.data, teacherSearch, scheduleFilter]);

  const punctuality = useMemo(() => summarizePunctuality(rows), [rows]);
  const attendance = useMemo(() => {
    const finalized = rows.filter((l) => l.finalized && l.expected > 0);
    const expected = finalized.reduce((s, l) => s + l.expected, 0);
    const present = finalized.reduce((s, l) => s + l.present, 0);
    return { rate: expected ? (present / expected) * 100 : null, present, expected };
  }, [rows]);
  const attention = useMemo(() => {
    const values = rows.map((l) => l.attentionScore).filter((v): v is number => v !== null);
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }, [rows]);

  const selectedFaculty = faculties.find((f) => f.id === facultyId);
  const groupOptions = useMemo(
    () => groups.filter((g) => !selectedFaculty || g.faculty === selectedFaculty.name).map((g) => ({ value: g.name, label: g.name })),
    [groups, selectedFaculty],
  );
  const facultyOptions = faculties.map((f) => ({ value: f.id, label: f.name }));
  const kafedraOptions = (kafedras.data ?? []).map((k) => ({ value: k.id, label: k.name }));
  const activeFilters = [facultyId, group, departmentId, scheduleFilter, teacherQuery.trim()].filter(Boolean).length;

  function resetFilters() {
    applyFilters({ fakultet: '', guruh: '', kafedra: '', jadval: '' });
    setTeacherQuery('');
  }

  function reloadAll() {
    lessons.reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    await deleteLessonSession(deleting.id);
    toast.success("Dars monitoring yozuvi o'chirildi");
    setDeleting(null);
    setSelected(null);
    reloadAll();
  }

  const dayLabel = relativeDayLabel(date, today) ?? formatUzDate(date, { weekday: true });
  const totalPages = lessons.data?.totalPages ?? 1;

  const facultySelect = (
    <Select
      value={facultyId}
      onChange={(v) => applyFilters({ fakultet: v, guruh: '' })}
      options={facultyOptions}
      placeholder="Barcha fakultetlar"
      ariaLabel="Fakultet"
      highlightActive
    />
  );
  const groupSelect = (
    <Select value={group} onChange={(v) => applyFilters({ guruh: v })} options={groupOptions} placeholder="Barcha guruhlar" ariaLabel="Guruh" highlightActive />
  );

  const toolbar =
    tab === 'tahlil' ? (
      <Toolbar activeCount={[facultyId, group].filter(Boolean).length} onReset={() => applyFilters({ fakultet: '', guruh: '' })}>
        <DateRangePicker value={analyticsRange} onChange={setAnalyticsRange} presets={ANALYTICS_PRESETS} size="sm" />
        {facultySelect}
        {groupSelect}
      </Toolbar>
    ) : (
      <Toolbar activeCount={activeFilters} onReset={resetFilters}>
        <SearchInput value={teacherQuery} onChange={setTeacherQuery} placeholder="O'qituvchi…" ariaLabel="O'qituvchi bo'yicha qidirish" />
        {facultySelect}
        {groupSelect}
        <Select value={departmentId} onChange={(v) => applyFilters({ kafedra: v })} options={kafedraOptions} placeholder="Barcha kafedralar" ariaLabel="Kafedra" highlightActive />
        <Select value={scheduleFilter} onChange={(v) => applyFilters({ jadval: v })} options={SCHEDULE_OPTIONS} placeholder="Jadval holati" ariaLabel="Jadval holati" highlightActive />
      </Toolbar>
    );

  return (
    <Page
      title="Darslar"
      subtitle={`Dars jadvali, o'qituvchi punktualligi, davomat va dars sifati · ${dayLabel}`}
      breadcrumbs={[{ label: 'Darslar' }]}
      tabs={tabs}
      defaultTab="barchasi"
      actions={
        canEdit && (
          <>
            <Button icon={FileUp} onClick={() => setImportOpen(true)}>
              Jadvalni import
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              Yangi dars
            </Button>
          </>
        )
      }
      toolbar={toolbar}
    >
      {tab === 'tahlil' ? (
        <LessonAnalytics from={analyticsRange.from} to={analyticsRange.to} faculty={selectedFaculty?.name} group={group || undefined} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Darslar" value={rows.length} loading={lessons.loading} hint={counts ? `${counts.ongoing} davom etmoqda · ${counts.upcoming} kutilmoqda` : undefined} />
            <StatTile
              label="O'qituvchi o'z vaqtida"
              tone={toneForRate(punctuality.rate)}
              value={formatPercent(punctuality.rate)}
              progress={punctuality.rate}
              loading={lessons.loading}
              hint={`${punctuality.late} kechikdi · ${punctuality.missed} kelmadi`}
            />
            <StatTile
              label="Talabalar davomati"
              tone={toneForRate(attendance.rate)}
              value={formatPercent(attendance.rate)}
              progress={attendance.rate}
              loading={lessons.loading}
              hint={attendance.expected ? `${attendance.present} / ${attendance.expected} yakunlangan darslarda` : 'Yakunlangan dars yo‘q'}
            />
            <StatTile label="O'rtacha diqqat" tone={toneForRate(attention)} value={formatPercent(attention)} loading={lessons.loading} hint="AI o'lchagan darslar bo'yicha" />
          </div>

          <LessonsTable
            rows={rows}
            loading={lessons.loading}
            error={lessons.data ? null : lessons.error}
            onRetry={lessons.reload}
            onRowClick={setSelected}
            selectedId={selected?.id ?? null}
            showState={tab === 'barchasi'}
            emptyTitle={activeFilters ? 'Filtrga mos dars topilmadi' : 'Bu kunda darslar yo‘q'}
            emptyDescription={
              activeFilters ? undefined : canEdit ? "Dars jadvalini CSV/Excel'dan import qiling yoki yangi dars qo'shing." : undefined
            }
            footer={
              totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
                  <span>
                    {page}-sahifa / {totalPages} · jami {lessons.data?.total ?? 0} dars
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Oldingi
                    </Button>
                    <Button size="sm" iconRight={ChevronRight} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Keyingi
                    </Button>
                  </span>
                </div>
              ) : undefined
            }
          />
        </>
      )}

      <LessonDrawer
        lesson={selected}
        onClose={() => setSelected(null)}
        onEditSchedule={
          canEdit
            ? (l) =>
                setScheduling({ id: l.id, date: l.date, group: l.groupName, subject: l.subject, teacherId: l.teacherId, room: l.room, startsAt: l.startsAt })
            : undefined
        }
        onDelete={canEdit ? setDeleting : undefined}
      />
      <LessonImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reloadAll} />
      <ScheduleLessonModal
        open={addOpen}
        defaultDate={date}
        onClose={() => setAddOpen(false)}
        onSave={() => {
          toast.success("Dars rejalashtirildi");
          reloadAll();
        }}
      />
      <ScheduleLessonModal
        open={scheduling !== null}
        target={scheduling}
        onClose={() => setScheduling(null)}
        onSave={() => {
          toast.success('Dars jadvali saqlandi');
          setSelected(null);
          reloadAll();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Dars monitoring yozuvini o'chirish"
        message={deleting ? `${deleting.groupName} / ${deleting.subject} (${deleting.date}) yozuvini o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.` : ''}
        confirmLabel="O'chirish"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Page>
  );
}
