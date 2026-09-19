import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { CountUp, ProgressBar, ProgressRing, Skeleton, Sparkline, TONE_SOFT, cn, focusRing, type ProgressSegment, type Tone } from '../../ui';

export interface KpiDelta {
  /** Qisqa yorliq ("kecha", "o'tgan Ju"). */
  label: string;
  /** Joriy − taqqoslanuvchi. null — taqqoslab bo'lmaydi. */
  value: number | null;
  /** Qaysi yo'nalish yaxshi. */
  better: 'up' | 'down';
  /** Birlik ("%" — foiz punktlari uchun "p.p."). */
  unit?: string;
  /** Sichqoncha ustida (asl qiymat). */
  title?: string;
}

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  /** Qiymat yonida kichikroq ("/ 505"). */
  suffix?: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  /** O'ngda foiz halqasi (0–100, null — "—"). */
  ring?: number | null;
  ringTone?: Tone | 'auto';
  /** Ostida holatlar ulushi chizig'i. */
  segments?: ProgressSegment[];
  /** Oxirgi kunlar trendi (eskisi birinchi). */
  trend?: ReadonlyArray<number | null> | null;
  trendTone?: Tone;
  trendRange?: { min?: number; max?: number };
  /** Taqqoslashlar (kecha, o'tgan hafta shu kuni). */
  deltas?: KpiDelta[];
  to?: string;
  loading?: boolean;
  /** Devor ekrani: kattaroq shrift. */
  big?: boolean;
  className?: string;
}

function DeltaChip({ delta, big }: { delta: KpiDelta; big?: boolean }) {
  if (delta.value === null) return null;
  const rounded = Math.round(delta.value * 10) / 10;
  const Icon = rounded === 0 ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight;
  const good = rounded === 0 ? null : delta.better === 'up' ? rounded > 0 : rounded < 0;
  const tone: Tone = good === null ? 'neutral' : good ? 'success' : 'danger';
  const text = `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${delta.unit ?? ''}`;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-muted', big ? 'text-sm' : 'text-xs')} title={delta.title}>
      <span className={cn('inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 font-semibold tabular-nums', TONE_SOFT[tone])}>
        <Icon size={12} aria-hidden="true" />
        {text}
      </span>
      {delta.label}
    </span>
  );
}

/** Situatsion markaz KPI plitkasi — 5 metrdan o'qiladigan katta raqam,
 *  ixtiyoriy foiz halqasi, taqqoslashlar, trend chizig'i va holatlar chizig'i. */
export function KpiTile({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = 'neutral',
  ring,
  ringTone = 'auto',
  segments,
  trend,
  trendTone,
  trendRange,
  deltas,
  to,
  loading,
  big,
  className,
}: KpiTileProps) {
  const visibleDeltas = (deltas ?? []).filter((d) => d.value !== null);
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex shrink-0 items-center justify-center rounded-control', TONE_SOFT[tone], big ? 'h-9 w-9' : 'h-8 w-8')}>
          <Icon size={big ? 18 : 16} aria-hidden="true" />
        </span>
        <p className={cn('min-w-0 font-medium leading-5 text-muted', big ? 'text-[15px]' : 'text-[13px]')}>{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className={cn(big ? 'h-11 w-32' : 'h-8 w-24')} />
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className={cn('text-display font-semibold text-fg', big ? 'text-[3rem]' : 'text-[2rem]')}>
                <CountUp value={value} />
              </span>
              {suffix && <span className={cn('font-medium tabular-nums text-muted', big ? 'text-xl' : 'text-sm')}>{suffix}</span>}
            </p>
          )}
          {visibleDeltas.length > 0 && !loading && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {visibleDeltas.map((d) => (
                <DeltaChip key={d.label} delta={d} big={big} />
              ))}
            </div>
          )}
          {hint && !loading && <p className={cn('mt-2 text-muted', big ? 'text-sm' : 'text-xs')}>{hint}</p>}
        </div>
        {ring !== undefined && !loading && <ProgressRing value={ring} tone={ringTone} size={big ? 80 : 60} ariaLabel={`${label}: foiz`} />}
      </div>
      <div className="flex-1" aria-hidden="true" />
      {trend && !loading && (
        <Sparkline
          values={trend}
          tone={trendTone ?? (tone === 'neutral' ? 'primary' : tone)}
          height={big ? 40 : 30}
          min={trendRange?.min}
          max={trendRange?.max}
          className="mt-3"
          ariaLabel={`${label}: oxirgi ${trend.length} kun trendi`}
        />
      )}
      {segments && !loading && <ProgressBar segments={segments} size="sm" className="mt-3" ariaLabel={label} />}
    </>
  );

  const classes = cn(
    'flex min-w-0 flex-col rounded-card border border-border bg-surface text-left shadow-card',
    big ? 'p-5' : 'p-4',
    to && cn('lift hover:border-border-strong', focusRing),
    className,
  );

  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
