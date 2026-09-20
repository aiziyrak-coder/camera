import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ScanFace } from 'lucide-react';
import type { Enrollment } from '../../lib/situationApi';
import { Card, CardHeader, CountUp, EmptyState, ErrorState, ProgressBar, ProgressRing, Skeleton, cn, focusRing, formatNumber, formatPercent } from '../../ui';

interface Props {
  data: Enrollment | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Talabalar bo'limi (fakultet → guruh) havolasi. */
  link?: string | null;
  facultyLink?: ((id: string | null) => string) | null;
  big?: boolean;
}

/** Talabalar davomati shu ulushdan yoqiladi (backend: studentsDataAvailable). */
const THRESHOLD = 5;

/** "Yuz topshirish" kampaniyasi: talabalar yuzi yig'ilguncha davomat o'rniga
 *  ko'rsatiladi — qancha qoldi, qaysi fakultet oldinda. */
export function EnrollmentCampaign({ data, loading, error, onRetry, link, facultyLink, big }: Props) {
  const s = data?.students;
  const pct = s?.pct ?? 0;
  const faculties = useMemo(
    () => [...(data?.byFaculty ?? [])].filter((f) => f.total > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.total - a.total),
    [data?.byFaculty],
  );
  const leftToThreshold = s ? Math.max(0, Math.ceil((s.total * THRESHOLD) / 100) - s.confirmed) : 0;

  return (
    <Card className="flex flex-col overflow-hidden" padding="none">
      <div className={cn('p-4 sm:p-5', big && 'sm:p-6')}>
        <CardHeader
          title="Yuz topshirish kampaniyasi"
          subtitle="Talabalar davomati yuzlar yig'ilgach avtomatik yoqiladi"
          icon={ScanFace}
          className="mb-4"
          actions={
            link ? (
              <Link to={link} className={cn('inline-flex items-center gap-0.5 rounded-control text-[13px] font-medium text-primary hover:underline', focusRing)}>
                Guruhlar bo'yicha <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : undefined
          }
        />
        {loading ? (
          <div className="flex items-center gap-5" aria-busy="true" aria-label="Yuklanmoqda">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ) : error && !data ? (
          <ErrorState title="Ro'yxatga olish holatini yuklab bo'lmadi" message={error} onRetry={onRetry} />
        ) : !s || s.total === 0 ? (
          <EmptyState compact bordered={false} icon={ScanFace} title="Talabalar ro'yxati bo'sh" description="Talabalar reestrga kiritilgach, yuz topshirish holati shu yerda ko'rinadi." />
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProgressRing value={s.pct ?? 0} tone="primary" size={big ? 112 : 92} ariaLabel="Yuzi tasdiqlangan talabalar ulushi" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn('text-display font-semibold text-fg', big ? 'text-[3rem]' : 'text-[2.25rem]')}>
                  <CountUp value={formatNumber(s.confirmed)} />
                </span>
                <span className={cn('font-medium tabular-nums text-muted', big ? 'text-xl' : 'text-sm')}>/ {formatNumber(s.total)} talaba yuz topshirgan</span>
              </p>
              <div className="relative mt-3">
                <ProgressBar
                  size="md"
                  segments={[
                    { value: s.confirmed, tone: 'primary', label: 'Tasdiqlangan' },
                    { value: s.pending, tone: 'info', label: 'Tekshiruvda' },
                    { value: s.none, tone: 'neutral', label: 'Topshirmagan' },
                  ]}
                  ariaLabel="Yuz topshirish holati"
                />
                {/* Davomat yoqiladigan chegara belgisi. */}
                <span className="absolute -top-1 bottom-[-4px] w-px bg-fg/50" style={{ left: `${THRESHOLD}%` }} aria-hidden="true" />
              </div>
              <p className={cn('mt-2 text-muted', big ? 'text-sm' : 'text-xs')}>
                {pct >= THRESHOLD
                  ? 'Chegaradan oshdi — talabalar davomati hisoblanmoqda.'
                  : `Davomat ${THRESHOLD}% dan yoqiladi: yana ${formatNumber(leftToThreshold)} talaba yuz topshirishi kerak.`}{' '}
                {s.pending > 0 && <span>{formatNumber(s.pending)} ta tekshiruvda.</span>}
              </p>
              {data && data.staff.total > 0 && (
                <p className={cn('mt-1 text-subtle', big ? 'text-sm' : 'text-xs')}>
                  Xodimlar: {formatNumber(data.staff.confirmed)} / {formatNumber(data.staff.total)} ({formatPercent(data.staff.pct)})
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {!loading && faculties.length > 0 && (
        <ul className="border-t border-border" aria-label="Fakultetlar bo'yicha yuz topshirish">
          {faculties.slice(0, big ? 8 : 6).map((f) => {
            const row = (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg sm:text-sm">{f.name}</span>
                <ProgressBar value={f.pct ?? 0} tone="primary" size="xs" className="hidden w-32 shrink-0 sm:block lg:w-44" ariaLabel={`${f.name}: ${formatPercent(f.pct, 1)}`} />
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                  {formatNumber(f.confirmed)} / {formatNumber(f.total)}
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{formatPercent(f.pct)}</span>
              </>
            );
            return (
              <li key={f.id ?? 'none'} className="border-b border-border last:border-b-0">
                {facultyLink ? (
                  <Link to={facultyLink(f.id)} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5', focusRing)}>
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
