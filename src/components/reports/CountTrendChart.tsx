import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatUzDate, useChartTheme } from '../../ui';
import { UZ_WEEKDAYS_SHORT, parseIsoDate } from '../../lib/uzDate';

interface CountTrendChartProps {
  points: readonly { date: string; value: number | null }[];
  label: string;
  height?: number;
}

function dayTick(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getUTCDate()} ${UZ_WEEKDAYS_SHORT[(d.getUTCDay() + 6) % 7]}`;
}

/** Kunlik son (kechikishlar, signallar) — ustunli grafik. */
export default function CountTrendChart({ points, label, height = 240 }: CountTrendChartProps) {
  const theme = useChartTheme();
  const data = useMemo(() => points.map((p) => ({ ...p, label: dayTick(p.date) })), [points]);
  return (
    <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]" role="img" aria-label={`${label} — kunlar bo'yicha`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} interval="preserveStartEnd" minTickGap={10} />
          <YAxis allowDecimals={false} tick={theme.axisTick} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            {...theme.tooltip}
            cursor={{ fill: theme.grid }}
            labelFormatter={(_, payload) => {
              const date = payload?.[0]?.payload?.date as string | undefined;
              return date ? formatUzDate(date, { weekday: true, year: false }) : '';
            }}
            formatter={(value) => [value as number, label]}
          />
          <Bar dataKey="value" fill={theme.warning} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
