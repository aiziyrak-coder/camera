import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  Bell,
  BookOpen,
  Camera,
  Clock,
  GraduationCap,
  History,
  Hourglass,
  Lock,
  MonitorUp,
  Presentation,
  Repeat,
  ScanFace,
  RefreshCw,
  UserX,
  Users,
} from 'lucide-react';
import { api, buildQuery, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions, type PermissionKey } from '../../lib/permissions';
import { useLiveAttendance, useLiveEvents, type LiveAttendanceMessage } from '../../lib/realtime';
import {
  getAnalyticsChronic,
  getAnalyticsSummary,
  getEnrollment,
  getGroups,
  getKafedras,
  getLessons,
  getOverview,
  situationPaths,
  type LastArrival,
} from '../../lib/situationApi';
import { useViewDate } from '../../lib/viewDate';
import type { AIEvent } from '../../types';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  StatusDot,
  buttonClasses,
  formatNumber,
  formatPercent,
  formatUzDate,
  relativeDayLabel,
  toneForRate,
  useShell,
  type Tone,
} from '../../ui';
import { ArrivalsChart } from '../../components/situation/ArrivalsChart';
import { AttentionPanel } from '../../components/situation/AttentionPanel';
import { FacultyAttendance } from '../../components/situation/FacultyAttendance';
import { EnrollmentCampaign } from '../../components/situation/EnrollmentCampaign';
import { KpiTile, type KpiDelta } from '../../components/situation/KpiTile';
import { LessonsTimeline } from '../../components/situation/LessonsTimeline';
import { LiveArrivals } from '../../components/situation/LiveArrivals';
import { UnitsRanking } from '../../components/situation/UnitsRanking';
import {
  arrivalFromMessage,
  attendanceSegments,
  dailySeries,
  hourOf,
  lowestGroups,
  mergeArrivals,
  share,
  shiftIso,
  staffComparison,
  teacherIssues,
  teacherOnTimeRate,
} from '../../components/situation/situationUtils';
import { useLiveResource, useRefreshTicker } from '../../components/situation/useLiveResource';

const FRESH_MS = 8_000;

function clockNow(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
}

/** "Institut holati" — rahbar birinchi ko'radigan va devor ekranida
 *  turadigan sahifa: institut bo'yicha kunlik holat bir qarashda. */
