import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock, GraduationCap, Hourglass, RefreshCw, ScanFace, UserX, Users } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, IconButton, Page, SkeletonCards, SkeletonTiles, StatTile, Toolbar, formatNumber, formatPercent, formatUzDate, useShell, useUrlTab, type TabItem } from '../../ui';
import { getOverview, situationPaths, type Overview } from '../../lib/situationApi';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { useViewDate } from '../../lib/viewDate';
import { LiveArrivals, type ArrivalItem } from '../../components/attendance/LiveArrivals';
import { QuickSearch } from '../../components/students/QuickSearch';
import { FacultyCard } from '../../components/students/UnitCards';
import { useAsyncData } from '../../components/students/useAsyncData';
import { EnrollmentCampaign } from '../../components/students/EnrollmentCampaign';

type ViewId = 'davomat' | 'yuz';
const VIEW_PARAM = 'korinish';

const REFRESH_MS = 60_000;
const FEED_SIZE = 10;

/** /talabalar — fakultetlar kesimida talabalar davomati. Yuzlar hali kam bo'lsa
 *  (studentsDataAvailable=false) asosiy ko'rinish — "Yuz topshirish" kampaniyasi. */
export default function FacultiesPage() {
  const { date, today, isToday, withDate } = useViewDate();
  const { presentation } = useShell();
  const overview = useAsyncData<Overview>(`ov|${date}`, (signal) => getOverview(date, { signal }), {
    refreshMs: isToday ? REFRESH_MS : undefined,
  });
  const data = overview.data;
  const [live, setLive] = useState<ArrivalItem[]>([]);
  useEffect(() => setLive([]), [date]);

  const reload = overview.reload;
  useLiveAttendance(
    useCallback(
      (m: LiveAttendanceMessage) => {
        if (m.personType !== 'talaba' || m.date !== date) return;
        setLive((prev) =>
          [{ personId: m.personId, fullName: m.fullName, unit: m.group, status: m.status, checkIn: m.checkIn }, ...prev.filter((p) => p.personId !== m.personId)].slice(0, FEED_SIZE),
        );
      },
      [date],
    ),
    isToday,
  );
  // Jonli xabarlar kelganda jami sonlar ham yangilansin (server keshi 15 s).
  useEffect(() => {
    if (!live.length) return;
    const id = window.setTimeout(reload, 5_000);
    return () => window.clearTimeout(id);
  }, [live, reload]);

  const arrivals = useMemo<ArrivalItem[]>(() => {
    const initial = (data?.lastArrivals ?? [])
      .filter((a) => a.type === 'talaba')
      .map((a) => ({ personId: a.id, fullName: a.fullName, photoUrl: a.photoUrl, unit: a.unit, status: a.status, checkIn: a.time }));
    const seen = new Set(live.map((l) => l.personId));
    return [...live, ...initial.filter((a) => !seen.has(a.personId))].slice(0, FEED_SIZE);
  }, [data, live]);

  const s = data?.students;
  const faculties = data?.byFaculty.filter((f) => f.total > 0 || f.id !== null) ?? [];
  const available = data ? data.studentsDataAvailable : true;
  const views: TabItem<ViewId>[] = [
    { id: 'davomat', label: 'Davomat', icon: CalendarCheck },
    { id: 'yuz', label: 'Yuz topshirish', icon: ScanFace },
  ];
  const defaultView: ViewId = available ? 'davomat' : 'yuz';
  const [view, setView] = useUrlTab(views, { param: VIEW_PARAM, defaultTab: defaultView });

  return (
    <Page
      title="Talabalar"
      subtitle={
        view === 'yuz'
          ? "Kamera talabani tanishi uchun uning yuzi oldindan ro'yxatdan o'tishi kerak. Bu yerda — kim topshirgan, kim yo'q"
          : `Har bir fakultetda bugun nechta talaba kelgani · ${formatUzDate(date, { weekday: true })}`
      }
      breadcrumbs={[{ label: 'Talabalar' }]}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={overview.reload} loading={overview.refreshing} />}
      tabs={data ? views : undefined}
      defaultTab={defaultView}
      tabParam={VIEW_PARAM}
      toolbar={
        !presentation && view === 'davomat' ? (
          <Toolbar>
            <QuickSearch date={date} withDate={withDate} />
          </Toolbar>
        ) : undefined
      }
    >
      {overview.loading ? (
        <>
          <SkeletonTiles count={5} className="xl:grid-cols-5" />
          <SkeletonCards count={4} />
        </>
      ) : overview.error && !data ? (
        <Card padding="none">
          <ErrorState variant="block" message={overview.error} onRetry={overview.reload} />
        </Card>
      ) : data && s && view === 'yuz' ? (
        <EnrollmentCampaign today={today} withDate={withDate} />
      ) : data && s ? (
        <>
          {!available && (
            <div className="flex flex-col gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-fg sm:flex-row sm:items-center">
              <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />
              <p className="flex-1">
                <span className="font-semibold">Talabalarning atigi {formatPercent(data.studentsEnrolledPct, 1)} qismi yuzini ro'yxatdan o'tkazgan.</span> Kamera
                qolganlarini taniy olmaydi, shuning uchun quyidagi foizlar {formatNumber(data.students.total)} emas, faqat{' '}
                {formatNumber(s.enrolled)} talaba bo'yicha hisoblangan — butun institut holatini aks ettirmaydi.
              </p>
              <Button size="sm" icon={ScanFace} onClick={() => setView('yuz')}>
                Yuz topshirishga o&apos;tish
              </Button>
            </div>
          )}
          {overview.error && <ErrorState title="Yangilab bo'lmadi" message={overview.error} onRetry={overview.reload} />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Kelgan talabalar ulushi"
              value={formatPercent(s.rate, 1)}
              icon={GraduationCap}
              tone="primary"
              progress={s.rate}
              hint={`Kutilgan ${formatNumber(s.present + s.absent + s.notYet)} talabadan ${formatNumber(s.present)} tasi keldi`}
              size={presentation ? 'lg' : 'md'}
            />
            <StatTile label="O'z vaqtida keldi" value={formatNumber(s.present - s.late)} icon={CheckCircle2} tone="success" hint="talaba" />
            <StatTile label="Kech keldi" value={formatNumber(s.late)} icon={Clock} tone="warning" hint="talaba" />
            <StatTile label="Kelmadi" value={formatNumber(s.absent)} icon={UserX} tone="danger" hint="talaba" />
            <StatTile
              label={isToday ? 'Hali kelmagan' : 'Holati aniqlanmagan'}
              value={formatNumber(isToday ? s.notYet : s.noData)}
              icon={isToday ? Hourglass : Users}
              hint={
                isToday
                  ? s.noData
                    ? `Yuzi ro'yxatdan o'tgan, hali ko'rinmagan · yana ${formatNumber(s.noData)} talabaning yuzi ro'yxatda yo'q`
                    : "Yuzi ro'yxatdan o'tgan, bugun hali ko'rinmagan"
                  : `Ro'yxatdagi ${formatNumber(s.total)} talabadan — yuzi yo'qligi uchun kamera tanimagan`
              }
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            {faculties.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="Fakultetlar kiritilmagan"
                description="Fakultetlar «Tashkiliy tuzilma» bo'limida qo'shiladi. Shundan keyin bu yerda har biri bo'yicha davomat ko'rinadi."
              />
            ) : (
              <div className="grid content-start gap-4 md:grid-cols-2">
                {faculties.map((f) => (
                  <FacultyCard
                    key={f.id ?? 'none'}
                    faculty={f}
                    to={withDate(situationPaths.faculty(f.id))}
                    enrollTo={withDate(`${situationPaths.faculty(f.id)}?${VIEW_PARAM}=yuz`)}
                  />
                ))}
              </div>
            )}
            <LiveArrivals items={arrivals} live={isToday} linkFor={(id) => withDate(situationPaths.person(id))} className="self-start" />
          </div>
        </>
      ) : null}
    </Page>
  );
}
