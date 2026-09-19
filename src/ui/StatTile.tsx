import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { cn, focusRing } from './cn';
import { ProgressBar } from './Progress';
import { Skeleton } from './Skeleton';
import { TONE_SOFT, type Tone } from './tones';

export interface StatDelta {
  /** Oldingi davrga nisbatan o'zgarish (masalan +3.2 yoki -12). */
  value: number;
  /** Ko'rsatiladigan matn (standart: "+3,2"). */
  display?: string;
  /** Qaysi yo'nalish yaxshi: 'up' (davomat), 'down' (kechikish), 'none' — neytral. */
  better?: 'up' | 'down' | 'none';
}

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Qiymat yonidagi birlik ("ta", "%"). */
  unit?: ReactNode;
  /** Pastdagi izoh ("1 240 tadan"). */
  hint?: ReactNode;
  icon?: LucideIcon;
  /** Ikonka va progress rangi. */
  tone?: Tone;
  delta?: StatDelta | null;
  /** 0–100 — ostida chiziqli progress. */
  progress?: number | null;
  loading?: boolean;
  /** Bosiladigan plitka: ichki havola. */
  to?: string;
  onClick?: () => void;
  size?: 'md' | 'lg';
  className?: string;
}

function deltaTone(delta: StatDelta): Tone {
  if (delta.value === 0 || !delta.better || delta.better === 'none') return 'neutral';
  const improved = delta.better === 'up' ? delta.value > 0 : delta.value < 0;
  return improved ? 'success' : 'danger';
}

/** KPI plitkasi: nom, katta raqam, o'zgarish, izoh, ixtiyoriy progress. */
export function StatTile({ label, value, unit, hint, icon: Icon, tone = 'neutral', delta, progress, loading, to, onClick, size = 'md', className }: StatTileProps) {
  const DeltaIcon = delta ? (delta.value === 0 ? Minus : delta.value > 0 ? ArrowUpRight : ArrowDownRight) : null;
  const dTone = delta ? deltaTone(delta) : 'neutral';

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-5 text-muted">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-control', TONE_SOFT[tone])}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className={cn('mt-2', size === 'lg' ? 'h-9 w-28' : 'h-7 w-20')} />
      ) : (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn('font-semibold tabular-nums tracking-tight text-fg', size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl')}>
            {value}
          </span>
          {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
        </div>
      )}
      {(delta || hint) && !loading && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {delta && DeltaIcon && (
            <span className={cn('inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 font-semibold tabular-nums', TONE_SOFT[dTone])}>
              <DeltaIcon size={12} aria-hidden="true" />
              {delta.display ?? `${delta.value > 0 ? '+' : ''}${delta.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`}
            </span>
          )}
          {hint && <span className="min-w-0">{hint}</span>}
        </div>
      )}
      {progress !== undefined && progress !== null && !loading && (
        <ProgressBar value={progress} tone={tone === 'neutral' ? 'auto' : tone} size="xs" className="mt-3" />
      )}
    </>
  );

  const classes = cn(
    'flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 text-left shadow-card',
    (to || onClick) && cn('transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop', focusRing),
    className,
  );

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