export default function SituationPage() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const has = useCallback((key: PermissionKey) => can(key, role), [can, role]);
  const { presentation: big } = useShell();
  const { date, today, isToday, setDate, withDate } = useViewDate();

  const canStudentsPages = has('manageAttendance');
  const canData = canStudentsPages || has('viewReports');
  const canLessons = canData || has('manageLessons');
  const canEvents = has('reviewEvents');
  const cameraLink = has('editCameraLocation') ? '/sozlamalar/kameralar' : has('viewLive') ? '/videodevor' : null;

  // Yangilanish: devor ekranida 30 s, oddiy rejimda 60 s; realtime xabar — debounce bilan.
  // O'tgan kunlar yakuniy — avtomatik yangilanmaydi.
  const { tick, bump, refreshNow } = useRefreshTicker(big ? 30_000 : 60_000, isToday);

  const overview = useLiveResource(canData ? `overview:${date}` : null, (signal) => getOverview(date, { signal }), tick);
  const groups = useLiveResource(canData ? `groups:${date}` : null, (signal) => getGroups({ date }, { signal }), tick);
  // Dars jadvali kiritilmagan bo'lsa (ishlab turgan tizimda odatiy holat)
  // 500 ta darsni har yangilanishda so'rashning ma'nosi yo'q: umumiy
  // ko'rsatkich darslar borligini aytganda so'raladi.
  const hasLessons = (overview.data?.lessons.total ?? 0) > 0;
  const lessons = useLiveResource(
    canLessons && hasLessons ? `lessons:${date}` : null,
    (signal) => getLessons({ date, pageSize: 500 }, { signal }),
    tick,
  );
  // Xodimlar: oxirgi 14 kun (trend + kecha / o'tgan hafta shu kuni bilan taqqoslash).
  const staffTrend = useLiveResource(canData ? `staff-trend:${date}` : null, (signal) => getAnalyticsSummary({ from: shiftIso(date, -14), to: date, type: 'xodim' }, { signal }), tick);
  const units = useLiveResource(canData ? `units:${date}` : null, (signal) => getKafedras(date, { signal }), tick);
  const chronic = useLiveResource(canData ? `chronic:${date}` : null, (signal) => getAnalyticsChronic({ from: shiftIso(date, -29), to: date, type: 'xodim' }, { signal }), tick);
  // Talabalar yuzi yetarli bo'lmaguncha — ro'yxatga olish kampaniyasi.
  const needEnrollment = overview.data ? !overview.data.studentsDataAvailable : false;
  const enrollment = useLiveResource(canData && needEnrollment ? 'enrollment' : null, (signal) => getEnrollment({ signal }), tick);
  const topEvents = useLiveResource(
    canEvents && isToday ? 'events:high-open' : null,
    (signal) =>
      api.get<ApiPage<AIEvent>>(
        `/api/events${buildQuery({ status: 'yangi,jarayonda', severity: 'yuqori', sort: 'newest', pageSize: 3 })}`,
        undefined,
        { signal },
      ),
    tick,
  );

  // Jonli kelishlar: serverdagi ro'yxat yangilanguncha darhol ko'rinadi.
  const [liveArrivals, setLiveArrivals] = useState<LastArrival[]>([]);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const freshTimers = useRef<number[]>([]);
  useEffect(() => {
    setLiveArrivals([]);
    setFreshIds(new Set());
  }, [date]);
  useEffect(() => () => freshTimers.current.forEach((id) => window.clearTimeout(id)), []);

  const onAttendance = useCallback(
    (message: LiveAttendanceMessage) => {
      if (message.date !== date) return;
      const item = arrivalFromMessage(message);
      setLiveArrivals((prev) => [item, ...prev.filter((p) => p.id !== item.id)].slice(0, 10));
      setFreshIds((prev) => new Set(prev).add(item.id));
      freshTimers.current.push(
        window.setTimeout(() => {
          setFreshIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }, FRESH_MS),
      );
      bump();
    },
    [date, bump],
  );
  const live = isToday && canData && canEvents;
  useLiveAttendance(onAttendance, live);
  useLiveEvents(bump, isToday && canEvents, bump);

  const data = overview.data;
  const arrivals = useMemo(() => mergeArrivals(liveArrivals, data?.lastArrivals ?? [], 6), [liveArrivals, data]);
  const lowGroups = useMemo(() => lowestGroups(groups.data ?? [], 3), [groups.data]);
  const lateTeachers = useMemo(() => teacherIssues(lessons.data?.items ?? [], 3), [lessons.data]);

  const dayLabel = relativeDayLabel(date, today);
  const updated = clockNow(overview.updatedAt);
  const subtitle = (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>Kim keldi, kim kelmadi va nimaga e'tibor kerak.</span>
      <span className="text-subtle">
        · {dayLabel ? `${dayLabel}, ` : ''}
        {formatUzDate(date, { weekday: !dayLabel })}
      </span>
      {updated && canData && (
        <span className="text-subtle">· {isToday ? `${updated} da yangilandi` : 'kun yakunlangan, raqamlar o\'zgarmaydi'}</span>
      )}
    </span>
  );

  const titleAddon = isToday ? (
    live ? (
      <Badge tone="success" className="gap-1.5">
        <StatusDot tone="success" pulse /> Jonli
      </Badge>
    ) : undefined
  ) : (
    <Badge tone="neutral" icon={History}>
      O'tgan kun
    </Badge>
  );

  const actions = (
    <>
      {!isToday && (
        <Button variant="secondary" size="sm" onClick={() => setDate(today)}>
          Bugunga qaytish
        </Button>
      )}
      {canData && (
        <a
          href="/markaz-ekran"
          target="_blank"
          rel="noopener"
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden sm:inline-flex' })}
          title="Devor ekrani uchun alohida oynada ochish"
        >
          <MonitorUp size={15} aria-hidden="true" />
          Katta ekran
        </a>
      )}
      {canData && (
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" size="sm" loading={overview.fetching && Boolean(data)} onClick={refreshNow} />
      )}
    </>
  );

  if (!canData) {
    return (
      <Page title="Institut holati" subtitle={subtitle} actions={actions}>
        <NoAccess has={has} />
      </Page>
    );
  }

  const s = data?.students;
  const staff = data?.staff;
  const expected = s ? s.present + s.absent + s.notYet : 0;
  const staffExpected = staff ? staff.present + staff.absent + staff.notYet : 0;
  const teacherRate = data ? teacherOnTimeRate(data.teachers) : null;
  const eventsTone: Tone = data ? (data.events.highOpen > 0 ? 'danger' : data.events.open > 0 ? 'warning' : 'success') : 'neutral';
  const camerasOffline = data ? Math.max(0, data.cameras.active - data.cameras.online) : 0;
  const loadingTiles = overview.loading && !data;
  // Talabalar yuzi hali yetarli emas — markaz xodimlardan boshlanadi.
  const staffFirst = Boolean(data && !data.studentsDataAvailable);

  const daily = staffTrend.data?.daily ?? [];
  const cmp = staffComparison(daily, date);
  type DayCounts = { present: number; late: number; absent: number };
  const mkDeltas = (pick: (d: DayCounts) => number, current: number | undefined, better: 'up' | 'down'): KpiDelta[] => {
    if (current === undefined) return [];
    const out: KpiDelta[] = [];
    if (cmp.previous) out.push({ label: cmp.previousLabel, value: current - pick(cmp.previous), better, title: `${cmp.previous.date}: ${formatNumber(pick(cmp.previous))}` });
    if (cmp.lastWeek) out.push({ label: cmp.lastWeekLabel, value: current - pick(cmp.lastWeek), better, title: `${cmp.lastWeek.date}: ${formatNumber(pick(cmp.lastWeek))}` });
    return out;
  };
  const presentDeltas = mkDeltas((d) => d.present, staff?.present, 'up');
  const lateDeltas = mkDeltas((d) => d.late, staff?.late, 'down');
  const absentDeltas = mkDeltas((d) => d.absent, staff?.absent, 'down');
  const rateTrend = daily.length ? dailySeries(daily, date, (d) => d.rate) : null;
  const lateTrend = daily.length ? dailySeries(daily, date, (d) => d.late) : null;
  const absentTrend = daily.length ? dailySeries(daily, date, (d) => d.absent) : null;
  const chronicList = chronic.data ?? [];
  const chronicCount = chronicList.length;
  const chronicAbsent = chronicList.filter((c) => c.reasons.includes('kelmadi')).length;
  const chronicLate = chronicList.filter((c) => c.reasons.includes('kech_keldi')).length;

  const studentsLink = canStudentsPages ? withDate('/talabalar') : undefined;
  const teachersLink = canStudentsPages ? withDate('/oqituvchilar') : undefined;

  return (
    <Page title="Institut holati" subtitle={subtitle} titleAddon={titleAddon} actions={big ? undefined : actions}>
      {overview.error && !data ? (
        <ErrorState variant="block" title="Bugungi holatni serverdan olib bo'lmadi" message={overview.error} onRetry={overview.reload} />
      ) : (
        <>
          {overview.error && data && (
            <ErrorState title="Oxirgi yangilanish muvaffaqiyatsiz" message={`${overview.error}. Ekrandagi ma'lumot ${updated ?? ''} holatiga ko'ra.`} onRetry={overview.reload} />
          )}

          <section aria-label="Asosiy ko'rsatkichlar" className={big ? 'grid grid-cols-4 gap-4' : 'grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'}>
            {staffFirst ? (
              <>
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label="Xodimlar keldi"
              icon={Users}
              tone="primary"
              value={formatNumber(staff?.present)}
              suffix={staff ? `/ ${formatNumber(staffExpected)}` : undefined}
              ring={staff?.rate ?? null}
              segments={staff ? attendanceSegments(staff) : undefined}
              deltas={presentDeltas}
              trend={rateTrend}
              hint={staff ? `Ro'yxatda ${formatNumber(staff.total)} xodim · yuzi ro'yxatdan o'tgani ${formatNumber(staff.enrolled)} ta` : undefined}
              to={teachersLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kech kelgan xodimlar"
              icon={Clock}
              tone="warning"
              value={formatNumber(staff?.late)}
              deltas={lateDeltas}
              trend={lateTrend}
              hint={staff ? `Bugun kelgan xodimlarning ${formatPercent(share(staff.late, staff.present))} qismi` : undefined}
              to={teachersLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kelmagan xodimlar"
              icon={UserX}
              tone="danger"
              value={formatNumber(staff?.absent)}
              deltas={absentDeltas}
              trend={absentTrend}
              hint={staff ? (isToday && staff.notYet > 0 ? `Yana ${formatNumber(staff.notYet)} kishi hali kelmagan` : `Kutilgan ${formatNumber(staffExpected)} xodimning ${formatPercent(share(staff.absent, staffExpected))} qismi`) : undefined}
              to={teachersLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Takroran kechikkan yoki kelmagan xodimlar"
              icon={Repeat}
              tone={chronicCount > 0 ? 'warning' : 'success'}
              value={chronic.data ? formatNumber(chronicCount) : '—'}
              hint={
                chronic.data
                  ? chronicCount > 0
                    ? `So'nggi 30 kunda: ${formatNumber(chronicAbsent)} kishi 3+ kun kelmagan · ${formatNumber(chronicLate)} kishi 3+ kun kech kelgan`
                    : "So'nggi 30 kunda takror kechikkan yoki kelmagan xodim yo'q"
                  : chronic.error ?? undefined
              }
              to={canStudentsPages ? withDate('/oqituvchilar?tab=surunkali') : undefined}
              loading={chronic.loading && !chronic.data}
              big={big}
            />
            {/* Dars jadvali kiritilmagan bo'lsa bu ikki ko'rsatkichni
                tizim umuman o'lchay olmaydi — 0% ko'rsatish o'rniga
                ko'rsatkich chiqmaydi. Jadval paydo bo'lsa o'zi qaytadi. */}
            {hasLessons && (
              <>
              <KpiTile
                label="Darsga o'z vaqtida kirgan o'qituvchilar"
                icon={Users}
                tone={toneForRate(teacherRate)}
                value={formatPercent(teacherRate)}
                segments={
                  data && data.teachers.onTime + data.teachers.late + data.teachers.absent > 0
                    ? [
                        { value: data.teachers.onTime, tone: 'success', label: "O'z vaqtida" },
                        { value: data.teachers.late, tone: 'warning', label: 'Kech keldi' },
                        { value: data.teachers.absent, tone: 'danger', label: 'Kelmadi' },
                      ]
                    : undefined
                }
                hint={
                  data
                    ? data.teachers.scheduled > 0
                      ? `Bugun darsi bor ${formatNumber(data.teachers.scheduled)} o'qituvchidan: ${formatNumber(data.teachers.late)} kech kirgan · ${formatNumber(data.teachers.absent)} kirmagan`
                      : "Darsi bor o'qituvchi yo'q"
                    : undefined
                }
                to={teachersLink}
                loading={loadingTiles}
                big={big}
              />
              <KpiTile
                label={isToday ? 'Bugungi darslar' : 'Shu kungi darslar'}
                icon={BookOpen}
                tone="info"
                value={formatNumber(isToday ? data?.lessons.finished : data?.lessons.total)}
                suffix={data && isToday ? `/ ${formatNumber(data.lessons.total)}` : undefined}
                segments={
                  data && isToday && data.lessons.total > 0
                    ? [
                        { value: data.lessons.finished, tone: 'neutral', label: "O'tgan" },
                        { value: data.lessons.ongoing, tone: 'primary', label: 'Davom etmoqda' },
                        { value: data.lessons.upcoming, tone: 'info', label: 'Kutilmoqda' },
                      ]
                    : undefined
                }
                hint={
                  data
                    ? isToday
                      ? `${formatNumber(data.lessons.finished)} o'tgan · ${formatNumber(data.lessons.ongoing)} davom etmoqda · ${formatNumber(data.lessons.upcoming)} kutilmoqda`
                      : `${formatNumber(data.lessons.total)} ta dars o'tgan`
                    : undefined
                }
                loading={loadingTiles}
                big={big}
              />
              </>
            )}
            {isToday ? (
              <KpiTile
                label="Ishlab turgan kameralar"
                icon={Camera}
                tone={camerasOffline > 0 ? 'warning' : 'success'}
                value={formatNumber(data?.cameras.online)}
                suffix={data ? `/ ${formatNumber(data.cameras.active)}` : undefined}
                segments={
                  data && data.cameras.active > 0
                    ? [
                        { value: data.cameras.online, tone: 'success', label: 'Ishlayapti' },
                        { value: camerasOffline, tone: 'danger', label: 'Aloqada emas' },
                      ]
                    : undefined
                }
                hint={data ? (camerasOffline > 0 ? `${formatNumber(data.cameras.active)} ta ishlashi kerak, ${formatNumber(camerasOffline)} tasi aloqada emas` : `${formatNumber(data.cameras.videoFlowing)} tasi hozir tasvir uzatmoqda`) : undefined}
                to={cameraLink ?? undefined}
                loading={loadingTiles}
                big={big}
              />
            ) : (
              <KpiTile
                label="Yuz topshirgan talabalar"
                icon={ScanFace}
                tone="primary"
                value={formatNumber(data?.students.enrolled)}
                suffix={data ? `/ ${formatNumber(data.students.total)}` : undefined}
                ring={data?.studentsEnrolledPct ?? null}
                ringTone="primary"
                hint="Kamera faqat yuzi ro'yxatdan o'tganlarni taniydi. Talabalar davomati 5% dan boshlab ko'rsatiladi"
                to={studentsLink}
                loading={loadingTiles}
                big={big}
              />
            )}
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label={isToday ? "Hal qilinmagan hodisalar" : 'Shu kuni qayd etilgan hodisalar'}
              icon={isToday ? AlertOctagon : Bell}
              tone={isToday ? eventsTone : 'neutral'}
              value={formatNumber(isToday ? data?.events.open : data?.events.today)}
              hint={
                data
                  ? isToday
                    ? `Shundan ${formatNumber(data.events.highOpen)} tasi juda muhim · ${formatNumber(data.events.overdue)} tasining muddati o'tgan · bugun jami ${formatNumber(data.events.today)} ta`
                    : 'Kameralar dasturi shu kuni qayd etgan holatlar'
                  : undefined
              }
              to={canEvents ? (isToday ? '/hodisalar' : `/hodisalar?from=${date}&to=${date}&korinish=jurnal`) : undefined}
              loading={loadingTiles}
              big={big}
            />
                        </>
            ) : (
              <>
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label="Talabalar keldi"
              icon={GraduationCap}
              tone="primary"
              value={formatNumber(s?.present)}
              suffix={s ? `/ ${formatNumber(expected)}` : undefined}
              ring={s?.rate ?? null}
              segments={s ? attendanceSegments(s) : undefined}
              hint={s ? `Ro'yxatda ${formatNumber(s.total)} talaba${s.noData ? ` · ${formatNumber(s.noData)} tasining holati aniqlanmagan` : ''}` : undefined}
              to={studentsLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kech kelganlar"
              icon={Clock}
              tone="warning"
              value={formatNumber(s?.late)}
              hint={s ? `Bugun kelganlarning ${formatPercent(share(s.late, s.present))} qismi` : undefined}
              to={studentsLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kelmaganlar"
              icon={UserX}
              tone="danger"
              value={formatNumber(s?.absent)}
              hint={s ? `Kutilgan ${formatNumber(expected)} talabaning ${formatPercent(share(s.absent, expected))} qismi` : undefined}
              to={studentsLink}
              loading={loadingTiles}
              big={big}
            />
            {isToday ? (
              <KpiTile
                label="Hali kelmagan"
                icon={Hourglass}
                tone="neutral"
                value={formatNumber(s?.notYet)}
                hint="Yuzi ro'yxatdan o'tgan, lekin bugun hali biror kamerada ko'rinmagan"
                to={studentsLink}
                loading={loadingTiles}
                big={big}
              />
            ) : (
              <KpiTile
                label="Holati aniqlanmagan talabalar"
                icon={Hourglass}
                tone="neutral"
                value={formatNumber(s?.noData)}
                hint="Yuzini ro'yxatdan o'tkazmagan — kamera ularni tanay olmaydi"
                to={studentsLink}
                loading={loadingTiles}
                big={big}
              />
            )}
            {/* Dars jadvali kiritilmagan bo'lsa bu ikki ko'rsatkichni
                tizim umuman o'lchay olmaydi — 0% ko'rsatish o'rniga
                ko'rsatkich chiqmaydi. Jadval paydo bo'lsa o'zi qaytadi. */}
            {hasLessons && (
              <>
              <KpiTile
                label="Darsga o'z vaqtida kirgan o'qituvchilar"
                icon={Users}
                tone={toneForRate(teacherRate)}
                value={formatPercent(teacherRate)}
                segments={
                  data && data.teachers.onTime + data.teachers.late + data.teachers.absent > 0
                    ? [
                        { value: data.teachers.onTime, tone: 'success', label: "O'z vaqtida" },
                        { value: data.teachers.late, tone: 'warning', label: 'Kech keldi' },
                        { value: data.teachers.absent, tone: 'danger', label: 'Kelmadi' },
                      ]
                    : undefined
                }
                hint={
                  data
                    ? data.teachers.scheduled > 0
                      ? `Bugun darsi bor ${formatNumber(data.teachers.scheduled)} o'qituvchidan: ${formatNumber(data.teachers.late)} kech kirgan · ${formatNumber(data.teachers.absent)} kirmagan`
                      : "Darsi bor o'qituvchi yo'q"
                    : undefined
                }
                to={teachersLink}
                loading={loadingTiles}
                big={big}
              />
              <KpiTile
                label={isToday ? 'Bugungi darslar' : 'Shu kungi darslar'}
                icon={BookOpen}
                tone="info"
                value={formatNumber(isToday ? data?.lessons.finished : data?.lessons.total)}
                suffix={data && isToday ? `/ ${formatNumber(data.lessons.total)}` : undefined}
                segments={
                  data && isToday && data.lessons.total > 0
                    ? [
                        { value: data.lessons.finished, tone: 'neutral', label: "O'tgan" },
                        { value: data.lessons.ongoing, tone: 'primary', label: 'Davom etmoqda' },
                        { value: data.lessons.upcoming, tone: 'info', label: 'Kutilmoqda' },
                      ]
                    : undefined
                }
                hint={
                  data
                    ? isToday
                      ? `${formatNumber(data.lessons.finished)} o'tgan · ${formatNumber(data.lessons.ongoing)} davom etmoqda · ${formatNumber(data.lessons.upcoming)} kutilmoqda`
                      : `${formatNumber(data.lessons.total)} ta dars o'tgan`
                    : undefined
                }
                loading={loadingTiles}
                big={big}
              />
              </>
            )}
            {isToday ? (
              <KpiTile
                label="Ishlab turgan kameralar"
                icon={Camera}
                tone={camerasOffline > 0 ? 'warning' : 'success'}
                value={formatNumber(data?.cameras.online)}
                suffix={data ? `/ ${formatNumber(data.cameras.active)}` : undefined}
                segments={
                  data && data.cameras.active > 0
                    ? [
                        { value: data.cameras.online, tone: 'success', label: 'Ishlayapti' },
                        { value: camerasOffline, tone: 'danger', label: 'Aloqada emas' },
                      ]
                    : undefined
                }
                hint={data ? (camerasOffline > 0 ? `${formatNumber(data.cameras.active)} ta ishlashi kerak, ${formatNumber(camerasOffline)} tasi aloqada emas` : `${formatNumber(data.cameras.videoFlowing)} tasi hozir tasvir uzatmoqda`) : undefined}
                to={cameraLink ?? undefined}
                loading={loadingTiles}
                big={big}
              />
            ) : (
              <KpiTile
                label="Xodimlar keldi"
                icon={Users}
                tone="primary"
                value={formatNumber(staff?.present)}
                suffix={staff ? `/ ${formatNumber(staffExpected)}` : undefined}
                ring={staff?.rate ?? null}
                deltas={presentDeltas}
                trend={rateTrend}
                hint={staff ? `${formatNumber(staff.late)} kech · ${formatNumber(staff.absent)} kelmadi` : undefined}
                to={teachersLink}
                loading={loadingTiles}
                big={big}
              />
            )}
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label={isToday ? "Hal qilinmagan hodisalar" : 'Shu kuni qayd etilgan hodisalar'}
              icon={isToday ? AlertOctagon : Bell}
              tone={isToday ? eventsTone : 'neutral'}
              value={formatNumber(isToday ? data?.events.open : data?.events.today)}
              hint={
                data
                  ? isToday
                    ? `Shundan ${formatNumber(data.events.highOpen)} tasi juda muhim · ${formatNumber(data.events.overdue)} tasining muddati o'tgan · bugun jami ${formatNumber(data.events.today)} ta`
                    : 'Kameralar dasturi shu kuni qayd etgan holatlar'
                  : undefined
              }
              to={canEvents ? (isToday ? '/hodisalar' : `/hodisalar?from=${date}&to=${date}&korinish=jurnal`) : undefined}
              loading={loadingTiles}
              big={big}
            />
                        </>
            )}
          </section>

          {staffFirst && !loadingTiles && (
            <p className="-mt-1 flex items-start gap-2 text-[13px] text-muted">
              <ScanFace size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Talabalarning atigi {formatPercent(data?.studentsEnrolledPct ?? 0, (data?.studentsEnrolledPct ?? 0) < 1 ? 2 : 1)} yuzi tasdiqlangan — shuning uchun markaz hozircha xodimlar davomatini ko'rsatadi.
                Talabalar davomati yuzlar yetarli bo'lgach avtomatik yoqiladi.
              </span>
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
              {staffFirst ? (
                <EnrollmentCampaign
                  data={enrollment.data}
                  loading={enrollment.loading && !enrollment.data}
                  error={enrollment.error}
                  onRetry={enrollment.reload}
                  link={studentsLink}
                  facultyLink={canStudentsPages ? (id) => withDate(situationPaths.faculty(id)) : null}
                  big={big}
                />
              ) : (
                <FacultyAttendance
                  faculties={data?.byFaculty ?? null}
                  loading={loadingTiles}
                  linkFor={canStudentsPages ? (f) => withDate(situationPaths.faculty(f.id)) : null}
                  allLink={studentsLink}
                  big={big}
                />
              )}
              <UnitsRanking
                units={units.data}
                loading={units.loading && !units.data}
                error={units.error}
                onRetry={units.reload}
                linkFor={canStudentsPages ? (u) => withDate(situationPaths.kafedra(u.id)) : null}
                allLink={teachersLink}
                isToday={isToday}
                big={big}
              />
              <ArrivalsChart rows={data?.arrivalsByHour ?? null} loading={loadingTiles} currentHour={isToday && data ? hourOf(data.generatedAt) : null} big={big} />
            {canLessons && hasLessons && (
              <LessonsTimeline
                lessons={lessons.data?.items ?? null}
                loading={lessons.loading && !lessons.data}
                error={lessons.data ? null : lessons.error}
                onRetry={lessons.reload}
                isToday={isToday}
                big={big}
              />
            )}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <AttentionPanel
                loading={loadingTiles || (groups.loading && !groups.data)}
                events={
                  isToday && canEvents && data
                    ? { highOpen: data.events.highOpen, overdue: data.events.overdue, top: topEvents.data?.items ?? [], link: (q) => `/hodisalar${q ? `?${q}` : ''}` }
                    : null
                }
                cameras={isToday && data ? { offline: camerasOffline, active: data.cameras.active, link: cameraLink } : null}
                groups={lowGroups}
                groupLink={canStudentsPages ? (name) => withDate(situationPaths.group(name)) : null}
                teacherLessons={lateTeachers}
                teacherLink={canStudentsPages ? (lesson) => (lesson.teacherId ? withDate(situationPaths.person(lesson.teacherId)) : null) : null}
                big={big}
              />
              {isToday && (
                <LiveArrivals
                  items={arrivals}
                  loading={loadingTiles}
                  live={live}
                  freshIds={freshIds}
                  personLink={canStudentsPages ? (id) => withDate(situationPaths.person(id)) : null}
                  big={big}
                />
              )}
            </div>
          </div>

        </>
      )}
    </Page>
  );
}

const QUICK_LINKS: Array<{ permission: PermissionKey; to: string; label: string; icon: typeof Camera }> = [
  { permission: 'viewLive', to: '/videodevor', label: 'Jonli kameralar', icon: Presentation },
  { permission: 'reviewEvents', to: '/hodisalar', label: 'Hodisalar', icon: Bell },
  { permission: 'editCameraLocation', to: '/sozlamalar/kameralar', label: 'Kameralar', icon: Camera },
];

/** Davomat/hisobot huquqi bo'lmagan foydalanuvchi uchun — xato emas, yo'l-yo'riq. */
function NoAccess({ has }: { has: (key: PermissionKey) => boolean }) {
  const links = QUICK_LINKS.filter((link) => has(link.permission));
  return (
    <EmptyState
      icon={Lock}
      title="Bu sahifadagi raqamlar sizga ko'rinmaydi"
      description="Institut bo'yicha davomat va dars ko'rsatkichlarini ko'rish uchun “Davomat” yoki “Hisobotlar” huquqi kerak. Administratorga murojaat qiling."
      action={
        links.length > 0
          ? links.map((link) => (
              <ButtonLink key={link.to} to={link.to} variant="secondary" icon={link.icon}>
                {link.label}
              </ButtonLink>
            ))
          : undefined
      }
    />
  );
}
