import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Camera,
  Lock,
  MonitorUp,
  Presentation,
  RefreshCw,
} from 'lucide-react';
import { api, buildQuery, type Page as ApiPage } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { branding } from '../../lib/branding';
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
  Button,
  ButtonLink,
  DocumentFooter,
  DocumentHeader,
  EmptyState,
  ErrorState,
  IconButton,
  IntelPanel,
  MicroLabel,
  Page,
  StatusLamp,
  buttonClasses,
  formatNumber,
  formatPercent,
  formatUzDate,
  relativeDayLabel,
  useShell,
} from '../../ui';
import { RAG_LETTER, RATE_RAG, rag } from '../../ui/rag';
import type { BoardItem } from '../../components/hisobot/board';
import { ArrivalsChart } from '../../components/situation/ArrivalsChart';
import { AttentionPanel, countAttentionIssues } from '../../components/situation/AttentionPanel';
import { EnrollmentCampaign } from '../../components/situation/EnrollmentCampaign';
import { IndicatorTable, type Indicator } from '../../components/situation/IndicatorTable';
import { LessonsTimeline } from '../../components/situation/LessonsTimeline';
import { LiveArrivals } from '../../components/situation/LiveArrivals';
import { UnitsBoard } from '../../components/situation/UnitsBoard';
import { VerdictHeadline } from '../../components/situation/VerdictHeadline';
import {
  arrivalFromMessage,
  facultyBoardItems,
  hourOf,
  lowestGroups,
  mergeArrivals,
  share,
  shiftIso,
  situationReference,
  staffComparison,
  teacherIssues,
  teacherOnTimeRate,
  unitBoardItems,
  worstFirst,
  type SituationMode,
} from '../../components/situation/situationUtils';
import { useLiveResource, useRefreshTicker } from '../../components/situation/useLiveResource';

const FRESH_MS = 8_000;

function clockNow(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
}

