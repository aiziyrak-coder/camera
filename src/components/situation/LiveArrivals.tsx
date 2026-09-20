import { Link } from 'react-router-dom';
import { ChevronRight, UserCheck } from 'lucide-react';
import type { LastArrival } from '../../lib/situationApi';
import { clockLabel } from './situationUtils';
import { Avatar, CodeText, EmptyState, Skeleton, StatusBadge, attendanceMeta, cn, focusRing } from '../../ui';

interface Props {
  items: readonly LastArrival[];
  loading: boolean;
  /** Yangi kelganlar (bir necha soniya ajratib ko'rsatiladi). */
  freshIds: ReadonlySet<string>;
  personLink: ((id: string) => string) | null;
  big?: boolean;
}

/** "So'nggi kelganlar" — kunning birinchi ko'rinishi (istalgan kamera yoki turniket) bo'yicha. */
export function LiveArrivals({ items, loading, freshIds, personLink, big }: Props) {
  return (
    <>
      {loading ? (
        <ul className="divide-y divide-border" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-8 w-8" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="px-3 py-3">
          <EmptyState
            compact
            bordered={false}
            icon={UserCheck}
            title="Hozircha hech kim tanilmadi"
            description="Kamera odamni kunda birinchi marta taniganda ismi shu yerda darhol paydo bo'ladi. Kamera faqat yuzi ro'yxatdan o'tgan odamni taniy oladi."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border" aria-live="polite">
          {items.map((item) => {
            const tone = attendanceMeta(item.status).tone;
            const to = personLink ? personLink(item.id) : null;
            const fresh = freshIds.has(item.id);
            const body = (
              <>
                <Avatar name={item.fullName} src={item.photoUrl} size={big ? 'md' : 'sm'} status={tone} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium text-fg', big ? 'text-[15px]' : 'text-[13px]')}>{item.fullName}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {item.type === 'xodim' ? 'Xodim' : 'Talaba'}
                    {item.unit ? ` · ${item.unit}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CodeText className={cn('font-semibold text-fg', big ? 'text-[15px]' : 'text-[13px]')}>{clockLabel(item.time)}</CodeText>
                  <StatusBadge status={item.status} />
                </div>
              </>
            );
            const rowClass = cn(
              'flex min-h-[34px] items-center gap-3 px-3 py-1.5 transition-colors duration-700',
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
    </>
  );
}
