import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing } from './cn';
import { initials } from './text';
import { attendanceMeta, type AttendanceStatus } from './status';
import { TONE_SOFT, TONE_SOLID } from './tones';

export interface PersonCardProps {
  name: string;
  photoUrl?: string | null;
  /** Guruh, kafedra yoki lavozim. */
  subtitle?: ReactNode;
  status?: AttendanceStatus | string | null;
  /** Kelgan vaqti ("08:12") yoki boshqa qisqa vaqt. */
  time?: string | null;
  /** Qo'shimcha qator (masalan "3 dars"). */
  meta?: ReactNode;
  /** Ichki havola (masalan /shaxs/123). */
  to?: string;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

/** "Yuzlar setkasi" elementi: surat, ism, holat va vaqt. Holat rangi
 *  pastki chiziqda va yorliqda — faqat rangga tayanmaydi. */
export function PersonCard({ name, photoUrl, subtitle, status, time, meta, to, onClick, selected, className }: PersonCardProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  const statusMeta = attendanceMeta(status ?? undefined);
  const showPhoto = photoUrl && !failed;

  const body = (
    <>
      <div className={cn('relative aspect-[4/5] w-full overflow-hidden bg-surface-2', !showPhoto && TONE_SOFT[statusMeta.tone])}>
        {showPhoto ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold opacity-80" aria-hidden="true">
            {initials(name)}
          </span>
        )}
        {status && (
          <span
            className={cn(
              'absolute left-2 top-2 inline-flex h-[22px] items-center gap-1.5 rounded-full bg-surface/95 px-2 text-[11px] font-semibold text-fg shadow-sm backdrop-blur',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', TONE_SOLID[statusMeta.tone])} aria-hidden="true" />
            {statusMeta.label}
          </span>
        )}
        <span className={cn('absolute inset-x-0 bottom-0 h-1', status ? TONE_SOLID[statusMeta.tone] : 'bg-transparent')} aria-hidden="true" />
      </div>
      <div className="flex min-h-[4.25rem] flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg" title={name}>
          {name}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">{subtitle}</span>
          {time && <span className="shrink-0 font-medium tabular-nums text-fg">{time}</span>}
        </div>
        {meta && <div className="text-xs text-muted">{meta}</div>}
      </div>
    </>
  );

  const classes = cn(
    'group flex flex-col overflow-hidden rounded-card border bg-surface text-left shadow-card transition-[border-color,box-shadow]',
    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
    (to || onClick) && cn('hover:border-border-strong hover:shadow-pop', focusRing),
    className,
  );
  const label = `${name}${status ? `, ${statusMeta.label}` : ''}${time ? `, ${time}` : ''}`;

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={label}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-label={label} aria-pressed={selected}>
        {body}
      </button>
    );
  }
  return (
    <div className={classes} aria-label={label} role="group">
      {body}
    </div>
  );
}

/** PersonCard'lar uchun moslashuvchan setka: telefonda 2 ta, katta ekranda ko'p. */
export function PersonGrid({ children, minItemWidth = 140, className }: { children: ReactNode; minItemWidth?: number; className?: string }) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minItemWidth}px), 1fr))` }}
    >
      {children}
    </div>
  );
}
