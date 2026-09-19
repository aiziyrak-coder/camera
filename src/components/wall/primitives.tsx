import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, TONE_TEXT, toneForRate, attendanceMeta, TONE_SOLID, type Tone } from '../../ui';

/** Devor paneli: sarlavha + ichki maydon. O'lchamlar `em` da — ildiz
 *  shrift o'lchami ekranga qarab (clamp) o'zgaradi. */
export function WallPanel({
  area,
  title,
  icon,
  aside,
  children,
  className,
}: {
  area: string;
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      style={{ gridArea: area }}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1em] border border-border bg-surface p-[1.1em]',
        className,
      )}
    >
      <header className="mb-[0.8em] flex shrink-0 items-center gap-[0.5em]">
        {icon && <span className="text-muted [&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span>}
        <h2 className="text-[0.8em] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
        {aside && <div className="ml-auto flex items-center gap-[0.5em] text-[0.85em] text-muted">{aside}</div>}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Ekran o'lchamiga moslashuvchi foiz halqasi (kenglik — `size` em). */
export function WallRing({
  value,
  size = 6,
  tone,
  label,
  sublabel,
}: {
  value: number | null | undefined;
  size?: number;
  tone?: Tone;
  label?: ReactNode;
  sublabel?: ReactNode;
}) {
  const has = value !== null && value !== undefined && !Number.isNaN(value);
  const pct = has ? Math.min(100, Math.max(0, value)) : 0;
  const t = tone ?? toneForRate(has ? value : null);
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: `${size}em`, height: `${size}em` }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-surface-3" />
        {has && pct > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            className={cn('transition-[stroke-dashoffset] duration-1000 ease-out', TONE_TEXT[t])}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-semibold tabular-nums text-fg" style={{ fontSize: `${size * 0.24}em` }}>
          {label ?? (has ? `${Math.round(pct)}%` : '—')}
        </span>
        {sublabel && (
          <span className="mt-[0.3em] text-muted" style={{ fontSize: `${size * 0.1}em` }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Raqam silliq o'zgaradi (0.8 s). */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 800);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (value - from) * eased);
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value]);
  return <span className={cn('tabular-nums', className)}>{shown.toLocaleString('ru-RU')}</span>;
}

const STATUS_RING: Record<Tone, string> = {
  neutral: 'ring-border-strong',
  primary: 'ring-primary',
  success: 'ring-success',
  warning: 'ring-warning',
  danger: 'ring-danger',
  info: 'ring-info',
};

/** Rasm yoki bosh harflar; holat rangidagi halqa bilan. */
export function WallFace({
  photoUrl,
  initials,
  status,
  className,
  dim,
}: {
  photoUrl: string | null;
  initials: string;
  status: string;
  className?: string;
  dim?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const tone = attendanceMeta(status === 'malumot_yoq' ? 'nomalum' : status).tone;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[0.6em] bg-surface-2 ring-[0.18em] ring-offset-0',
        STATUS_RING[tone],
        dim && 'opacity-45 grayscale',
        className,
      )}
    >
      {photoUrl && !broken ? (
        <img src={photoUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-semibold text-muted" style={{ fontSize: '1.4em' }}>
          {initials}
        </div>
      )}
    </div>
  );
}

export function StatusPip({ status, className }: { status: string; className?: string }) {
  const tone = attendanceMeta(status === 'malumot_yoq' ? 'nomalum' : status).tone;
  return <span className={cn('inline-block h-[0.6em] w-[0.6em] shrink-0 rounded-full', TONE_SOLID[tone], className)} />;
}
