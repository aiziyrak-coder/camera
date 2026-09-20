import { Link } from 'react-router-dom';
import { ChevronRight, UserCheck } from 'lucide-react';
import type { LastArrival } from '../../lib/situationApi';
import { clockLabel } from './situationUtils';
import { Avatar, Card, CardHeader, EmptyState, Skeleton, StatusBadge, StatusDot, attendanceMeta, cn, focusRing } from '../../ui';

interface Props {
  items: readonly LastArrival[];
  loading: boolean;
  /** Realtime ulanganmi (sarlavhadagi "Jonli" belgisi). */
  live: boolean;
  /** Yangi kelganlar (bir necha soniya ajratib ko'rsatiladi). */
  freshIds: ReadonlySet<string>;
  personLink: ((id: string) => string) | null;
  big?: boolean;
}

/** "So'nggi kelganlar" — kunning birinchi ko'rinishi (istalgan kamera yoki turniket) bo'yicha. */
export function LiveArrivals({ items, loading, live, freshIds, personLink, big }: Props) {
  return (
    <Card padding="none" className="flex min-h-0 flex-col">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              So'nggi kelganlar
              {live && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                  <StatusDot tone="success" pulse /> Jonli
                </span>
              )}
            </span>
          }
          subtitle="Kamera bugun birinchi marta tanigan oxirgi odamlar"
          icon={UserCheck}
          className="mb-3"
        />
      </div>
      {loading ? (
        <ul className="space-y-3 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState
            compact
            icon={UserCheck}
            title="Hozircha hech kim tanilmadi"
            description="Kamera odamni kunda birinchi marta taniganda ismi shu yerda darhol paydo bo'ladi. Kamera faqat yuzi ro'yxatdan o'tgan odamni taniy oladi."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border" aria-live="polite">
          {items.map((item) => {
            const tone = attendanceMeta(item.status).tone;
            const to = personLink ? personLink(item.id) : null;
            const fresh = freshIds.has(item.id);
            const body = (
              <>
                <Avatar name={item.fullName} src={item.photoUrl} size={big ? 'lg' : 'md'} status={tone} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium text-fg', big ? 'text-base' : 'text-sm')}>{item.fullName}</p>
                  <p className="truncate text-xs text-muted">
                    {item.type === 'xodim' ? 'Xodim' : 'Talaba'}
                    {item.unit ? ` · ${item.unit}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn('font-semibold tabular-nums text-fg', big ? 'text-base' : 'text-sm')}>{clockLabel(item.time)}</span>
                  <StatusBadge status={item.status} />
                </div>
              </>
            );
            const rowClass = cn(
              'flex items-center gap-3 px-4 py-2.5 transition-colors duration-700 sm:px-5',
              fresh && 'animate-pop-in bg-success-soft/60',
            );
            return (
              <li key={item.id}>
                {to ? (
                  <Link to={to} className={cn('group hover:bg-surface-2/70', rowClass, focusRing)}>
                    {body}
                    <ChevronRight size={16} className="-mr-1 hidden shrink-0 text-subtle sm:block" aria-hidden="true" />
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
