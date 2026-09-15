import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { BAD_COLOR, GOOD_COLOR, NEUTRAL_COLOR } from '../../lib/chartTheme';

type Better = 'up' | 'down' | 'none';

function tone(delta: number | null | undefined, better: Better): 'good' | 'bad' | 'neutral' {
  if (delta === null || delta === undefined || delta === 0 || better === 'none') return 'neutral';
  const improved = better === 'up' ? delta > 0 : delta < 0;
  return improved ? 'good' : 'bad';
}

const TONE_CLASS = {
  good: 'bg-emerald-100 text-emerald-700',
  bad: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
} as const;

const TONE_COLOR = { good: GOOD_COLOR, bad: BAD_COLOR, neutral: NEUTRAL_COLOR } as const;

/** Katta raqam + oldingi davrga nisbatan o'zgarish (yaxshi/yomon rangda) +
 *  kichik trend chizig'i. Namuna ishonchsiz bo'lsa buni ochiq aytadi. */
export default function KpiTile({
  label,
  value,
  previous,
  delta,
  deltaDisplay,
  better = 'none',
  trend = [],
  note,
  reliable = true,
  previousLabel = 'Oldingi davr',
}: {
  label: string;
  value: string;
  previous?: string | null;
  delta?: number | null;
  deltaDisplay?: string | null;
  better?: Better;
  trend?: (number | null)[];
  note?: string | null;
  reliable?: boolean;
  previousLabel?: string;
}) {
  const t = tone(delta, better);
  const Icon = t === 'neutral' ? Minus : (delta ?? 0) > 0 ? ArrowUpRight : ArrowDownRight;
  const points = trend.map((v, i) => ({ i, v }));
  const drawable = trend.filter((v) => v !== null).length >= 2;

  return (
    <div className="flex flex-col rounded-2xl border border-white/70 bg-white/60 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</span>
        {deltaDisplay && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${TONE_CLASS[t]}`}>
            <Icon size={12} aria-hidden="true" />
            {deltaDisplay}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {previous ? `${previousLabel}: ${previous}` : "Solishtirish uchun ma'lumot yo'q"}
      </p>
      {note && (
        <p className={`mt-2 text-[11px] font-semibold ${reliable ? 'text-slate-500' : 'text-amber-700'}`}>
          {reliable ? note : `⚠ ${note}`}
        </p>
      )}
      {drawable && (
        <div className="mt-auto h-10 pt-2" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="v"
                stroke={TONE_COLOR[t]}
                fill={TONE_COLOR[t]}
                fillOpacity={0.15}
                strokeWidth={1.8}
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
