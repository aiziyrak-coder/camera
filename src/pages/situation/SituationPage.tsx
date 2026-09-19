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
  Presentation,
  RefreshCw,
  UserX,
  Users,
} from 'lucide-react';
import { api, buildQuery, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions, type PermissionKey } from '../../lib/permissions';
import { useLiveAttendance, useLiveEvents, type LiveAttendanceMessage } from '../../lib/realtime';
import { getGroups, getLessons, getOverview, situationPaths, type LastArrival } from '../../lib/situationApi';
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
import { KpiTile } from '../../components/situation/KpiTile';
import { LessonsTimeline } from '../../components/situation/LessonsTimeline';
import { LiveArrivals } from '../../components/situation/LiveArrivals';
import {
  arrivalFromMessage,
  attendanceSegments,
  hourOf,
  lowestGroups,
  mergeArrivals,
  share,
  teacherIssues,
  teacherOnTimeRate,
} from '../../components/situation/situationUtils';
import { useLiveResource, useRefreshTicker } from '../../components/situation/useLiveResource';

const FRESH_MS = 8_000;

function clockNow(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
}

/** Situatsion markaz — rektor birinchi ko'radigan va devor ekranida
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
  const canLessonsPage = has('manageLessons');
  const canEvents = has('reviewEvents');
  const cameraLink = has('editCameraLocation') ? '/sozlamalar/kameralar' : has('viewLive') ? '/videodevor' : null;

  // Yangilanish: devor ekranida 30 s, oddiy rejimda 60 s; realtime xabar — debounce bilan.
  // O'tgan kunlar yakuniy — avtomatik yangilanmaydi.
  const { tick, bump, refreshNow } = useRefreshTicker(big ? 30_000 : 60_000, isToday);

  const overview = useLiveResource(canData ? `overview:${date}` : null, (signal) => getOverview(date, { signal }), tick);
  const groups = useLiveResource(canData ? `groups:${date}` : null, (signal) => getGroups({ date }, { signal }), tick);
  const lessons = useLiveResource(canLessons ? `lessons:${date}` : null, (signal) => getLessons({ date, pageSize: 500 }, { signal }), tick);
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
      <span>
        {dayLabel ? `${dayLabel}, ` : ''}
        {formatUzDate(date, { weekday: !dayLabel })}
      </span>
      {updated && canData && (
        <span className="text-subtle">· {isToday ? `yangilandi ${updated}` : 'yakuniy natijalar'}</span>
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
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" size="sm" loading={overview.fetching && Boolean(data)} onClick={refreshNow} />
      )}
    </>
  );

  if (!canData) {
    return (
      <Page title="Situatsion markaz" subtitle={subtitle} actions={actions}>
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

  const studentsLink = canStudentsPages ? withDate('/talabalar') : undefined;
  const teachersLink = canStudentsPages ? withDate('/oqituvchilar') : undefined;
  const lessonsLink = canLessonsPage ? withDate('/darslar') : null;

  return (
    <Page title="Situatsion markaz" subtitle={subtitle} titleAddon={titleAddon} actions={big ? undefined : actions}>
      {overview.error && !data ? (
        <ErrorState variant="block" title="Situatsion markaz ma'lumotini olib bo'lmadi" message={overview.error} onRetry={overview.reload} />
      ) : (
        <>
          {overview.error && data && (
            <ErrorState title="Oxirgi yangilanish muvaffaqiyatsiz" message={`${overview.error}. Ekrandagi ma'lumot ${updated ?? ''} holatiga ko'ra.`} onRetry={overview.reload} />
          )}

          <section aria-label="Asosiy ko'rsatkichlar" className={big ? 'grid grid-cols-4 gap-4' : 'grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'}>
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label="Talabalar keldi"
              icon={GraduationCap}
              tone="primary"
              value={formatNumber(s?.present)}
              suffix={s ? `/ ${formatNumber(expected)}` : undefined}
              ring={s?.rate ?? null}
              segments={s ? attendanceSegments(s) : undefined}
              hint={s ? `Ro'yxatda ${formatNumber(s.total)} ta${s.noData ? ` · ${formatNumber(s.noData)} ma'lumotsiz` : ''}` : undefined}
              to={studentsLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kech qolganlar"
              icon={Clock}
              tone="warning"
              value={formatNumber(s?.late)}
              hint={s ? `Kelganlarning ${formatPercent(share(s.late, s.present))}` : undefined}
              to={studentsLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Kelmaganlar"
              icon={UserX}
              tone="danger"
              value={formatNumber(s?.absent)}
              hint={s ? `Kutilganlarning ${formatPercent(share(s.absent, expected))}` : undefined}
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
                hint="Yuzi tasdiqlangan, bugun hali ko'rinmagan"
                to={studentsLink}
                loading={loadingTiles}
                big={big}
              />
            ) : (
              <KpiTile
                label="Ma'lumot yo'q"
                icon={Hourglass}
                tone="neutral"
                value={formatNumber(s?.noData)}
                hint="Yuzi tasdiqlanmagan yoki qayd yo'q"
                to={studentsLink}
                loading={loadingTiles}
                big={big}
              />
            )}
            <KpiTile
              label="O'qituvchilar darsga o'z vaqtida"
              icon={Users}
              tone={toneForRate(teacherRate)}
              value={formatPercent(teacherRate)}
              segments={
                data && data.teachers.onTime + data.teachers.late + data.teachers.absent > 0
                  ? [
                      { value: data.teachers.onTime, tone: 'success', label: "O'z vaqtida" },
                      { value: data.teachers.late, tone: 'warning', label: 'Kechikdi' },
                      { value: data.teachers.absent, tone: 'danger', label: 'Kelmadi' },
                    ]
                  : undefined
              }
              hint={
                data
                  ? data.teachers.scheduled > 0
                    ? `${formatNumber(data.teachers.scheduled)} o'qituvchi · ${formatNumber(data.teachers.late)} kech · ${formatNumber(data.teachers.absent)} kelmadi`
                    : "Darsi bor o'qituvchi yo'q"
                  : undefined
              }
              to={teachersLink}
              loading={loadingTiles}
              big={big}
            />
            <KpiTile
              label="Darslar"
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
                    ? `o'tgan · ${formatNumber(data.lessons.ongoing)} davom etmoqda · ${formatNumber(data.lessons.upcoming)} kutilmoqda`
                    : "ta dars o'tgan"
                  : undefined
              }
              to={lessonsLink ?? undefined}
              loading={loadingTiles}
              big={big}
            />
            {isToday ? (
              <KpiTile
                label="Kameralar onlayn"
                icon={Camera}
                tone={camerasOffline > 0 ? 'warning' : 'success'}
                value={formatNumber(data?.cameras.online)}
                suffix={data ? `/ ${formatNumber(data.cameras.active)}` : undefined}
                segments={
                  data && data.cameras.active > 0
                    ? [
                        { value: data.cameras.online, tone: 'success', label: 'Onlayn' },
                        { value: camerasOffline, tone: 'danger', label: 'Aloqada emas' },
                      ]
                    : undefined
                }
                hint={data ? (camerasOffline > 0 ? `${formatNumber(camerasOffline)} ta aloqada emas` : `${formatNumber(data.cameras.videoFlowing)} ta tasvir uzatmoqda`) : undefined}
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
                hint={staff ? `${formatNumber(staff.late)} kech · ${formatNumber(staff.absent)} kelmadi` : undefined}
                loading={loadingTiles}
                big={big}
              />
            )}
            <KpiTile
              className="col-span-2 sm:col-span-1"
              label={isToday ? 'Ochiq hodisalar' : 'Shu kungi hodisalar'}
              icon={isToday ? AlertOctagon : Bell}
              tone={isToday ? eventsTone : 'neutral'}
              value={formatNumber(isToday ? data?.events.open : data?.events.today)}
              hint={
                data
                  ? isToday
                    ? `${formatNumber(data.events.highOpen)} yuqori muhimlik · ${formatNumber(data.events.overdue)} muddati o'tgan · bugun ${formatNumber(data.events.today)}`
                    : 'AI aniqlagan signallar'
                  : undefined
              }
              to={canEvents ? (isToday ? '/hodisalar' : `/hodisalar?from=${date}&to=${date}&korinish=jurnal`) : undefined}
              loading={loadingTiles}
              big={big}
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
              <FacultyAttendance
                faculties={data?.byFaculty ?? null}
                loading={loadingTiles}
                linkFor={canStudentsPages ? (f) => withDate(situationPaths.faculty(f.id)) : null}
                allLink={studentsLink}
                big={big}
              />
              <ArrivalsChart rows={data?.arrivalsByHour ?? null} loading={loadingTiles} currentHour={isToday && data ? hourOf(data.generatedAt) : null} big={big} />
            {canLessons && (
              <LessonsTimeline
                lessons={lessons.data?.items ?? null}
                loading={lessons.loading && !lessons.data}
                error={lessons.data ? null : lessons.error}
                onRetry={lessons.reload}
                link={lessonsLink}
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
                lessonsLink={lessonsLink}
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
  { permission: 'viewLive', to: '/videodevor', label: 'Videodevor', icon: Presentation },
  { permission: 'reviewEvents', to: '/hodisalar', label: 'Hodisalar', icon: Bell },
  { permission: 'editCameraLocation', to: '/sozlamalar/kameralar', label: 'Kameralar', icon: Camera },
];

/** Davomat/hisobot huquqi bo'lmagan foydalanuvchi uchun — xato emas, yo'l-yo'riq. */
function NoAccess({ has }: { has: (key: PermissionKey) => boolean }) {
  const links = QUICK_LINKS.filter((link) => has(link.permission));
  return (
    <EmptyState
      icon={Lock}
      title="Situatsion markaz ko'rsatkichlari sizga yopiq"
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
