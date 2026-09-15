import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartCard, { Legend } from '../ui/ChartCard';
import EmptyState from '../ui/EmptyState';
import { ATTENDANCE_COLORS, AXIS_TICK, GRID_COLOR, TOOLTIP_STYLE } from '../../lib/chartTheme';
import { monthLabel, shortMonthLabel } from '../../lib/attendanceCalendar';
import type { AttendanceMonth } from '../../types';

function rateText(rate: number | null): string {
  return rate === null ? '—' : `${String(rate).replace('.', ',')}%`;
}

/** Oxirgi oylar: yozuvli kunlar ustunlari va har oyning davomat foizi.
 *  Oy tugmasi kalendarni o'sha oyga o'tkazadi. */
export default function MonthTrend({
  months,
  activeMonth,
  onPick,
}: {
  months: AttendanceMonth[];
  activeMonth: string;
  onPick: (month: string) => void;
}) {
  const hasData = months.some((m) => m.recordedDays > 0);
  const data = months.map((m) => ({ month: m.month, keldi: m.present, kech: m.late, kelmadi: m.absent }));

  return (
    <ChartCard
      title={`Oxirgi ${months.length} oy`}
      subtitle="Yozuvli kunlar va davomat foizi"
      legend={
        <Legend
          items={[
            { color: ATTENDANCE_COLORS.keldi, label: 'Keldi' },
            { color: ATTENDANCE_COLORS.kechKeldi, label: 'Kech keldi' },
            { color: ATTENDANCE_COLORS.kelmadi, label: 'Kelmadi' },
          ]}
        />
      }
      table={
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="py-1 font-semibold">Oy</th>
              <th className="py-1 text-right font-semibold">Keldi</th>
              <th className="py-1 text-right font-semibold">Kech</th>
              <th className="py-1 text-right font-semibold">Kelmadi</th>
              <th className="py-1 text-right font-semibold">Davomat</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t border-white/60 tabular-nums">
                <td className="py-1">{monthLabel(m.month)}</td>
                <td className="py-1 text-right">{m.present}</td>
                <td className="py-1 text-right">{m.late}</td>
                <td className="py-1 text-right">{m.absent}</td>
                <td className="py-1 text-right font-semibold">{rateText(m.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {hasData ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="month" tickFormatter={shortMonthLabel} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                labelFormatter={(value) => monthLabel(String(value))}
              />
              <Bar dataKey="keldi" name="Keldi" stackId="kunlar" fill={ATTENDANCE_COLORS.keldi} isAnimationActive={false} />
              <Bar dataKey="kech" name="Kech keldi" stackId="kunlar" fill={ATTENDANCE_COLORS.kechKeldi} isAnimationActive={false} />
              <Bar dataKey="kelmadi" name="Kelmadi" stackId="kunlar" fill={ATTENDANCE_COLORS.kelmadi} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          compact
          title="Bu davrda yozuv yo'q"
          description="Kameralar bu odamni tanimagan yoki davomat qo'lda kiritilmagan."
        />
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6 xl:grid-cols-3">
        {months.map((m) => {
          const active = m.month === activeMonth;
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onPick(m.month)}
              aria-pressed={active}
              title={`${monthLabel(m.month)}: ${m.recordedDays} ta yozuvli kun`}
              className={`rounded-lg px-2 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                active ? 'bg-indigo-600 text-white shadow-btn' : 'bg-white/60 text-slate-600 hover:bg-white'
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {shortMonthLabel(m.month)}
              </span>
              <span className="block text-sm font-bold tabular-nums">{rateText(m.rate)}</span>
            </button>
          );
        })}
      </div>
    </ChartCard>
  );
}
