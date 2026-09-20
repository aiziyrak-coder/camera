import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Footprints, GraduationCap, LogIn, MapPin, RefreshCw, ScanFace, UserX, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  DateRangePicker,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  ProgressRing,
  Skeleton,
  SkeletonTiles,
  StatTile,
  StatusBadge,
  Tabs,
  Toolbar,
  cn,
  focusRing,
  formatNumber,
  formatPercent,
  formatUzDate,
  isIsoDate,
  rangeForPreset,
  detectPreset,
  useUrlTab,
  type DataTableColumn,
  type DateRangeValue,
  type TabItem,
} from '../../ui';
import { api } from '../../lib/apiClient';
import { getAttendancePolicy } from '../../lib/attendancePolicyApi';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { getPerson, situationPaths, type Lesson, type PersonLesson, type PersonProfile } from '../../lib/situationApi';
import { DEFAULT_WORKING_WEEKDAYS, buildMonthGrid, monthOf, type CalendarCell } from '../../lib/attendanceCalendar';
import {
  lateAfterMinutes,
  LESSON_ATTENDANCE_META,
  arrivalSeries,
  biometricsMeta,
  daysBetween,
  lessonTime,
  monthsInRange,
  personKpis,
  previousRange,
  statusMeta,
  visitsByDate,
  weekdayPattern,
} from '../../lib/studentAttendance';
import { formatMinutes } from '../../lib/uzDate';
import { useViewDate } from '../../lib/viewDate';
import type { AttendanceDay, AttendanceSummary } from '../../types';
import DayDrawer from '../../components/attendance/DayDrawer';
import MonthTrend from '../../components/attendance/MonthTrend';
import { CalendarLegend, MonthCalendar } from '../../components/attendance/MonthCalendar';
import { LessonDrawer, TeacherPunctuality } from '../../components/students/LessonViews';
import { PersonPhoto } from '../../components/students/PersonPhoto';
import { ArrivalTimeChart } from '../../components/students/TrendCharts';
import { useAsyncData } from '../../components/students/useAsyncData';
import { GroupEnrollDrawer, type EnrollDrawerTarget } from '../../components/students/GroupEnrollDrawer';
import { EnrollCta, StaffKpis, WeekdayPatternCard } from '../../components/attendance/PersonInsights';

type TabId = 'davomat' | 'darslar' | 'harakatlar';
const PRESETS = ['week', 'month', 'last30', 'lastMonth'] as const;
const MAX_CALENDAR_MONTHS = 6;
const MONTH_TTL_MS = 60_000;

// Oylik yozuvlar keshi (odam+oy) — sahifadan chiqib qaytganda darhol chiziladi.
const monthCache = new Map<string, { at: number; days: AttendanceDay[] }>();
const cacheKey = (personId: string, month: string) => `${personId}:${month}`;

/** /api/attendance/{id}?month= — ko'rinayotgan oylar (erta ketish, yozuv borligi). */
function useMonthRecords(personId: string, months: string[]) {
  const [state, setState] = useState<Record<string, AttendanceDay[]>>({});
  const [version, setVersion] = useState(0);
  const monthsKey = months.join(',');

  useEffect(() => {
    const list = monthsKey ? monthsKey.split(',') : [];
    const fresh: Record<string, AttendanceDay[]> = {};
    const missing: string[] = [];
    for (const m of list) {
      const hit = monthCache.get(cacheKey(personId, m));
      if (hit) fresh[m] = hit.days;
      if (!hit || Date.now() - hit.at > MONTH_TTL_MS) missing.push(m);
    }
    setState(fresh);
    if (!missing.length) return;
    const controller = new AbortController();
    Promise.all(
      missing.map((m) =>
        api
          .get<AttendanceDay[]>(`/api/attendance/${encodeURIComponent(personId)}?month=${m}`, undefined, { signal: controller.signal })
          .then((days) => {
            monthCache.set(cacheKey(personId, m), { at: Date.now(), days });
            return [m, days] as const;
          })
          .catch(() => null),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setState((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r[0]] = r[1];
        return next;
      });
    });
    return () => controller.abort();
  }, [personId, monthsKey, version]);

  const invalidate = useCallback(
    (month?: string) => {
      if (month) monthCache.delete(cacheKey(personId, month));
      else for (const key of [...monthCache.keys()]) if (key.startsWith(`${personId}:`)) monthCache.delete(key);
      setVersion((v) => v + 1);
    },
    [personId],
  );
  const apply = useCallback(
    (date: string, update: (days: AttendanceDay[]) => AttendanceDay[]) => {
      const m = monthOf(date);
      const base = monthCache.get(cacheKey(personId, m))?.days ?? [];
      const days = update(base).sort((a, b) => a.date.localeCompare(b.date));
      monthCache.set(cacheKey(personId, m), { at: Date.now(), days });
      setState((prev) => ({ ...prev, [m]: days }));
    },
    [personId],
  );
  return { records: state, invalidate, apply };
}

