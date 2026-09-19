import type { ReactNode } from 'react';
import { cn } from './cn';
import { TONE_SOLID, TONE_TEXT, toneForRate, type Tone } from './tones';

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export interface ProgressRingProps {
  /** 0–100. `null` — ma'lumot yo'q (bo'sh halqa va "—"). */
  value: number | null | undefined;
  /** Diametr, px. */
  size?: number;
  thickness?: number;
  /** 'auto' — foizga qarab (≥85 yashil, ≥70 sariq, aks holda qizil). */
  tone?: Tone | 'auto';
  /** Markazdagi matn (standart: "87%"). */
  label?: ReactNode;
  /** Foiz ostida kichik yozuv. */
  sublabel?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/** Aylana ko'rinishidagi foiz (davomat darajasi). */
export function ProgressRing({ value, size = 64, thickness, tone = 'auto', label, sublabel, ariaLabel, className }: ProgressRingProps) {
  const stroke = thickness ?? Math.max(4, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasValue = value !== null && value !== undefined && !Number.isNaN(value);
  const pct = hasValue ? clamp(value) : 0;
  const resolvedTone = tone === 'auto' ? toneForRate(hasValue ? value : null) : tone;
  const fontSize = Math.max(11, Math.round(size / 4.4));

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={hasValue ? Math.round(pct) : undefined}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-surface-3" />
        {hasValue && pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            className={cn('transition-[stroke-dashoffset] duration-500 ease-out', TONE_TEXT[resolvedTone])}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="font-semibold tabular-nums text-fg" style={{ fontSize }}>
          {label ?? (hasValue ? `${Math.round(pct)}%` : '—')}
        </span>
        {sublabel && <span className="mt-0.5 text-[10px] text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export interface ProgressSegment {
  value: number;
  tone: Tone;
  label: string;
}

export interface ProgressBarProps {
  /** Oddiy rejim: qiymat (0..max). */
  value?: number | null;
  max?: number;
  tone?: Tone | 'auto';
  /** Yig'ma rejim: keldi / kech / kelmadi kabi bo'laklar (max — ularning yig'indisi). */
  segments?: ProgressSegment[];
  size?: 'xs' | 'sm' | 'md';
  /** O'ngda foizni ko'rsatish. */
  showValue?: boolean;
  /** Chapda yozuv (ustida). */
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

/** Chiziqli progress. `segments` bilan — bitta chiziqda holatlar ulushi. */
export function ProgressBar({ value, max = 100, tone = 'auto', segments, size = 'sm', showValue, label, ariaLabel, className }: ProgressBarProps) {
  const total = segments ? segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) : max;
  const hasValue = value !== null && value !== undefined && !Number.isNaN(value);
  const pct = hasValue && max > 0 ? clamp((value / max) * 100) : 0;
  const resolvedTone = tone === 'auto' ? toneForRate(hasValue ? pct : null) : tone;
  const summary = segments ? segments.map((s) => `${s.label}: ${s.value}`).join(', ') : undefined;

  return (
    <div className={cn('min-w-0', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-muted">{label}</span>
          {showValue && !segments && <span className="font-semibold tabular-nums text-fg">{hasValue ? `${Math.round(pct)}%` : '—'}</span>}
        </div>
      )}
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-surface-3', HEIGHT[size])}
        role={segments ? 'img' : 'progressbar'}
        aria-label={ariaLabel ?? summary}
        aria-valuemin={segments ? undefined : 0}
        aria-valuemax={segments ? undefined : 100}
        aria-valuenow={segments || !hasValue ? undefined : Math.round(pct)}
      >
        {segments
          ? total > 0 &&
            segments.map((segment, index) =>
              segment.value > 0 ? (
                <span
                  key={index}
                  title={`${segment.label}: ${segment.value}`}
                  className={cn('h-full transition-[width] duration-500', TONE_SOLID[segment.tone], index > 0 && 'border-l border-surface')}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              ) : null,
            )
          : hasValue && (
              <span className={cn('h-full rounded-full transition-[width] duration-500', TONE_SOLID[resolvedTone])} style={{ width: `${pct}%` }} />
            )}
      </div>
    </div>
  );
}
