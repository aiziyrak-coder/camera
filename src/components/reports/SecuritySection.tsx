import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ShieldCheck } from 'lucide-react';
import ChartCard, { Legend } from '../ui/ChartCard';
import EmptyState from '../ui/EmptyState';
import Heatmap from './Heatmap';
import { Stat } from './AttendanceSection';
import { AXIS_TICK, GRID_COLOR, SEVERITY_COLORS, TOOLTIP_STYLE } from '../../lib/chartTheme';
import { formatCount } from '../../lib/uzDate';
import type { SecurityAnalytics } from '../../types';

function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, share)}%` }} />
    </div>
  );
}

function PrecisionBadge({ precision }: { precision: number | null }) {
  if (precision === null) return <span className="text-[11px] text-slate-400">o&apos;lchanmagan</span>;
  const tone = precision >= 80 ? 'bg-emerald-100 text-emerald-700' : precision >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tone}`}>{precision}%</span>;
}

export default function SecuritySection({ security }: { security: SecurityAnalytics }) {
  if (security.total === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck size={18} />}
        title="Bu davrda AI signal qayd etilmagan"
        description="Kameralar va AI modullar ishlagan bo'lsa, bu tinch davr degani. Kameralar holatini pastdagi «Tizim holati» bo'limida tekshiring."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Jami signallar" value={formatCount(security.total)} />
        <Stat label="Jiddiy (o'rta + yuqori)" value={formatCount(security.serious)} hint={`yuqori: ${security.yuqori}`} />
        <Stat
          label="Ko'rib chiqilmagan"
          value={formatCount(security.unreviewed)}
          hint={security.staleSeriousUnreviewed ? `${security.staleSeriousUnreviewed} ta jiddiy — 24 soatdan eski` : null}
          warn={security.staleSeriousUnreviewed > 0}
        />
        <Stat
          label="Aniqlik"
          value={security.precision === null ? '—' : `${security.precision}%`}
          hint={security.precision === null ? "kamida 10 ta ko'rib chiqilgan signal kerak" : 'tasdiqlangan / ko\'rib chiqilgan'}
        />
        <Stat label="Ish vaqtidan tashqari" value={formatCount(security.night)} hint="07:00–21:00 dan tashqari" />
      </div>

      <ChartCard
        title="Kunlar bo'yicha signallar"
        subtitle="Muhimlik darajasi bilan"
        pdfKey="security-days"
        legend={
          <Legend
            items={[
              { color: SEVERITY_COLORS.yuqori, label: 'Yuqori' },
              { color: SEVERITY_COLORS.orta, label: "O'rta" },
              { color: SEVERITY_COLORS.past, label: 'Past' },
            ]}
          />
        }
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={security.byDay} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={10} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="past" name="Past" stackId="sev" stroke={SEVERITY_COLORS.past} fill={SEVERITY_COLORS.past} fillOpacity={0.35} isAnimationActive={false} />
              <Area type="monotone" dataKey="orta" name="O'rta" stackId="sev" stroke={SEVERITY_COLORS.orta} fill={SEVERITY_COLORS.orta} fillOpacity={0.4} isAnimationActive={false} />
              <Area type="monotone" dataKey="yuqori" name="Yuqori" stackId="sev" stroke={SEVERITY_COLORS.yuqori} fill={SEVERITY_COLORS.yuqori} fillOpacity={0.45} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ChartCard title="Signallar qachon ko'p bo'ladi" subtitle="Hafta kuni va soat bo'yicha (institut vaqti)">
          <Heatmap matrix={security.heatmap} max={security.heatmapMax} />
        </ChartCard>

        <ChartCard title="Modullar" subtitle="Qaysi mezon qancha signal bergan va ular qanchalik to'g'ri chiqqan">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-3">Modul</th>
                  <th className="pb-2 pr-3 text-right">Soni</th>
                  <th className="w-28 pb-2 pr-3">Ulushi</th>
                  <th className="pb-2 text-right">Aniqlik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {security.topModules.map((module) => (
                  <tr key={module.code}>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-slate-800">{module.name}</p>
                      <p className="text-[10px] text-slate-400">
                        №{module.code}
                        {module.unreviewed ? ` · ${module.unreviewed} ta ko'rilmagan` : ''}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatCount(module.count)}</td>
                    <td className="py-2 pr-3">
                      <ShareBar share={module.share} />
                      <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{module.share}%</p>
                    </td>
                    <td className="py-2 text-right">
                      <PrecisionBadge precision={module.precision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {security.topCameras.length > 0 && (
        <ChartCard title="Eng ko'p signal bergan kameralar" subtitle="Bitta kamera ulushi katta bo'lsa — odatda kameraning ko'rish maydonini tekshirish kerak">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {security.topCameras.map((camera) => (
              <div key={`${camera.name}-${camera.building}`} className="rounded-xl bg-white/70 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800" title={camera.name}>
                    {camera.name}
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{formatCount(camera.count)}</p>
                </div>
                <p className="mb-1 text-[11px] text-slate-400">{camera.building || '—'}</p>
                <ShareBar share={camera.share} />
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
