import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Users } from 'lucide-react';
import ChartCard, { Legend } from '../ui/ChartCard';
import EmptyState from '../ui/EmptyState';
import { ACCENT, ATTENDANCE_COLORS, AXIS_TICK, GRID_COLOR, TOOLTIP_STYLE } from '../../lib/chartTheme';
import { formatCount } from '../../lib/uzDate';
import type { AttendancePopulation, ReportAnalytics } from '../../types';

const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

export function Stat({ label, value, hint, warn = false }: { label: string; value: string; hint?: string | null; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-base font-extrabold tabular-nums text-slate-900">{value}</p>
      {hint && <p className={`text-[10px] ${warn ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{hint}</p>}
    </div>
  );
}

function DayTable({ population }: { population: AttendancePopulation }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-white/90 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-1.5 pr-3">Sana</th>
            <th className="py-1.5 pr-3 text-right">Keldi</th>
            <th className="py-1.5 pr-3 text-right">Kech</th>
            <th className="py-1.5 pr-3 text-right">Kelmadi</th>
            <th className="py-1.5 text-right">Davomat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {population.byDay.map((day) => (
            <tr key={day.date}>
              <td className="py-1.5 pr-3 text-slate-600">{day.date}</td>
              <td className="py-1.5 pr-3 text-right">{day.keldi}</td>
              <td className="py-1.5 pr-3 text-right">{day.kechKeldi}</td>
              <td className="py-1.5 pr-3 text-right">{day.kelmadi}</td>
              <td className="py-1.5 text-right font-semibold">{pct(day.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PopulationCard({ population, pdfKey }: { population: AttendancePopulation; pdfKey: string }) {
  const title = `${population.label}: davomat`;
  if (population.records === 0) {
    return (
      <ChartCard title={title}>
        <EmptyState
          compact
          icon={<Users size={18} />}
          title="Bu davrda davomat yozuvi yo'q"
          description={
            population.population
              ? `Yuzi tasdiqlanganlar: ${formatCount(population.enrolled)} / ${formatCount(population.population)}. Yuzi tasdiqlanmagan odamni kameralar tanimaydi, shuning uchun uning davomati yozilmaydi.`
              : "Bazada bu turdagi odam yo'q."
          }
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={title}
      subtitle="Ustun — odamlar soni, chiziq — kunlik davomat foizi"
      pdfKey={pdfKey}
      table={<DayTable population={population} />}
      legend={
        <Legend
          items={[
            { color: ATTENDANCE_COLORS.keldi, label: 'Keldi' },
            { color: ATTENDANCE_COLORS.kechKeldi, label: 'Kech keldi' },
            { color: ATTENDANCE_COLORS.kelmadi, label: 'Kelmadi' },
            { color: ACCENT, label: 'Davomat, %' },
          ]}
        />
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Davomat"
          value={pct(population.rate)}
          hint={population.reliability.short}
          warn={!population.reliability.reliable}
        />
        <Stat label="Kelganlar" value={`${formatCount(population.present)} / ${formatCount(population.records)}`} hint="yozuvlardan" />
        <Stat
          label="Kech qolganlar"
          value={formatCount(population.late)}
          hint={population.lateShare === null ? null : `kelganlarning ${population.lateShare}%`}
        />
        <Stat label="O'rtacha kelish" value={population.avgArrival ?? '—'} />
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={population.byDay} margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={10} />
            <YAxis yAxisId="count" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
            <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar yAxisId="count" dataKey="keldi" name="Keldi" stackId="day" fill={ATTENDANCE_COLORS.keldi} isAnimationActive={false} />
            <Bar yAxisId="count" dataKey="kechKeldi" name="Kech keldi" stackId="day" fill={ATTENDANCE_COLORS.kechKeldi} isAnimationActive={false} />
            <Bar yAxisId="count" dataKey="kelmadi" name="Kelmadi" stackId="day" fill={ATTENDANCE_COLORS.kelmadi} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="rate" type="monotone" dataKey="rate" name="Davomat, %" stroke={ACCENT} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function FacultyCard({ population }: { population: AttendancePopulation }) {
  const height = Math.max(160, population.byFaculty.length * 30);
  return (
    <ChartCard
      title={`${population.label}: fakultetlar bo'yicha davomat`}
      subtitle="Eng ko'p yozuvli bo'limlar"
      table={
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {population.byFaculty.map((row) => (
              <tr key={row.name}>
                <td className="py-1.5 pr-3 text-slate-700">{row.name}</td>
                <td className="py-1.5 pr-3 text-right text-slate-500">{formatCount(row.total)} yozuv</td>
                <td className="py-1.5 text-right font-semibold">{pct(row.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={population.byFaculty} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={150} tick={{ ...AXIS_TICK, fill: '#475569' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="rate" name="Davomat, %" fill={ACCENT} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ArrivalCard({ population }: { population: AttendancePopulation }) {
  return (
    <ChartCard
      title={`${population.label}: kelish vaqti`}
      subtitle="Nechta odam qaysi 15 daqiqalik oraliqda kelgan"
      pdfKey="attendance-arrival"
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={population.arrivalHistogram} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Odamlar" fill={ATTENDANCE_COLORS.keldi} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default function AttendanceSection({ attendance }: { attendance: ReportAnalytics['attendance'] }) {
  const { staff, students } = attendance;
  const warnings = [staff, students].flatMap((p) => p.reliability.warnings.map((w) => ({ label: p.label, text: w })));
  const hasArrivals = staff.arrivalHistogram.some((bin) => bin.count > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <PopulationCard population={staff} pdfKey="attendance-staff" />
        <PopulationCard population={students} pdfKey="attendance-students" />
      </div>

      {(staff.byFaculty.length > 1 || hasArrivals) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {staff.byFaculty.length > 1 && <FacultyCard population={staff} />}
          {hasArrivals && <ArrivalCard population={staff} />}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <AlertTriangle size={15} aria-hidden="true" />
            Davomat foizini o&apos;qishdan oldin
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-amber-900">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-semibold">{w.label}:</span> {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
