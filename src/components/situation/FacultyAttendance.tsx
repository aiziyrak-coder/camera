import { Link } from 'react-router-dom';
import { ChevronRight, School } from 'lucide-react';
import type { FacultyCounts } from '../../lib/situationApi';
import { Card, CardHeader, EmptyState, ProgressBar, Skeleton, TONE_SOLID, TONE_TEXT, cn, focusRing, formatNumber, formatPercent, toneForRate } from '../../ui';
import { attendanceSegments } from './situationUtils';

interface Props {
  faculties: readonly FacultyCounts[] | null;
  loading: boolean;
  /** Fakultet sahifasiga havola (huquq bo'lmasa — null, qatorlar bosilmaydi). */
  linkFor: ((faculty: FacultyCounts) => string) | null;
  allLink?: string | null;
  big?: boolean;
}

const LEGEND = [
  { tone: 'success', label: "O'z vaqtida" },
  { tone: 'warning', label: 'Kech qoldi' },
  { tone: 'danger', label: 'Kelmadi' },
  { tone: 'neutral', label: 'Hali kelmagan' },
] as const;

/** "Fakultetlar bo'yicha davomat": har fakultet — holatlar chizig'i va foiz. */
export function FacultyAttendance({ faculties, loading, linkFor, allLink, big }: Props) {
  const rows = faculties ?? [];

  return (
    <Card padding="none" className="flex flex-col">
      <div className={cn('px-4 pt-4 sm:px-5 sm:pt-5', big && 'sm:px-6 sm:pt-6')}>
        <CardHeader
          title="Fakultetlar bo'yicha davomat"
          subtitle="Talabalar: kelgan / kutilgan va holatlar ulushi"
          icon={School}
          className="mb-3"
          actions={
            allLink ? (
              <Link to={allLink} className={cn('inline-flex items-center gap-0.5 rounded-control text-[13px] font-medium text-primary hover:underline', focusRing)}>
                Batafsil <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : undefined
          }
        />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-3 text-xs text-muted" aria-label="Rang izohi">
          {LEGEND.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', TONE_SOLID[item.tone])} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {loading ? (
        <div className="space-y-4 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2.5 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState compact icon={School} title="Fakultetlar yo'q" description="Tashkiliy tuzilmada fakultetlar va talabalar qo'shilgach shu yerda ko'rinadi." />
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((faculty) => {
            const empty = faculty.total === 0;
            const tone = toneForRate(faculty.rate);
            const to = linkFor && !empty ? linkFor(faculty) : null;
            const expected = faculty.present + faculty.absent + faculty.notYet;
            const content = (
              <>
                <div className={cn('min-w-0 flex-1 sm:w-56 sm:flex-none', big && 'sm:w-72')}>
                  <p className={cn('truncate font-medium text-fg', big ? 'text-base' : 'text-sm')} title={faculty.name}>
                    {faculty.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted">
                    {empty
                      ? "Talaba yo'q"
                      : `${formatNumber(faculty.present)} / ${formatNumber(expected)} keldi${faculty.late ? ` · ${formatNumber(faculty.late)} kech` : ''}`}
                  </p>
                </div>
                <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                  {empty ? (
                    <div className="h-2.5 rounded-full bg-surface-2" aria-hidden="true" />
                  ) : (
                    <ProgressBar segments={attendanceSegments(faculty)} size="md" ariaLabel={`${faculty.name}: holatlar`} />
                  )}
                </div>
                <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                  <span className={cn('font-semibold tabular-nums', big ? 'text-xl' : 'text-base', empty ? 'text-subtle' : TONE_TEXT[tone])}>
                    {formatPercent(faculty.rate)}
                  </span>
                  {to && <ChevronRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                </div>
              </>
            );
            const rowClass = cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:flex-nowrap sm:px-5', big ? 'py-3.5' : 'py-3');
            return (
              <li key={faculty.id ?? 'none'}>
                {to ? (
                  <Link to={to} className={cn('group hover:bg-surface-2/70', rowClass, focusRing)}>
                    {content}
                  </Link>
                ) : (
                  <div className={cn(rowClass, empty && 'opacity-60')}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
