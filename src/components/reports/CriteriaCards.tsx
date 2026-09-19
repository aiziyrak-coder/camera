import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { Card, Skeleton, TONE_SOFT, TONE_TEXT, cn, focusRing, formatNumber, type Tone } from '../../ui';
import type { ReportBucket, ReportCriterion } from '../../types';

/** Backend chelak ohanglari → dizayn tizimi ohanglari. */
const BUCKET_TONE: Record<ReportBucket['tone'], Tone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  indigo: 'primary',
  slate: 'neutral',
};

/** 1-daraja: kriteriya kartalari.
 *
 * Har karta bitta savolga javob beradi va raqamlari "chelak" bo'lib
 * ajratilgan — chelakni bosish o'sha raqam ORTIDAGI ro'yxatni ochadi.
 * Nol raqam izohsiz qolmaydi: `note` bo'lsa, u kartaning pastida
 * ko'rinadi, chunki "0 ta kelmadi" va "tizim qaramadi" bir xil emas. */
export default function CriteriaCards({
  criteria,
  loading,
  onOpen,
}: {
  criteria: ReportCriterion[];
  loading: boolean;
  onOpen: (criterion: ReportCriterion, bucketKey: string) => void;
}) {
  if (loading && criteria.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Card key={key}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-3/4" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {criteria.map((criterion) => {
        const openable = criterion.detail !== 'none';
        return (
          <Card key={criterion.key} as="article" className="flex flex-col gap-3.5">
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-semibold leading-6 text-fg">{criterion.title}</h3>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
                  {formatNumber(criterion.total)} {criterion.unit}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">{criterion.subtitle}</p>
            </div>

            <div className={cn('grid gap-2', criterion.buckets.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {criterion.buckets.map((bucket) => {
                const tone = BUCKET_TONE[bucket.tone] ?? 'neutral';
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    disabled={!openable}
                    onClick={() => onOpen(criterion, bucket.key)}
                    title={openable ? `${bucket.label} — ro'yxatni ochish` : undefined}
                    className={cn(
                      'min-w-0 rounded-control px-2.5 py-2 text-left transition-[filter,box-shadow] enabled:hover:brightness-95 disabled:cursor-default',
                      TONE_SOFT[tone],
                      focusRing,
                    )}
                  >
                    <span className={cn('block text-xl font-semibold tabular-nums leading-7', TONE_TEXT[tone])}>{bucket.count}</span>
                    <span className="block truncate text-xs font-medium text-muted">{bucket.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto">
              {criterion.note ? (
                <p className="flex items-start gap-1.5 rounded-control bg-warning-soft px-2.5 py-2 text-xs leading-relaxed text-fg">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                  {criterion.note}
                </p>
              ) : openable ? (
                <button
                  type="button"
                  onClick={() => onOpen(criterion, criterion.buckets[0]?.key ?? '')}
                  className={cn('inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary hover:underline', focusRing)}
                >
                  {criterion.detail === 'events' ? 'Signallarni ochish' : "Ro'yxatni ochish"}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info size={12} aria-hidden="true" />
                  Bu kriteriya bo&apos;yicha batafsil ro&apos;yxat hozircha yo&apos;q
                </p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
