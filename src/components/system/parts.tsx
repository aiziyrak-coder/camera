import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ErrorState, SkeletonText, TONE_SOLID, TONE_TEXT, cn, type Tone } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';

/** Millisekund → "14:03". Noma'lum bo'lsa null. */
export function clockTime(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "2026-09-20 14:03:22" yoki ISO → "20.09.2026 14:03". Tanib bo'lmasa o'zicha. */
export function formatServerTime(value: string | null | undefined, withSeconds = false): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return value;
  const [, y, m, d, hh, mm, ss] = match;
  return `${d}.${m}.${y} ${hh}:${mm}${withSeconds && ss ? `:${ss}` : ''}`;
}

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

/** Karta tanasi: yuklanish / xato / ma'lumot.
 *
 *  Fon yangilanishi xato bersa eski ma'lumot ekranda qoladi — avval bu
 *  jimgina bo'lardi va operator eskirgan raqamlarni jonli deb o'qirdi.
 *  Endi tepada ogohlantirish chiqadi: qachongi ma'lumot va nega yangilanmadi. */
export function ResourceBody<T>({ resource, children, lines = 4 }: { resource: LiveResource<T>; children: (data: T) => ReactNode; lines?: number }) {
  if (resource.data) {
    const at = clockTime(resource.updatedAt);
    return (
      <>
        {resource.error && (
          <p role="status" className="mb-3 flex items-start gap-2 rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-fg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0">
              Yangilanmadi — {at ? `${at} dagi` : 'eski'} ma'lumot ko'rsatilmoqda. {resource.error}
            </span>
          </p>
        )}
        {children(resource.data)}
      </>
    );
  }
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  return <SkeletonText lines={lines} />;
}