/** Hujjat tamg'asi: "21.09.2026, 08:31" — institut (Toshkent) vaqtida. */
function stamp(ms: number | null): string {
  const value = ms ? new Date(ms) : new Date();
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(value);
  } catch {
    return value.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * "Institut holati" — rahbar ochadigan birinchi ekran.
 *
 * Ekran uchta savolga shu TARTIBDA javob beradi va bunga varaqlash
 * kerak emas:
 *   1. Institut ishlayaptimi?   — bitta katta hukm + svetofor.
 *   2. Muammo qayerda?          — bo'linmalar holat taxtasi, yomoni birinchi.
 *   3. Nima qaror talab qiladi? — "chora talab qiladi" ro'yxati.
 *   4. Tafsilot                 — ko'rsatkichlar, kelish dinamikasi, kameralar.
 *
 * Yuqorida hujjat blanki turadi: tashkilot, hujjat raqami va tuzilgan
 * vaqti — ekrandagi ko'rinish chop etilgan varaq bilan bir xil bo'lsin.
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
      // Taymer o'z vaqti kelganda ro'yxatdan chiqariladi: sahifa soatlab
      // ochiq turganda ro'yxat cheksiz o'sib ketmasin (xotira oqishi).
      const timerId = window.setTimeout(() => {
        freshTimers.current = freshTimers.current.filter((id) => id !== timerId);
        setFreshIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, FRESH_MS);
      freshTimers.current.push(timerId);
      bump();
    },
    [date, bump],
  );
  // Jonli kelishlar davomat ma'lumotidir — hodisalarni ko'rish huquqiga
  // bog'lash xato edi: faqat davomat huquqi bor rahbar jonli oqimni
  // umuman ko'rmasdi.
  const liveWanted = isToday && canData;
  useLiveAttendance(onAttendance, liveWanted);
  // Ulanish holati soketdan olinadi: ilgari ulanish yo'q bo'lsa ham
  // sarlavhada "Jonli" yozuvi turaverardi.
  const liveStatus = useLiveEvents(bump, isToday && canEvents, bump);
  const live = liveWanted && liveStatus === 'live';

  const data = overview.data;
  const arrivals = useMemo(() => mergeArrivals(liveArrivals, data?.lastArrivals ?? [], 8), [liveArrivals, data]);
  const lowGroups = useMemo(() => lowestGroups(groups.data ?? [], 3), [groups.data]);
  const lateTeachers = useMemo(() => teacherIssues(lessons.data?.items ?? [], 3), [lessons.data]);

  const dayLabel = relativeDayLabel(date, today);
  const updated = clockNow(overview.updatedAt);
  const subtitle = (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>Kim keldi, kim kelmadi va nimaga e&apos;tibor kerak.</span>
      <span className="text-subtle">
        · {dayLabel ? `${dayLabel}, ` : ''}
        {formatUzDate(date, { weekday: !dayLabel })}
      </span>
    </span>
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
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden sm:inline-flex' })}
          title="Devor ekrani uchun alohida oynada ochish"
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
  const expected = s ? s.present + s.absent + s.notYet : 0;
  const staffExpected = staff ? staff.present + staff.absent + staff.notYet : 0;
  const teacherRate = data ? teacherOnTimeRate(data.teachers) : null;
  const camerasOffline = data ? Math.max(0, data.cameras.active - data.cameras.online) : 0;
  const loadingTiles = overview.loading && !data;
  // Talabalar yuzi hali yetarli emas — markaz xodimlardan boshlanadi.
  const staffFirst = Boolean(data && !data.studentsDataAvailable);
  const mode: SituationMode = staffFirst ? 'xodimlar' : 'talabalar';

  // Hujjat raqami EKRAN HOLATIDAN chiqadi (kun + kesim): bir xil holat —
  // doim bir xil kod, render vaqtiga bog'liq emas.
  const reference = situationReference({ date, mode, isToday });
  const generatedAt = stamp(overview.updatedAt);

  const headCounts = staffFirst ? staff ?? null : s ?? null;
  const headExpected = staffFirst ? staffExpected : expected;
  const headTone = rag(headCounts && headExpected > 0 ? headCounts.rate : null, RATE_RAG);

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
  const chronicList = chronic.data ?? [];
  const chronicCount = chronicList.length;
  const chronicAbsent = chronicList.filter((c) => c.reasons.includes('kelmadi')).length;
  const chronicLate = chronicList.filter((c) => c.reasons.includes('kech_keldi')).length;

  const studentsLink = canStudentsPages ? withDate('/talabalar') : undefined;
  const teachersLink = canStudentsPages ? withDate('/oqituvchilar') : undefined;

  // ── Holat taxtasi kataklari. Asosiy taxta — hukm kim haqida bo'lsa
  // o'sha kesim; ikkinchisi quyida, tafsilot sifatida turadi.
  const unitItems: BoardItem[] = worstFirst(unitBoardItems(units.data));
  const facultyItems: BoardItem[] = worstFirst(facultyBoardItems(data?.byFaculty ?? null));
  const primaryBoard = staffFirst ? unitItems : facultyItems;
  const secondaryBoard = staffFirst ? facultyItems : unitItems;

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

  // ── Ko'rsatkichlar jadvali. Svetofor faqat foizlarda: yalang'och
  // sonning "yaxshi/yomon"ligi bo'linma kattaligini bilmasdan aytilmaydi.
  const indicators: Indicator[] = [];
  const pushIndicator = (item: Indicator) => indicators.push(item);
  const nextCode = () => `IND-${String(indicators.length + 1).padStart(2, '0')}`;

  pushIndicator({
    code: nextCode(),
    label: 'Xodimlar keldi',
    value: staff ? formatNumber(staff.present) : '—',
    suffix: staff ? `/ ${formatNumber(staffExpected)}` : null,
    verdict: rag(staff && staffExpected > 0 ? staff.rate : null, RATE_RAG),
    note: staff ? `Ro'yxatda ${formatNumber(staff.total)} xodim · yuzi ro'yxatdan o'tgani ${formatNumber(staff.enrolled)} ta` : null,
    deltas: deltaTexts((d) => d.present, staff?.present),
    to: teachersLink ?? null,
    loading: loadingTiles,
  });
  pushIndicator({
    code: nextCode(),
    label: 'Kech kelgan xodimlar',
    value: staff ? formatNumber(staff.late) : '—',
    tone: staff && staff.late > 0 ? 'warning' : undefined,
    note: staff ? `Bugun kelgan xodimlarning ${formatPercent(share(staff.late, staff.present))} qismi` : null,
    deltas: deltaTexts((d) => d.late, staff?.late),
    to: teachersLink ?? null,
    loading: loadingTiles,
  });
  pushIndicator({
    code: nextCode(),
    label: 'Kelmagan xodimlar',
    value: staff ? formatNumber(staff.absent) : '—',
    tone: staff && staff.absent > 0 ? 'danger' : undefined,
    note: staff
      ? isToday && staff.notYet > 0
        ? `Yana ${formatNumber(staff.notYet)} kishi hali kelmagan`
        : `Kutilgan ${formatNumber(staffExpected)} xodimning ${formatPercent(share(staff.absent, staffExpected))} qismi`
      : null,
    deltas: deltaTexts((d) => d.absent, staff?.absent),
    to: teachersLink ?? null,
    loading: loadingTiles,
  });
  pushIndicator({
    code: nextCode(),
    label: 'Takroran kechikkan yoki kelmagan xodimlar',
    // Ma'lumot kelmaganda "0" yozish xato: "—" nol degani emas,
    // "hisoblanmadi" degani.
    value: chronic.data ? formatNumber(chronicCount) : '—',
    tone: !chronic.data ? 'muted' : chronicCount > 0 ? 'warning' : undefined,
    note: chronic.data
      ? chronicCount > 0
        ? `So'nggi 30 kunda: ${formatNumber(chronicAbsent)} kishi 3+ kun kelmagan · ${formatNumber(chronicLate)} kishi 3+ kun kech kelgan`
        : "So'nggi 30 kunda takror kechikkan yoki kelmagan xodim yo'q"
      : chronic.error
        ? `Hisoblab bo'lmadi: ${chronic.error}`
        : "So'nggi 30 kunlik ma'lumot hali hisoblanmadi",
    to: canStudentsPages ? withDate('/oqituvchilar?tab=surunkali') : null,
    loading: chronic.loading && !chronic.data,
  });
  if (!staffFirst) {
    pushIndicator({
      code: nextCode(),
      label: 'Talabalar keldi',
      value: s ? formatNumber(s.present) : '—',
      suffix: s ? `/ ${formatNumber(expected)}` : null,
      verdict: rag(s && expected > 0 ? s.rate : null, RATE_RAG),
      note: s ? `Ro'yxatda ${formatNumber(s.total)} talaba${s.noData ? ` · ${formatNumber(s.noData)} tasining holati aniqlanmagan` : ''}` : null,
      to: studentsLink ?? null,
      loading: loadingTiles,
    });
  } else {
    pushIndicator({
      code: nextCode(),
      label: 'Yuz topshirgan talabalar',
      value: data ? formatNumber(data.students.enrolled) : '—',
      suffix: data ? `/ ${formatNumber(data.students.total)}` : null,
      note: "Kamera faqat yuzi ro'yxatdan o'tganlarni taniydi. Talabalar davomati 5% dan boshlab ko'rsatiladi",
      to: studentsLink ?? null,
      loading: loadingTiles,
    });
  }
  if (hasLessons) {
    pushIndicator({
      code: nextCode(),
      label: "Darsga o'z vaqtida kirgan o'qituvchilar",
      value: formatPercent(teacherRate),
      verdict: rag(teacherRate, RATE_RAG),
      note: data
        ? data.teachers.scheduled > 0
          ? `Bugun darsi bor ${formatNumber(data.teachers.scheduled)} o'qituvchidan: ${formatNumber(data.teachers.late)} kech kirgan · ${formatNumber(data.teachers.absent)} kirmagan`
          : "Darsi bor o'qituvchi yo'q"
        : null,
      to: teachersLink ?? null,
      loading: loadingTiles,
    });
    pushIndicator({
      code: nextCode(),
      label: isToday ? 'Bugungi darslar' : 'Shu kungi darslar',
      value: formatNumber(isToday ? data?.lessons.finished : data?.lessons.total),
      suffix: data && isToday ? `/ ${formatNumber(data.lessons.total)}` : null,
      note: data
        ? isToday
          ? `${formatNumber(data.lessons.finished)} o'tgan · ${formatNumber(data.lessons.ongoing)} davom etmoqda · ${formatNumber(data.lessons.upcoming)} kutilmoqda`
          : `${formatNumber(data.lessons.total)} ta dars o'tgan`
        : null,
      loading: loadingTiles,
    });
  }
  pushIndicator({
    code: nextCode(),
    label: 'Ishlab turgan kameralar',
    value: formatNumber(data?.cameras.online),
    suffix: data ? `/ ${formatNumber(data.cameras.active)}` : null,
    tone: camerasOffline > 0 ? 'warning' : undefined,
    note: data
      ? camerasOffline > 0
        ? `${formatNumber(data.cameras.active)} ta ishlashi kerak, ${formatNumber(camerasOffline)} tasi aloqada emas`
        : `${formatNumber(data.cameras.videoFlowing)} tasi hozir tasvir uzatmoqda`
      : null,
    to: cameraLink,
    loading: loadingTiles,
  });
  pushIndicator({
    code: nextCode(),
    label: isToday ? 'Hal qilinmagan hodisalar' : 'Shu kuni qayd etilgan hodisalar',
    value: formatNumber(isToday ? data?.events.open : data?.events.today),
    tone: isToday && data ? (data.events.highOpen > 0 ? 'danger' : data.events.open > 0 ? 'warning' : undefined) : undefined,
    note: data
      ? isToday
        ? `Shundan ${formatNumber(data.events.highOpen)} tasi juda muhim · ${formatNumber(data.events.overdue)} tasining muddati o'tgan · bugun jami ${formatNumber(data.events.today)} ta`
        : 'Kameralar dasturi shu kuni qayd etgan holatlar'
      : null,
    to: canEvents ? (isToday ? '/hodisalar' : `/hodisalar?from=${date}&to=${date}&korinish=jurnal`) : null,
    loading: loadingTiles,
  });

  const sourceLamp = !isToday ? (
    <StatusLamp status="idle" label="Kun yakunlangan" />
  ) : live ? (
    <StatusLamp status="ok" label="Jonli" pulse />
  ) : (
    // Soket ulanmagan bo'lsa "Jonli" deyish — yolg'on tinchlik.
    <StatusLamp status="warn" label={updated ? `${updated} holatiga ko'ra` : "Ma'lumot kutilmoqda"} />
  );

  return (
    <Page title="Institut holati" subtitle={subtitle} actions={big ? undefined : actions}>
      <div className="flex min-w-0 flex-col gap-3">
        {/* 0. Hujjat blanki: kim, nima, qaysi kun, qaysi raqam ostida. */}
        <DocumentHeader
          org={branding.orgFullName}
          title="Institut holati — kunlik ma'lumotnoma"
          reference={reference}
          generatedAt={generatedAt}
          readouts={[
            { label: 'Qamrov', value: branding.orgName, title: branding.orgFullName },
            { label: 'Kun', value: formatUzDate(date, { weekday: true }), title: dayLabel ?? undefined },
            {
              label: 'Kesim',
              value: staffFirst ? 'Xodimlar' : 'Talabalar',
              title: staffFirst ? "Talabalar yuzi yetarli emas — hukm xodimlar bo'yicha" : undefined,
            },
            {
              label: "Ro'yxatda",
              value: headCounts ? `${formatNumber(headCounts.total)} kishi` : '—',
            },
            {
              label: 'Umumiy holat',
              value: `${headCounts && headExpected > 0 ? formatPercent(headCounts.rate) : '—'} ${RAG_LETTER[headTone]}`,
            },
            { label: 'Manba', value: updated ? `${updated} · ${isToday ? 'jonli' : 'yakuniy'}` : "Ma'lumot kutilmoqda" },
          ]}
        />

        {overview.error && !data ? (
          <ErrorState variant="block" title="Bugungi holatni serverdan olib bo'lmadi" message={overview.error} onRetry={overview.reload} />
        ) : (
          <>
            {overview.error && data && (
              <ErrorState
                title="Oxirgi yangilanish muvaffaqiyatsiz"
                message={`${overview.error}. Ekrandagi ma'lumot ${updated ?? ''} holatiga ko'ra.`}
                onRetry={overview.reload}
              />
            )}

            {/* 1. Institut ishlayaptimi — bitta hukm. */}
            <IntelPanel title="Umumiy hukm" code={reference} right={sourceLamp}>
              <VerdictHeadline
                scopeLabel={staffFirst ? 'Xodimlar davomati' : 'Talabalar davomati'}
                counts={headCounts}
                isToday={isToday}
                loading={loadingTiles}
                note={
                  staffFirst && !loadingTiles && data
                    ? `Talabalarning atigi ${formatPercent(data.studentsEnrolledPct ?? 0, (data.studentsEnrolledPct ?? 0) < 1 ? 2 : 1)} yuzi tasdiqlangan — shuning uchun hukm xodimlar davomati bo'yicha chiqarilgan. Talabalar davomati yuzlar yetarli bo'lgach avtomatik yoqiladi.`
                    : undefined
                }
              />
            </IntelPanel>

            {/* 2. Muammo qayerda — holat taxtasi, yomoni birinchi. */}
            <IntelPanel
              title={staffFirst ? "Bo'linmalar holati" : 'Fakultetlar holati'}
              code={`${formatNumber(primaryBoard.length)} ta`}
              right={<MicroLabel>Yomoni birinchi</MicroLabel>}
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
                countedLabel={
                  staffFirst
                    ? `${formatNumber(primaryBoard.length)} ta bo'linma ${isToday ? 'bugun' : 'shu kuni'} ishga kelgan xodimlar ulushi bo'yicha saralandi`
                    : `${formatNumber(primaryBoard.length)} ta fakultet ${isToday ? 'bugungi' : 'shu kungi'} talabalar davomati bo'yicha saralandi`
                }
                emptyTitle={staffFirst ? "Bo'linmalarni hali taqqoslab bo'lmaydi" : 'Fakultetlar kiritilmagan'}
                emptyDescription={
                  staffFirst
                    ? isToday
                      ? "Bugun hali birorta xodim kamerada ko'rinmadi. Xodimlar kela boshlagach taxta o'zi to'ladi."
                      : "Bu kunda hech bir bo'linma bo'yicha davomat yozuvi yo'q."
                    : "«Tashkiliy tuzilma» bo'limida fakultetlar va ularga talabalar qo'shilgach shu yerda ko'rinadi."
                }
                errorTitle={staffFirst ? "Bo'linmalar ro'yxatini olib bo'lmadi" : "Fakultetlar ro'yxatini olib bo'lmadi"}
              />
            </IntelPanel>

            {/* 3. Nima qaror talab qiladi. */}
            <IntelPanel
              title="Chora talab qiladi"
              code={`${formatNumber(attentionCount)} ta`}
              className={attentionCount > 0 ? 'border-danger/50' : undefined}
              right={<MicroLabel>Hozir aralashuv kerak</MicroLabel>}
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
                isToday={isToday}
                big={big}
              />
            </IntelPanel>

            {/* 4. Tafsilot — zich panellar. */}
            <div className="grid min-w-0 gap-3 xl:grid-cols-2">
              <IntelPanel title="Ko'rsatkichlar" code={`${formatNumber(indicators.length)} ta`} className="xl:col-span-2">
                <IndicatorTable items={indicators} />
              </IntelPanel>

              <IntelPanel title="Odamlar soat nechada keldi" code={date.replace(/-/g, '')}>
                <ArrivalsChart
                  rows={data?.arrivalsByHour ?? null}
                  loading={loadingTiles}
                  currentHour={isToday && data ? hourOf(data.generatedAt) : null}
                  isToday={isToday}
                  big={big}
                />
              </IntelPanel>

              {isToday && (
                <IntelPanel title="So'nggi kelganlar" code={`${formatNumber(arrivals.length)} ta`} right={sourceLamp}>
                  <LiveArrivals
                    items={arrivals}
                    loading={loadingTiles}
                    freshIds={freshIds}
                    personLink={canStudentsPages ? (id) => withDate(situationPaths.person(id)) : null}
                    big={big}
                  />
                </IntelPanel>
              )}

              {secondaryBoard.length > 0 && (
                <IntelPanel
                  title={staffFirst ? 'Fakultetlar holati' : "Bo'linmalar holati"}
                  code={`${formatNumber(secondaryBoard.length)} ta`}
                  right={<MicroLabel>Yomoni birinchi</MicroLabel>}
                  className="xl:col-span-2"
                >
                  <UnitsBoard
                    items={secondaryBoard}
                    loading={staffFirst ? loadingTiles : units.loading && !units.data}
                    error={staffFirst ? overview.error : units.error}
                    onRetry={staffFirst ? overview.reload : units.reload}
                    countedLabel={
                      staffFirst
                        ? `${formatNumber(secondaryBoard.length)} ta fakultet talabalar davomati bo'yicha saralandi`
                        : `${formatNumber(secondaryBoard.length)} ta bo'linma xodimlar davomati bo'yicha saralandi`
                    }
                    emptyTitle="Ma'lumot yo'q"
                    emptyDescription="Bu kesim bo'yicha davomat yozuvi yo'q."
                    errorTitle="Ro'yxatni olib bo'lmadi"
                  />
                </IntelPanel>
              )}

              {staffFirst && (
                <IntelPanel title="Yuz topshirish kampaniyasi" code="ENR" className="xl:col-span-2">
                  <EnrollmentCampaign
                    data={enrollment.data}
                    loading={enrollment.loading && !enrollment.data}
                    error={enrollment.error}
                    onRetry={enrollment.reload}
                    link={studentsLink}
                    facultyLink={canStudentsPages ? (id) => withDate(situationPaths.faculty(id)) : null}
                    big={big}
                  />
                </IntelPanel>
              )}

              {canLessons && hasLessons && (
                <IntelPanel
                  title={isToday ? 'Bugungi darslar' : 'Shu kungi darslar'}
                  code={`${formatNumber(data?.lessons.total)} ta`}
                  className="xl:col-span-2"
                >
                  <LessonsTimeline
                    lessons={lessons.data?.items ?? null}
                    loading={lessons.loading && !lessons.data}
                    error={lessons.data ? null : lessons.error}
                    onRetry={lessons.reload}
                    isToday={isToday}
                    big={big}
                  />
                </IntelPanel>
              )}
            </div>

            <DocumentFooter
              note={`Xizmat uchun. Ma'lumotnoma ${reference} raqami bilan tizimda tuzilgan; sonlar ${formatUzDate(date)} kuni uchun${updated ? `, oxirgi yangilanish ${updated}` : ''}.`}
            />
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
