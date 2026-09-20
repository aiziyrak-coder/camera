import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Camera, Lock, MonitorUp, Presentation, RefreshCw } from 'lucide-react';
import { api, buildQuery, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions, type PermissionKey } from '../../lib/permissions';
import { useLiveAttendance, useLiveEvents, type LiveAttendanceMessage } from '../../lib/realtime';
import {
  getAnalyticsChronic,
  getAnalyticsSummary,
  getGroups,
  getKafedras,
  getLessons,
  getOverview,
  situationPaths,
} from '../../lib/situationApi';
import { useViewDate } from '../../lib/viewDate';
import type { AIEvent } from '../../types';
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  IconButton,
  IntelPanel,
  Page,
  StatusLamp,
  buttonClasses,
  formatNumber,
  formatPercent,
  formatUzDate,
  relativeDayLabel,
  useShell,
} from '../../ui';
import { RATE_RAG, rag } from '../../ui/rag';
import type { BoardItem } from '../../components/hisobot/board';
import { AttentionPanel, countAttentionIssues } from '../../components/situation/AttentionPanel';
import { IndicatorTable, type Indicator } from '../../components/situation/IndicatorTable';
import { UnitsBoard } from '../../components/situation/UnitsBoard';
import { VerdictHeadline } from '../../components/situation/VerdictHeadline';
import {
  facultyBoardItems,
  lowestGroups,
  shiftIso,
  staffComparison,
  teacherIssues,
  teacherOnTimeRate,
  unitBoardItems,
  worstFirst,
} from '../../components/situation/situationUtils';
import { useLiveResource, useRefreshTicker } from '../../components/situation/useLiveResource';

function clockNow(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
}

/**
 * "Institut holati" — rahbar ochadigan birinchi ekran. Uch savol, bitta
 * varaq: ishlayaptimi (hukm) → qayerda muammo (taxta) → nima qaror
 * talab qiladi (ro'yxat). Pastda bitta yordamchi panel: ko'rsatkichlar.
 */