function readRange(params: URLSearchParams, today: string): DateRangeValue {
  const from = params.get('dan');
  const to = params.get('gacha');
  if (isIsoDate(from) && isIsoDate(to) && from <= to) {
    const clampedTo = to > today ? today : to;
    return { from, to: clampedTo, preset: detectPreset({ from, to: clampedTo }, PRESETS, today) };
  }
  return rangeForPreset('month', today);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

const linkClass = cn('rounded text-primary hover:underline', focusRing);

/** Shaxs profili (talaba yoki o'qituvchi/xodim): surat, bugungi holat,
 *  davr bo'yicha kalendar, darslar va kameralardagi harakatlar. */
export default function PersonPage() {
  const { personId = '' } = useParams();
  const { today, withDate } = useViewDate();
  const { role } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('manageAttendance', role);
  const [params, setParams] = useSearchParams();
  const range = readRange(params, today);

  function setRange(next: DateRangeValue) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const def = rangeForPreset('month', today);
        if (next.from === def.from && next.to === def.to) {
          p.delete('dan');
          p.delete('gacha');
        } else if (next.from && next.to && next.from <= next.to) {
          p.set('dan', next.from);
          p.set('gacha', next.to);
        }
        return p;
      },
      { replace: true },
    );
  }

  const profile = useAsyncData<PersonProfile>(
    `${personId}|${range.from}|${range.to}`,
    (signal) => getPerson(personId, { from: range.from, to: range.to }, { signal }),
    { identity: personId },
  );
  const summary = useAsyncData<AttendanceSummary>(
    `sum|${personId}`,
    (signal) => api.get<AttendanceSummary>(`/api/attendance/${encodeURIComponent(personId)}/summary?months=6`, undefined, { signal }),
    { identity: personId },
  );
  const data = profile.data;
  const person = data?.person;
  const isStaff = person?.type === 'xodim';
  // Kechikish chegarasi — Sozlamalar → Ish vaqti (talaba/xodim alohida),
  // server kech_keldi ni shu qoida bilan yozadi. Ilgari 09:00 qotirilgan edi.
  const policy = useAsyncData('attendance-policy', () => getAttendancePolicy(null));
  const lateCutoff = lateAfterMinutes(
    person?.type === 'talaba' ? policy.data?.studentLateAfter : policy.data?.staffLateAfter,
  );
  const lateLabel = `${String(Math.floor(lateCutoff / 60)).padStart(2, '0')}:${String(lateCutoff % 60).padStart(2, '0')}`;
  // Xodim: oldingi, xuddi shu uzunlikdagi davr — KPI o'zgarishlari uchun.
  const prevRange = previousRange(range.from, range.to);
  const previous = useAsyncData<PersonProfile>(
    isStaff ? `prev|${personId}|${prevRange.from}|${prevRange.to}` : null,
    (signal) => getPerson(personId, prevRange, { signal }),
    { identity: personId },
  );
  const kpis = useMemo(() => (data ? personKpis(data.calendar) : null), [data]);
  const prevKpis = useMemo(() => {
    if (!previous.data) return null;
    const k = personKpis(previous.data.calendar);
    // Oldingi davrda yozuv yo'q — taqqoslash ma'nosiz ("+14" chalg'itadi).
    return k.presentDays + k.absentDays > 0 ? k : null;
  }, [previous.data]);
  const weekdays = useMemo(() => (data ? weekdayPattern(data.calendar) : []), [data]);
  const [enrollTarget, setEnrollTarget] = useState<EnrollDrawerTarget | null>(null);
  const workingWeekdays = summary.data?.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS;

  const currentMonth = monthOf(today);
  const calendarMonths = useMemo(() => monthsInRange(range.from, range.to, MAX_CALENDAR_MONTHS).reverse(), [range.from, range.to]);
  const neededMonths = useMemo(() => [...new Set([currentMonth, ...calendarMonths])], [currentMonth, calendarMonths]);
  const months = useMonthRecords(personId, neededMonths);

  const cellsByMonth = useMemo(() => {
    const out: Record<string, CalendarCell[] | null> = {};
    for (const m of neededMonths) out[m] = months.records[m] ? buildMonthGrid(months.records[m], m, today, workingWeekdays) : null;
    return out;
  }, [neededMonths, months.records, today, workingWeekdays]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  useEffect(() => {
    setSelectedDate(null);
    setLesson(null);
  }, [personId]);

  // Jonli: shu odam kamerada tanilsa — bugungi holat va kalendar yangilanadi.
  const reloadProfile = profile.reload;
  const reloadSummary = summary.reload;
  const invalidate = months.invalidate;
  useLiveAttendance(
    useCallback(
      (m: LiveAttendanceMessage) => {
        if (m.personId !== personId) return;
        invalidate(monthOf(m.date));
        reloadProfile();
        reloadSummary();
      },
      [personId, invalidate, reloadProfile, reloadSummary],
    ),
  );

  const todayCell = cellsByMonth[currentMonth]?.find((c) => c.date === today) ?? null;
  const todayStatus =
    todayCell && todayCell.isRecord ? todayCell.status : person?.biometricsStatus === 'tasdiqlangan' ? 'kutilmoqda' : 'nomalum';

  const allCells = useMemo(() => Object.values(cellsByMonth).flatMap((c) => c ?? []).sort((a, b) => a.date.localeCompare(b.date)), [cellsByMonth]);
  const selectedIndex = selectedDate ? allCells.findIndex((c) => c.date === selectedDate) : -1;
  const selectedCell: CalendarCell | null =
    selectedIndex >= 0
      ? allCells[selectedIndex]
      : selectedDate
        ? {
            date: selectedDate,
            day: Number(selectedDate.slice(8)),
            status: 'malumot_yoq',
            checkIn: null,
            checkOut: null,
            earlyLeave: false,
            isRecord: false,
            isToday: selectedDate === today,
            isWorkingDay: true,
            presenceMinutes: null,
          }
        : null;
  const prevCell = selectedIndex > 0 ? allCells[selectedIndex - 1] : null;
  const nextCell = selectedIndex >= 0 && selectedIndex < allCells.length - 1 && allCells[selectedIndex + 1].status !== 'kelajak' ? allCells[selectedIndex + 1] : null;

  const tabs: TabItem<TabId>[] = [
    { id: 'davomat', label: 'Davomat', icon: CalendarDays },
    // Dars jadvali yo'q shaxsda tab ham yo'q — doimo bo'sh jadval o'rniga.
    ...(data && data.lessons.length > 0
      ? [{ id: 'darslar' as const, label: 'Darslar', icon: GraduationCap, count: data.lessons.length }]
      : []),
    { id: 'harakatlar', label: "Qayerda ko'ringan", icon: Footprints, count: data?.recentVisits.length ?? null },
  ];
  const [tab, setTab] = useUrlTab(tabs, { defaultTab: 'davomat' });

  const isStudent = person?.type === 'talaba';
  const crumbs = person
    ? isStudent
      ? [
          { label: 'Talabalar', to: withDate(situationPaths.faculties) },
          ...(person.group ? [{ label: person.group, to: withDate(situationPaths.group(person.group)) }] : []),
          { label: person.fullName },
        ]
      : [
          { label: "O'qituvchilar", to: withDate('/oqituvchilar') },
          ...(person.departmentId && person.department ? [{ label: person.department, to: withDate(situationPaths.kafedra(person.departmentId)) }] : []),
          { label: person.fullName },
        ]
    : [{ label: 'Shaxs' }];

  function afterEdit(date: string, update: (days: AttendanceDay[]) => AttendanceDay[]) {
    months.apply(date, update);
    profile.reload();
    summary.reload();
  }

  return (
    <Page
      title={person?.fullName ?? 'Shaxs profili'}
      subtitle={
        person
          ? `${isStudent ? 'Talaba' : person.unit || 'Xodim'} · Bu odam qaysi kunlari kelgani, soat nechada kelgani va qaysi kameralarda ko'ringani${
              policy.data ? `. Soat ${lateLabel} dan keyin kelgan kun "kech keldi" hisoblanadi` : ''
            }`
          : 'Bir odamning davomati, darslari va kameralarda ko\'ringan joylari'
      }
      breadcrumbs={crumbs}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={() => { profile.reload(); summary.reload(); previous.reload(); months.invalidate(); }} loading={profile.refreshing} />}
    >
      {profile.loading ? (
        <>
          <Skeleton className="h-48 rounded-card" />
          <SkeletonTiles count={5} className="xl:grid-cols-5" />
        </>
      ) : profile.error && !data ? (
        <Card padding="none">
          <ErrorState variant="block" title={/topilmadi/i.test(profile.error) ? 'Shaxs topilmadi' : undefined} message={profile.error} onRetry={profile.reload} />
          <div className="flex justify-center pb-8">
            <ButtonLink to={withDate(situationPaths.faculties)} icon={ArrowLeft} variant="ghost">
              Talabalarga qaytish
            </ButtonLink>
          </div>
        </Card>
      ) : data && person ? (
        <>
          {/* Sarlavha kartasi */}
          <Card className="flex flex-col gap-5 md:flex-row md:items-center">
            <PersonPhoto name={person.fullName} src={person.photoUrl} tone={statusMeta(todayStatus === 'nomalum' ? 'malumot_yoq' : todayStatus).tone} className="h-40 w-32 self-start md:self-center" textClassName="text-4xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{isStudent ? 'Talaba' : 'Xodim'}</Badge>
                {!person.active && <Badge tone="danger">Faol emas</Badge>}
                <Badge tone={biometricsMeta(person.biometricsStatus).tone} icon={ScanFace}>
                  {biometricsMeta(person.biometricsStatus).label}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                {isStudent ? (
                  <>
                    <Fact label="Fakultet">
                      <Link to={withDate(situationPaths.faculty(person.facultyId))} className={linkClass}>
                        {person.faculty ?? 'Fakultetsiz'}
                      </Link>
                    </Fact>
                    <Fact label="Guruh">
                      {person.group ? (
                        <Link to={withDate(situationPaths.group(person.group))} className={linkClass}>
                          {person.group}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Fact>
                    <Fact label="Kurs">{person.course ? `${person.course}-kurs` : '—'}</Fact>
                  </>
                ) : (
                  <>
                    <Fact label="Kafedra">
                      {person.departmentId ? (
                        <Link to={withDate(situationPaths.kafedra(person.departmentId))} className={linkClass}>
                          {person.department}
                        </Link>
                      ) : (
                        'Biriktirilmagan'
                      )}
                    </Fact>
                    <Fact label="Lavozim / bo'lim">{person.unit || '—'}</Fact>
                    <Fact label="Fakultet">{person.faculty ?? '—'}</Fact>
                  </>
                )}
                <Fact label="Bugun">
                  <StatusBadge status={todayStatus} time={todayCell?.checkIn ?? null} />
                </Fact>
              </dl>
            </div>
            <div className="flex items-center gap-4 border-t border-border pt-4 md:flex-col md:gap-1 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <ProgressRing value={data.totals.rate} size={92} sublabel="davomat" />
              <p className="text-xs text-muted md:text-center">{formatUzDate(data.dateFrom, { year: false })} – {formatUzDate(data.dateTo, { year: false })}</p>
            </div>
          </Card>

          {person.biometricsStatus !== 'tasdiqlangan' && (
            <EnrollCta
              student={isStudent}
              group={person.group}
              pending={person.biometricsStatus === 'kutilmoqda'}
              onOpenGroup={person.group ? () => setEnrollTarget({ name: person.group!, faculty: person.faculty }) : undefined}
              registryLink={`/reestr?search=${encodeURIComponent(person.fullName)}`}
            />
          )}

          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <Toolbar>
            <DateRangePicker value={range} onChange={setRange} presets={PRESETS} />
          </Toolbar>
          {profile.error && <ErrorState title="Yangilab bo'lmadi" message={profile.error} onRetry={profile.reload} />}

          {tab === 'davomat' && (
            <>
              {isStaff && kpis ? (
                <>
                  <StaffKpis current={kpis} previous={prevKpis} days={daysBetween(range.from, range.to) + 1} lateCutoff={lateCutoff} />
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
                    <Card>
                      <CardHeader
                        title="Har kuni soat nechada kelgan"
                        subtitle={`Har bir nuqta — bir kun. To'q sariq nuqta — soat ${lateLabel} dan keyin kelgan, ya'ni kech kelgan kun`}
                        icon={LogIn}
                      />
                      {data.calendar.some((d) => d.checkIn) ? (
                        <ArrivalTimeChart points={arrivalSeries(data.calendar)} threshold={lateCutoff} average={kpis.avgArrivalMinutes} height={240} />
                      ) : (
                        <EmptyState
                          compact
                          bordered={false}
                          title="Kelish vaqti qayd etilmagan"
                          description="Bu davrda kameralar bu xodimni birorta kun ham tanimagan."
                        />
                      )}
                    </Card>
                    <WeekdayPatternCard rows={weekdays} lateCutoff={lateCutoff} />
                  </div>
                </>
              ) : (
              // Foiz = kelgan / (kelgan + kelmagan); izoh ham AYNAN shu ikki
              // sondan yoziladi. Ilgari u butun davrdagi kunlar sonini (dam
              // olish kunlari bilan) "ish kuni" deb ko'rsatardi.
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <StatTile
                  label="Kelgan kunlari ulushi"
                  value={formatPercent(data.totals.rate, 1)}
                  progress={data.totals.rate}
                  hint={`Yozuv bor ${data.totals.present + data.totals.absent} kundan ${data.totals.present} tasida kelgan`}
                />
                <StatTile label="O'z vaqtida kelgan" value={`${data.totals.present - data.totals.late} kun`} icon={CheckCircle2} tone="success" hint={`Soat ${lateLabel} gacha`} />
                <StatTile label="Kech kelgan" value={`${data.totals.late} kun`} icon={Clock} tone="warning" hint={`Soat ${lateLabel} dan keyin`} />
                <StatTile label="Kelmagan" value={`${data.totals.absent} kun`} icon={UserX} tone="danger" hint="Hech bir kamerada ko'rinmagan" />
                <StatTile
                  label="Odatda kelish vaqti"
                  value={data.totals.avgArrival ?? '—'}
                  icon={LogIn}
                  tone="info"
                  hint={data.totals.noData ? `${data.totals.noData} kunda yozuv yo'q` : "Kelgan kunlaridagi o'rtacha vaqt"}
                />
              </div>
              )}
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                  <CardHeader
                    title="Kunlar kalendari"
                    subtitle="Har bir katak — bir kun. Kunni bosing: o'sha kuni qaysi kameralarda ko'ringani, darslari va kerak bo'lsa qo'lda tuzatish"
                    icon={CalendarDays}
                  />
                  <div className={cn('grid gap-6', calendarMonths.length > 1 && '2xl:grid-cols-2')}>
                    {calendarMonths.map((m) => (
                      <MonthCalendar
                        key={m}
                        month={m}
                        cells={cellsByMonth[m] ?? null}
                        workingWeekdays={workingWeekdays}
                        selectedDate={selectedDate}
                        onOpen={setSelectedDate}
                        range={range}
                      />
                    ))}
                  </div>
                  <CalendarLegend className="mt-4 border-t border-border pt-3" />
                </Card>
                <div className="flex flex-col gap-5">
                  {summary.data ? (
                    <MonthTrend
                      months={summary.data.months}
                      activeMonth={calendarMonths.length === 1 ? calendarMonths[0] : null}
                      onPick={(m) => {
                        const [y, mo] = m.split('-').map(Number);
                        const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
                        const to = `${m}-${String(last).padStart(2, '0')}`;
                        setRange({ preset: 'custom', from: `${m}-01`, to: to > today ? today : to });
                      }}
                    />
                  ) : summary.error ? (
                    <ErrorState message={summary.error} onRetry={summary.reload} />
                  ) : (
                    <Skeleton className="h-72 rounded-card" />
                  )}
                  {!isStaff && (
                    <Card>
                      <CardHeader
                        title="Har kuni soat nechada kelgan"
                        subtitle={`Har bir nuqta — bir kun. To'q sariq nuqta — soat ${lateLabel} dan keyin kelgan kun`}
                        icon={LogIn}
                      />
                      {data.calendar.some((d) => d.checkIn) ? (
                        <ArrivalTimeChart points={arrivalSeries(data.calendar)} threshold={lateCutoff} />
                      ) : (
                        <EmptyState
                          compact
                          bordered={false}
                          title="Kelish vaqti qayd etilmagan"
                          description="Bu davrda kameralar bu odamni birorta kun ham tanimagan."
                        />
                      )}
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'darslar' && <LessonsTab lessons={data.lessons} isStudent={isStudent} onOpen={setLesson} withDate={withDate} />}

          {tab === 'harakatlar' && (
            data.recentVisits.length === 0 ? (
              <EmptyState
                icon={Footprints}
                title="Hech bir kamerada ko'rinmagan"
                description={
                  person?.biometricsStatus === 'tasdiqlangan'
                    ? 'Tanlangan davrda bu odam birorta kamerada tanilmagan.'
                    : "Bu odam yuzini ro'yxatdan o'tkazmagan — shuning uchun kameralar uni tanay olmaydi va bu ro'yxat bo'sh turadi."
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] text-muted">
                  Bu odam qaysi kunlari, soat nechada va qaysi kamerada ko'ringani. Oxirgi {data.recentVisits.length} ta yozuv, yangisi
                  birinchi.
                </p>
                {visitsByDate(data.recentVisits).map((day) => (
                  <Card key={day.date} padding="sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                      <h3 className="text-sm font-semibold text-fg">
                        {formatUzDate(day.date, { weekday: true })}
                        <span className="ml-2 font-normal text-muted">
                          {day.visits.length} marta ko'ringan · binoda {formatMinutes(day.minutes)}
                        </span>
                      </h3>
                      <Button size="sm" variant="ghost" icon={CalendarDays} onClick={() => setSelectedDate(day.date)}>
                        Kunni ochish
                      </Button>
                    </div>
                    <ol className="flex flex-col divide-y divide-border">
                      {day.visits.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2 text-[13px]">
                          <span className="w-24 font-semibold tabular-nums text-fg">
                            {v.firstSeen === v.lastSeen ? v.firstSeen : `${v.firstSeen}–${v.lastSeen}`}
                          </span>
                          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-fg">
                            <MapPin size={14} className="shrink-0 text-muted" aria-hidden="true" />
                            <span className="truncate">{[v.camera, v.zone, v.building].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="text-muted tabular-nums">
                            {formatMinutes(v.durationMinutes)} · {formatNumber(v.sightings)} marta
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                ))}
              </div>
            )
          )}
        </>
      ) : null}

      <DayDrawer
        open={selectedCell !== null}
        personId={personId}
        personName={person?.fullName ?? ''}
        cell={selectedCell}
        canEdit={canEdit}
        onClose={() => setSelectedDate(null)}
        onPrev={prevCell ? () => setSelectedDate(prevCell.date) : undefined}
        onNext={nextCell ? () => setSelectedDate(nextCell.date) : undefined}
        onSaved={(day) => afterEdit(day.date, (days) => [...days.filter((d) => d.date !== day.date), day])}
        onDeleted={(date) => afterEdit(date, (days) => days.filter((d) => d.date !== date))}
      />
      <LessonDrawer lesson={lesson} withDate={withDate} showGroupLink onClose={() => setLesson(null)} />
      <GroupEnrollDrawer target={enrollTarget} onClose={() => setEnrollTarget(null)} withDate={withDate} />
    </Page>
  );
}

function LessonsTab({
  lessons,
  isStudent,
  onOpen,
  withDate,
}: {
  lessons: PersonLesson[];
  isStudent: boolean;
  onOpen: (lesson: Lesson) => void;
  withDate: (path: string) => string;
}) {
  const columns: DataTableColumn<PersonLesson>[] = [
    { key: 'date', header: 'Sana', cell: (l) => formatUzDate(l.date, { weekday: false, year: false }), sortValue: (l) => `${l.date} ${l.startsAt ?? ''}`, width: '8rem' },
    { key: 'time', header: 'Vaqt', cell: (l) => <span className="tabular-nums">{lessonTime(l)}</span>, hideOnMobile: true },
    { key: 'subject', header: 'Fan', cell: (l) => <span className="font-medium text-fg">{l.subject}</span>, sortValue: (l) => l.subject },
    isStudent
      ? { key: 'teacher', header: "O'qituvchi", cell: (l) => l.teacher || '—', sortValue: (l) => l.teacher, hideOnMobile: true }
      : {
          key: 'group',
          header: 'Guruh',
          cell: (l) => (
            <Link to={withDate(situationPaths.group(l.groupName))} onClick={(e) => e.stopPropagation()} className={linkClass}>
              {l.groupName}
            </Link>
          ),
          sortValue: (l) => l.groupName,
        },
    { key: 'room', header: 'Xona', cell: (l) => l.room ?? '—', hideOnMobile: true },
    isStudent
      ? {
          key: 'own',
          header: 'Darsga kirganmi',
          cell: (l) => {
            const meta = l.attendanceStatus ? LESSON_ATTENDANCE_META[l.attendanceStatus] : null;
            return meta ? (
              <Badge tone={meta.tone} dot>
                {meta.label}
                {l.firstSeen && <span className="ml-1 tabular-nums opacity-80">{l.firstSeen}</span>}
              </Badge>
            ) : (
              <Badge>{l.state === 'upcoming' ? 'Boshlanmagan' : 'Hisoblanmagan'}</Badge>
            );
          },
          sortValue: (l) => l.attendanceStatus,
        }
      : { key: 'punct', header: 'Darsga kirgani', cell: (l) => <TeacherPunctuality lesson={l} />, sortValue: (l) => l.teacherStatus },
    {
      key: 'att',
      header: 'Darsdagi talabalar',
      align: 'right',
      cell: (l) => (
        <span className="tabular-nums">
          {l.finalized ? l.present : l.seen}
          <span className="text-muted"> / {l.expected}</span>
        </span>
      ),
      hideOnMobile: isStudent,
    },
  ];
  return (
    <DataTable
      ariaLabel="Darslar"
      columns={columns}
      rows={lessons}
      rowKey={(l) => l.id}
      onRowClick={onOpen}
      rowTone={(l) => {
        if (isStudent) return l.attendanceStatus ? LESSON_ATTENDANCE_META[l.attendanceStatus].tone : null;
        return l.teacherStatus === 'kelmadi' ? 'danger' : l.teacherStatus === 'kechikdi' ? 'warning' : l.teacherStatus === 'oz_vaqtida' ? 'success' : null;
      }}
      emptyTitle="Bu davrda dars yo'q"
      emptyDescription={
        isStudent
          ? "Guruhining dars jadvalida bu davrga yozuv topilmadi — dars jadvali hali yuklanmagan bo'lishi mumkin."
          : "Bu o'qituvchiga biriktirilgan dars topilmadi — dars jadvali hali yuklanmagan bo'lishi mumkin."
      }
    />
  );
}
