import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Brain, ChartNoAxesColumn, Moon, Presentation, Timer } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorState, SkeletonCard, SkeletonTiles, StatTile, formatPercent, formatUzRange, toneForRate, useChartTheme } from '../../ui';
import { analyzeLessonSessions, getLessonSessionsInRange } from '../../lib/teachersApi';
import { useLoader } from '../teachers/useLoader';

export interface LessonAnalyticsProps {
  from: string;
  to: string;
  /** Fakultet NOMI (dars jadvalidagi kabi). */
  faculty?: string;
  group?: string;
}

const TOP_TEACHERS = 12;

/** Dars sifati tahlili: talaba diqqati trendi, o'qituvchilar faolligi,
 *  uxlash holatlari va o'z vaqtida kelish — dars monitoring yozuvlaridan. */
export function LessonAnalytics({ from, to, faculty, group }: LessonAnalyticsProps) {
  const theme = useChartTheme();
  const key = from <= to ? `${from}:${to}:${faculty ?? ''}:${group ?? ''}` : null;
  const sessions = useLoader(key, (signal) => getLessonSessionsInRange(from, to, { faculty, group }, { signal }), { group: 'analytics' });
  const stats = useMemo(() => (sessions.data ? analyzeLessonSessions(sessions.data) : null), [sessions.data]);

  if (sessions.error && !sessions.data) return <ErrorState variant="block" message={sessions.error} onRetry={sessions.reload} />;
  if (!stats) {
    return (
      <div className="flex flex-col gap-5">
        <SkeletonTiles count={4} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      </div>
    );
  }

  const teachers = stats.activityByTeacher.slice(0, TOP_TEACHERS);
  const period = formatUzRange(from, to);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="O'rtacha diqqat" icon={Brain} tone={toneForRate(stats.avgAttention)} value={formatPercent(stats.avgAttention)} progress={stats.avgAttention} hint={`${stats.sessions} dars · ${period}`} />
        <StatTile label="Uxlash holatlari" icon={Moon} tone={stats.sleepIncidents ? 'warning' : 'neutral'} value={stats.sleepIncidents} hint="Talabalar ko'zi yumuq holatlari" />
        <StatTile label="O'qituvchi faolligi" icon={Presentation} tone={toneForRate(stats.avgActivity)} value={formatPercent(stats.avgActivity)} progress={stats.avgActivity} />
        <StatTile label="Vaqtida kelish" icon={Timer} tone={toneForRate(stats.onTimeRate)} value={formatPercent(stats.onTimeRate)} progress={stats.onTimeRate} hint={`${stats.checked} ta tekshirilgan dars`} />
      </div>

      {stats.sessions === 0 ? (
        <EmptyState icon={ChartNoAxesColumn} title="Bu davrda dars monitoring yozuvlari yo'q" description="Davrni kengaytiring yoki filtrlarni tozalang." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Diqqat balli trendi" subtitle="Kun bo'yicha o'rtacha (faqat o'lchangan darslar)" />
            {stats.attentionByDay.length === 0 ? (
              <EmptyState compact bordered={false} title="Diqqat hali o'lchanmagan" />
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.attentionByDay} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={theme.grid} vertical={false} />
                    <XAxis dataKey="label" tick={theme.axisTick} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis domain={[0, 100]} tick={theme.axisTick} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...theme.tooltip} formatter={(v) => [`${v}%`, 'Diqqat']} />
                    <Line type="monotone" dataKey="diqqat" stroke={theme.primary} strokeWidth={2.25} dot={{ r: 2.5, fill: theme.primary }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="O'qituvchilar bo'yicha faollik"
              subtitle={stats.activityByTeacher.length > TOP_TEACHERS ? `Eng faol ${TOP_TEACHERS} ta (jami ${stats.activityByTeacher.length})` : "O'rtacha faollik bali"}
            />
            {teachers.length === 0 ? (
              <EmptyState compact bordered={false} title="Faollik hali o'lchanmagan" />
            ) : (
              <div style={{ height: Math.max(160, teachers.length * 28 + 24) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teachers} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={theme.grid} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={theme.axisTick} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="teacher" tick={theme.axisTick} axisLine={false} tickLine={false} width={120} />
                    <Tooltip {...theme.tooltip} formatter={(v, _n, item) => [`${v}% · ${(item?.payload as { darslar?: number })?.darslar ?? 0} dars`, 'Faollik']} />
                    <Bar dataKey="faollik" fill={theme.success} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