export default function SituationPage() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const has = useCallback((key: PermissionKey) => can(key, role), [can, role]);
  const { presentation: big } = useShell();
  const navigate = useNavigate();
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

  // Jonli davomat xabari — ro'yxat emas, YANGILANISH sababi: raqamlar
  // serverdan qayta so'raladi.
  const onAttendance = useCallback(
    (message: LiveAttendanceMessage) => {
      if (message.date !== date) return;
      bump();
    },
    [date, bump],
  );
  const liveWanted = isToday && canData;
  useLiveAttendance(onAttendance, liveWanted);
  // Ulanish holati soketdan olinadi: ilgari ulanish yo'q bo'lsa ham
  // sarlavhada "Jonli" yozuvi turaverardi.
  const liveStatus = useLiveEvents(bump, isToday && canEvents, bump);
  const live = liveWanted && liveStatus === 'live';

  const data = overview.data;
  const lowGroups = useMemo(() => lowestGroups(groups.data ?? [], 3), [groups.data]);
  const lateTeachers = useMemo(() => teacherIssues(lessons.data?.items ?? [], 3), [lessons.data]);

  const dayLabel = relativeDayLabel(date, today);
  const updated = clockNow(overview.updatedAt);
  const subtitle = `${dayLabel ? `${dayLabel}, ` : ''}${formatUzDate(date, { weekday: !dayLabel })}`;

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
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden sm:inline-flex' })}
          aria-label="Katta ekran ko'rinishini yangi oynada ochish"
        >
          <MonitorUp size={15} aria-hidden="true" />
          Katta ekran
        </a>
      )}
      {canData && (
        <IconButton icon={RefreshCw} label="Yangilash" variant="secondary" size="sm" loading={overview.fetching} onClick={refreshNow} />
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
  const staffExpected = staff ? staff.present + staff.absent + staff.notYet : 0;
  const teacherRate = data ? teacherOnTimeRate(data.teachers) : null;
  const camerasOffline = data ? Math.max(0, data.cameras.active - data.cameras.online) : 0;
  const loadingTiles = overview.loading && !data;
  // Talabalar yuzi hali yetarli emas — markaz xodimlardan boshlanadi.
  const staffFirst = Boolean(data && !data.studentsDataAvailable);

  const headCounts = staffFirst ? staff ?? null : s ?? null;

  const daily = staffTrend.data?.daily ?? [];
  const cmp = staffComparison(daily, date);
  type DayCounts = { present: number; late: number; absent: number };
  // Birliksiz "+5" nimani bildirishi noma'lum edi — bular odam soni.
  const deltaTexts = (pick: (d: DayCounts) => number, current: number | undefined): string[] => {
    if (current === undefined) return [];
    const out: string[] = [];
    const fmt = (label: string, base: number) => {
      const diff = current - base;
      return `${label}: ${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${formatNumber(Math.abs(diff))} ta`;
    };
    if (cmp.previous) out.push(fmt(cmp.previousLabel, pick(cmp.previous)));
    if (cmp.lastWeek) out.push(fmt(cmp.lastWeekLabel, pick(cmp.lastWeek)));
    return out;
  };

  const studentsLink = canStudentsPages ? withDate('/talabalar') : undefined;
  const teachersLink = canStudentsPages ? withDate('/oqituvchilar') : undefined;

  // Asosiy taxta — hukm kim haqida bo'lsa o'sha kesim.
  const primaryBoard: BoardItem[] = staffFirst
    ? worstFirst(unitBoardItems(units.data))
    : worstFirst(facultyBoardItems(data?.byFaculty ?? null));

  const attentionInput = {
    events:
      isToday && canEvents && data
        ? { highOpen: data.events.highOpen, overdue: data.events.overdue, top: topEvents.data?.items ?? [], link: (q?: string) => `/hodisalar${q ? `?${q}` : ''}` }
        : null,
    cameras: isToday && data ? { offline: camerasOffline, active: data.cameras.active, link: cameraLink } : null,
    groups: lowGroups,
    teacherLessons: lateTeachers,
  };
  const attentionCount = countAttentionIssues(attentionInput);

  // ── Ko'rsatkichlar: hukm ko'rsatmagan narsalar. Svetofor faqat
  // foizlarda — yalang'och sonning "yaxshi/yomon"ligi bo'linma
  // kattaligini bilmasdan aytilmaydi.
  const indicators: Indicator[] = [];
  if (staffFirst) {
    indicators.push({
      label: 'Talabalar yuzi',
      value: data ? formatNumber(data.students.enrolled) : '—',
      suffix: data ? `/ ${formatNumber(data.students.total)}` : null,
      to: studentsLink ?? null,
      loading: loadingTiles,
    });
  } else {
    indicators.push(
      {
        label: 'Xodimlar keldi',
        value: staff ? formatNumber(staff.present) : '—',
        suffix: staff ? `/ ${formatNumber(staffExpected)}` : null,
        verdict: rag(staff && staffExpected > 0 ? staff.rate : null, RATE_RAG),
        deltas: deltaTexts((d) => d.present, staff?.present),
        to: teachersLink ?? null,
        loading: loadingTiles,
      },
      {
        label: 'Xodimlar kelmadi',
        value: staff ? formatNumber(staff.absent) : '—',
        tone: staff && staff.absent > 0 ? 'danger' : undefined,
        deltas: deltaTexts((d) => d.absent, staff?.absent),
        to: teachersLink ?? null,
        loading: loadingTiles,
      },
    );
  }
  indicators.push({
    label: 'Takror kechikkan',
    // Ma'lumot kelmaganda "0" yozish xato: "—" nol degani emas.
    value: chronic.data ? formatNumber(chronic.data.length) : '—',
    tone: !chronic.data ? 'muted' : chronic.data.length > 0 ? 'warning' : undefined,
    to: canStudentsPages ? withDate('/oqituvchilar?tab=surunkali') : null,
    loading: chronic.loading && !chronic.data,
  });
  if (hasLessons) {
    indicators.push(
      {
        label: 'Darsga vaqtida',
        value: formatPercent(teacherRate),
        verdict: rag(teacherRate, RATE_RAG),
        to: teachersLink ?? null,
        loading: loadingTiles,
      },
      {
        label: 'Darslar',
        value: formatNumber(isToday ? data?.lessons.finished : data?.lessons.total),
        suffix: data && isToday ? `/ ${formatNumber(data.lessons.total)}` : null,
        loading: loadingTiles,
      },
    );
  }
  indicators.push(
    {
      label: 'Kameralar',
      value: formatNumber(data?.cameras.online),
      suffix: data ? `/ ${formatNumber(data.cameras.active)}` : null,
      tone: camerasOffline > 0 ? 'warning' : undefined,
      to: cameraLink,
      loading: loadingTiles,
    },
    {
      label: 'Hodisalar',
      value: formatNumber(isToday ? data?.events.open : data?.events.today),
      tone: isToday && data ? (data.events.highOpen > 0 ? 'danger' : data.events.open > 0 ? 'warning' : undefined) : undefined,
      to: canEvents ? (isToday ? '/hodisalar' : `/hodisalar?from=${date}&to=${date}&korinish=jurnal`) : null,
      loading: loadingTiles,
    },
  );

  const sourceLamp = !isToday ? (
    <StatusLamp status="idle" label="Yakuniy" />
  ) : live ? (
    <StatusLamp status="ok" label="Jonli" pulse />
  ) : (
    // Soket ulanmagan bo'lsa "Jonli" deyish — yolg'on tinchlik.
    <StatusLamp status="warn" label={updated ?? 'Kutilmoqda'} />
  );

  return (
    <Page title="Institut holati" subtitle={subtitle} actions={big ? undefined : actions}>
      <div className="flex min-w-0 flex-col gap-3">
        {overview.error && !data ? (
          <ErrorState variant="block" title="Ma'lumot olinmadi" message={overview.error} onRetry={overview.reload} />
        ) : (
          <>
            {overview.error && data && (
              <ErrorState title="Yangilanmadi" message={overview.error} onRetry={overview.reload} />
            )}

            {/* 1. Institut ishlayaptimi — bitta hukm. */}
            <IntelPanel title="Umumiy hukm" right={sourceLamp}>
              <VerdictHeadline
                scopeLabel={staffFirst ? 'Xodimlar' : 'Talabalar'}
                counts={headCounts}
                isToday={isToday}
                loading={loadingTiles}
              />
            </IntelPanel>

            {/* 2. Muammo qayerda — holat taxtasi, yomoni birinchi. */}
            <IntelPanel
              brackets={false}
              title={staffFirst ? "Bo'linmalar" : 'Fakultetlar'}
              code={`${formatNumber(primaryBoard.length)} ta`}
            >
              <UnitsBoard
                items={primaryBoard}
                loading={staffFirst ? units.loading && !units.data : loadingTiles}
                error={staffFirst ? units.error : overview.error}
                onRetry={staffFirst ? units.reload : overview.reload}
                onOpen={
                  canStudentsPages
                    ? (id) => {
                        const path = staffFirst ? situationPaths.kafedra(id) : situationPaths.faculty(id);
                        navigate(withDate(path));
                      }
                    : undefined
                }
                emptyTitle="Ma'lumot yo'q"
                errorTitle="Ro'yxat olinmadi"
              />
            </IntelPanel>

            {/* 3. Nima qaror talab qiladi. */}
            <IntelPanel
              brackets={false}
              title="Chora talab qiladi"
              code={`${formatNumber(attentionCount)} ta`}
              className={attentionCount > 0 ? 'border-danger/50' : undefined}
            >
              <AttentionPanel
                loading={loadingTiles || (groups.loading && !groups.data)}
                events={attentionInput.events}
                cameras={attentionInput.cameras}
                groups={lowGroups}
                groupLink={canStudentsPages ? (name) => withDate(situationPaths.group(name)) : null}
                teacherLessons={lateTeachers}
                teacherLink={canStudentsPages ? (lesson) => (lesson.teacherId ? withDate(situationPaths.person(lesson.teacherId)) : null) : null}
                unavailable={[
                  groups.error && !groups.data ? 'Guruhlar' : null,
                  isToday && canEvents && topEvents.error && !topEvents.data ? 'Hodisalar' : null,
                  canLessons && hasLessons && lessons.error && !lessons.data ? 'Darslar' : null,
                ].filter((x): x is string => Boolean(x))}
                big={big}
              />
            </IntelPanel>

            {/* 4. Yordamchi panel — qolgan raqamlar. */}
            <IntelPanel brackets={false} title="Ko'rsatkichlar">
              <IndicatorTable items={indicators} />
            </IntelPanel>
          </>
        )}
      </div>
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
      title="Ruxsat yo'q"
      description="Administratorga murojaat qiling."
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
