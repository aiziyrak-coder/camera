import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ProgressBar, ProgressRing, Skeleton, TONE_SOFT, cn, focusRing, type ProgressSegment, type Tone } from '../../ui';

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
  to?: string;
  loading?: boolean;
  /** Devor ekrani: kattaroq shrift. */
  big?: boolean;
  className?: string;
}

/** Situatsion markaz KPI plitkasi — 5 metrdan o'qiladigan katta raqam,
 *  ixtiyoriy foiz halqasi va holatlar chizig'i. */
export function KpiTile({ label, value, suffix, hint, icon: Icon, tone = 'neutral', ring, ringTone = 'auto', segments, to, loading, big, className }: KpiTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex shrink-0 items-center justify-center rounded-control', TONE_SOFT[tone], big ? 'h-9 w-9' : 'h-8 w-8')}>
          <Icon size={big ? 18 : 16} aria-hidden="true" />
        </span>
        <p className={cn('min-w-0 font-medium leading-5 text-muted', big ? 'text-[15px]' : 'text-[13px]')}>{label}</p>
      </div>
      <div className="mt-3 flex flex-1 items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className={cn(big ? 'h-11 w-32' : 'h-8 w-24')} />
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-1.5 leading-none">
              <span className={cn('font-semibold tabular-nums tracking-tight text-fg', big ? 'text-5xl' : 'text-3xl')}>{value}</span>
              {suffix && <span className={cn('font-medium tabular-nums text-muted', big ? 'text-xl' : 'text-sm')}>{suffix}</span>}
            </p>
          )}
          {hint && !loading && <p className={cn('mt-2 text-muted', big ? 'text-sm' : 'text-xs')}>{hint}</p>}
        </div>
        {ring !== undefined && !loading && <ProgressRing value={ring} tone={ringTone} size={big ? 80 : 60} ariaLabel={`${label}: foiz`} />}
      </div>
      {segments && !loading && <ProgressBar segments={segments} size="sm" className="mt-3" ariaLabel={label} />}
    </>
  );

  const classes = cn(
    'flex min-w-0 flex-col rounded-card border border-border bg-surface text-left shadow-card',
    big ? 'p-5' : 'p-4',
    to && cn('transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop', focusRing),
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
