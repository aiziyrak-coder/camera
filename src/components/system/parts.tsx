import type { ReactNode } from 'react';
import { ErrorState, SkeletonText, TONE_SOLID, TONE_TEXT, cn, type Tone } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';

/** Kichik ko'rsatkich: yorliq ustida, qiymat pastda. */
export function Metric({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2/70 px-3 py-2.5">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums leading-tight', tone ? TONE_TEXT[tone] : 'text-fg')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Holat qatori: rangli nuqta + matn (rangga yolg'iz tayanmaydi). */
export function StatusLine({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-5 text-fg">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_SOLID[tone])} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Tavsiya (backend matni) — kichik, ikkinchi darajali. */
export function Recommendation({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-control border border-border bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted">{children}</p>;
}

/** Karta tanasi: yuklanish / xato / ma'lumot. */
export function ResourceBody<T>({ resource, children, lines = 4 }: { resource: LiveResource<T>; children: (data: T) => ReactNode; lines?: number }) {
  if (resource.data) return <>{children(resource.data)}</>;
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  return <SkeletonText lines={lines} />;
}
