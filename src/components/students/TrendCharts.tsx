import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber, formatPercent, formatUzDate, useChartTheme } from '../../ui';
import type { TrendPoint } from '../../lib/situationApi';
import { UZ_WEEKDAYS_SHORT, parseIsoDate } from '../../lib/uzDate';

function dayTick(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getUTCDate()} ${UZ_WEEKDAYS_SHORT[(d.getUTCDay() + 6) % 7]}`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}

/** Kunlik davomat foizi (bitta seriya, 0–100% o'q). */
export function RateTrendChart({ points, height = 240, target = 85 }: { points: readonly TrendPoint[]; height?: number; target?: number }) {
  const theme = useChartTheme();
  const data = useMemo(() => points.map((p) => ({ ...p, label: dayTick(p.date) })), [points]);
  return (
    <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]" role="img" aria-label="Kunlik davomat foizi grafigi">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rate-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={0.18} />
              <stop offset="100%" stopColor={theme.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={theme.axisTick} tickLine={false} axisLine={false} width={42} />
          <ReferenceLine y={target} stroke={theme.success} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Tooltip
            {...theme.tooltip}
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
            labelFormatter={(_, payload) => {
              const date = payload?.[0]?.payload?.date as string | undefined;
              return date ? formatUzDate(date, { weekday: true, year: false }) : '';
            }}
            formatter={(value) => [value === null || value === undefined ? "Ma'lumot yo'q" : formatPercent(Number(value), 1), 'Davomat']}
          />
          <Area
            type="monotone"
            dataKey="rate"
            stroke={theme.primary}
            strokeWidth={2}
            fill="url(#rate-fill)"
            connectNulls
            dot={{ r: 3, fill: theme.primary, stroke: theme.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: theme.primary, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Kunlik holatlar: vaqtida / kech / kelmadi (sonlar, yig'ma ustunlar). */
export function StatusTrendChart({ points, height = 220 }: { points: readonly TrendPoint[]; height?: number }) {
  const theme = useChartTheme();
  const data = useMemo(
    () => points.map((p) => ({ date: p.date, label: dayTick(p.date), onTime: Math.max(0, p.present - p.late), late: p.late, absent: p.absent })),
    [points],
  );
  const names: Record<string, string> = { onTime: 'Keldi', late: 'Kech keldi', absent: 'Kelmadi' };
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-3 text-xs text-muted" aria-label="Rang izohi">
        <LegendDot color={theme.attendance.keldi} label="Keldi" />
        <LegendDot color={theme.attendance.kechKeldi} label="Kech keldi" />
        <LegendDot color={theme.attendance.kelmadi} label="Kelmadi" />
      </ul>
      <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]" role="img" aria-label="Kunlik holatlar grafigi">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={42} />
            <Tooltip
              {...theme.tooltip}
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined;
                return date ? formatUzDate(date, { weekday: true, year: false }) : '';
              }}
              formatter={(value, name) => [formatNumber(Number(value)), names[String(name)] ?? String(name)]}
            />
            <Bar dataKey="onTime" stackId="s" fill={theme.attendance.keldi} stroke={theme.surface} strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="late" stackId="s" fill={theme.attendance.kechKeldi} stroke={theme.surface} strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="absent" stackId="s" fill={theme.attendance.kelmadi} stroke={theme.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function minutesToClock(value: number): string {
  const m = Math.round(value);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Kunlik kelish vaqti (bitta seriya). Kelmagan kunlar bo'sh qoladi. */
export function ArrivalTimeChart({ points, height = 200 }: { points: ReadonlyArray<{ date: string; minutes: number | null }>; height?: number }) {
  const theme = useChartTheme();
  const data = useMemo(() => points.map((p) => ({ ...p, label: dayTick(p.date) })), [points]);
  const values = points.map((p) => p.minutes).filter((m): m is number => m !== null);
  const min = values.length ? Math.floor((Math.min(...values) - 15) / 30) * 30 : 420;
  const max = values.length ? Math.ceil((Math.max(...values) + 15) / 30) * 30 : 600;
  return (
    <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]" role="img" aria-label="Kunlik kelish vaqti grafigi">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} interval="preserveStartEnd" minTickGap={10} />
          <YAxis domain={[min, max]} reversed tickFormatter={minutesToClock} tick={theme.axisTick} tickLine={false} axisLine={false} width={46} />
          <Tooltip
            {...theme.tooltip}
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
            labelFormatter={(_, payload) => {
              const date = payload?.[0]?.payload?.date as string | undefined;
              return date ? formatUzDate(date, { weekday: true, year: false }) : '';
            }}
            formatter={(value) => [value === null || value === undefined ? '—' : minutesToClock(Number(value)), 'Kelgan vaqti']}
          />
          <Area
            type="monotone"
            dataKey="minutes"
            stroke={theme.primary}
            strokeWidth={2}
            fill="none"
            dot={{ r: 3, fill: theme.primary, stroke: theme.surface, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
