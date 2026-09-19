import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, GraduationCap, Hourglass, RefreshCw, UserX, Users } from 'lucide-react';
import { Card, EmptyState, ErrorState, IconButton, Page, SkeletonTiles, StatTile, Toolbar, formatNumber, formatPercent, formatUzDate, useShell } from '../../ui';
import { Skeleton } from '../../ui';
import { getOverview, situationPaths, type Overview } from '../../lib/situationApi';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { useViewDate } from '../../lib/viewDate';
import { LiveArrivals, type ArrivalItem } from '../../components/attendance/LiveArrivals';
import { QuickSearch } from '../../components/students/QuickSearch';
import { FacultyCard } from '../../components/students/UnitCards';
import { useAsyncData } from '../../components/students/useAsyncData';

const REFRESH_MS = 60_000;
const FEED_SIZE = 10;

/** /talabalar — fakultetlar kesimida talabalar davomati. */
export default function FacultiesPage() {
  const { date, isToday, withDate } = useViewDate();
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

  return (
    <Page
      title="Talabalar"
      subtitle={`Fakultetlar kesimida davomat · ${formatUzDate(date, { weekday: true })}`}
      breadcrumbs={[{ label: 'Talabalar' }]}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={overview.reload} loading={overview.refreshing} />}
      toolbar={
        !presentation ? (
          <Toolbar>
            <QuickSearch date={date} withDate={withDate} />
          </Toolbar>
        ) : undefined
      }
    >
      {overview.loading ? (
        <>
          <SkeletonTiles count={5} className="xl:grid-cols-5" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-card" />
            ))}
          </div>
        </>
      ) : overview.error && !data ? (
        <Card padding="none">
          <ErrorState variant="block" message={overview.error} onRetry={overview.reload} />
        </Card>
      ) : data && s ? (
        <>
          {overview.error && <ErrorState title="Yangilab bo'lmadi" message={overview.error} onRetry={overview.reload} />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Davomat"
              value={formatPercent(s.rate, 1)}
              icon={GraduationCap}
              tone="primary"
              progress={s.rate}
              hint={`${formatNumber(s.present)} / ${formatNumber(s.present + s.absent + s.notYet)} keldi`}
              size={presentation ? 'lg' : 'md'}
            />
            <StatTile label="Keldi" value={formatNumber(s.present - s.late)} icon={CheckCircle2} tone="success" hint="o'z vaqtida" />
            <StatTile label="Kech keldi" value={formatNumber(s.late)} icon={Clock} tone="warning" />
            <StatTile label="Kelmadi" value={formatNumber(s.absent)} icon={UserX} tone="danger" />
            <StatTile
              label={isToday ? 'Hali kelmagan' : "Ma'lumot yo'q"}
              value={formatNumber(isToday ? s.notYet : s.noData)}
              icon={isToday ? Hourglass : Users}
              hint={isToday && s.noData ? `+${formatNumber(s.noData)} yuzi yo'q` : `${formatNumber(s.total)} talabadan`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            {faculties.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Fakultetlar yo'q" description="Fakultetlar «Tuzilma» bo'limida qo'shiladi." />
            ) : (
              <div className="grid content-start gap-4 md:grid-cols-2">
                {faculties.map((f) => (
                  <FacultyCard key={f.id ?? 'none'} faculty={f} to={withDate(situationPaths.faculty(f.id))} />
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
