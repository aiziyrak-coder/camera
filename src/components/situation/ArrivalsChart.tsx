import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { Overview } from '../../lib/situationApi';
import { Card, CardHeader, EmptyState, Skeleton, cn, formatNumber, useChartTheme } from '../../ui';
import { peakHour } from './situationUtils';

// Barqaror havola: har renderda yangi obyekt recharts'ni qayta chizardi.
const CHART_MARGIN = { top: 20, right: 4, bottom: 0, left: 0 };

interface Props {
  rows: Overview['arrivalsByHour'] | null;
  loading: boolean;
  /** Bugun bo'lsa joriy soat belgilanadi. */
  currentHour: number | null;
  big?: boolean;
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** "Kelish dinamikasi": soatlar bo'yicha birinchi kelishlar (talaba + xodim). */
export function ArrivalsChart({ rows, loading, currentHour, big }: Props) {
  const theme = useChartTheme();
  const data = useMemo(() => (rows ?? []).map((row) => ({ ...row, label: String(row.hour).padStart(2, '0') })), [rows]);
  const peak = rows ? peakHour(rows) : null;
  const total = data.reduce((sum, row) => sum + row.students + row.staff, 0);
  const height = big ? 300 : 240;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Odamlar soat nechada keldi"
        subtitle={
          peak
            ? `Har bir ustun — o'sha soatda birinchi marta ko'ringan odamlar soni. Eng gavjum vaqt: ${pad(peak.hour)}–${pad(peak.hour + 1)}, ${formatNumber(peak.total)} kishi`
            : "Har bir ustun — o'sha soatda birinchi marta ko'ringan odamlar soni"
        }
        icon={TrendingUp}
        actions={
          <ul className="flex items-center gap-3 text-xs text-muted" aria-label="Rang izohi">
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: theme.series[0] }} aria-hidden="true" />
              Talabalar
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: theme.series[1] }} aria-hidden="true" />
              Xodimlar
            </li>
          </ul>
        }
      />
      {loading ? (
        <Skeleton className={cn('w-full', big ? 'h-[300px]' : 'h-[240px]')} />
      ) : total === 0 ? (
        <EmptyState
          compact
          bordered={false}
          icon={TrendingUp}
          title="Bugun hali hech kim ko'rinmadi"
          description="Kamera birinchi odamni taniganda ustunlar shu yerda paydo bo'ladi."
        />
      ) : (
        <div className="-ml-2 w-[calc(100%+0.5rem)]" style={{ height }} role="img" aria-label={`Kelish dinamikasi: jami ${total} kishi`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={CHART_MARGIN} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="label" tick={{ ...theme.axisTick, fontSize: big ? 13 : 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} interval={0} />
              <YAxis tick={{ ...theme.axisTick, fontSize: big ? 13 : 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip
                {...theme.tooltip}
                labelFormatter={(label) => {
                  const hour = Number(label);
                  return Number.isFinite(hour) ? `${pad(hour)}–${pad(hour + 1)}` : String(label);
                }}
                formatter={(value, name) => [formatNumber(Number(value)), name === 'students' ? 'Talabalar' : 'Xodimlar']}
              />
              {currentHour !== null && data.some((row) => row.hour === currentHour) && (
                <ReferenceLine x={String(currentHour).padStart(2, '0')} stroke={theme.primary} strokeDasharray="3 3" label={{ value: 'Hozir', position: 'top', fill: theme.primary, fontSize: 11 }} />
              )}
              <Bar dataKey="students" stackId="a" fill={theme.series[0]} stroke={theme.surface} strokeWidth={1} maxBarSize={36} />
              <Bar dataKey="staff" stackId="a" fill={theme.series[1]} stroke={theme.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
