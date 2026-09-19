import { Link } from 'react-router-dom';
import { ChevronRight, Trophy, TrendingDown } from 'lucide-react';
import { UNIT_KIND_LABELS, type KafedraStat } from '../../lib/situationApi';
import { Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, TONE_TEXT, cn, focusRing, formatNumber, formatPercent, toneForRate } from '../../ui';
import { rankUnits } from './situationUtils';

interface Props {
  units: readonly KafedraStat[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  linkFor: ((unit: KafedraStat) => string) | null;
  allLink?: string | null;
  isToday: boolean;
  big?: boolean;
}

/** "Bo'linmalar reytingi": bugun xodimlari eng yaxshi va eng past kelgan bo'linmalar. */
export function UnitsRanking({ units, loading, error, onRetry, linkFor, allLink, isToday, big }: Props) {
  const n = big ? 5 : 4;
  const { top, bottom, ranked } = rankUnits(units ?? [], n);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Bo'linmalar reytingi"
        subtitle={isToday ? `Bugun xodimlar davomati bo'yicha · ${formatNumber(ranked)} ta bo'linma` : `Shu kun xodimlar davomati bo'yicha · ${formatNumber(ranked)} ta bo'linma`}
        icon={Trophy}
        actions={
          allLink ? (
            <Link to={allLink} className={cn('inline-flex items-center gap-0.5 rounded-control text-[13px] font-medium text-primary hover:underline', focusRing)}>
              Barchasi <ChevronRight size={14} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2" aria-busy="true" aria-label="Yuklanmoqda">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-3">
              {Array.from({ length: n }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : error && !units ? (
        <ErrorState title="Bo'linmalarni yuklab bo'lmadi" message={error} onRetry={onRetry} />
      ) : ranked === 0 ? (
        <EmptyState
          compact
          bordered={false}
          icon={Trophy}
          title="Reyting uchun ma'lumot yetarli emas"
          description={isToday ? "Xodimlar kela boshlagach, bo'linmalar foiz bo'yicha shu yerda saralanadi." : "Bu kunda bo'linmalar bo'yicha davomat yozuvi yo'q."}
        />
      ) : (
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          <RankList title="Eng yaxshi" icon={Trophy} tone="success" rows={top} startRank={1} linkFor={linkFor} big={big} />
          {bottom.length > 0 && (
            <RankList title="E'tibor talab" icon={TrendingDown} tone="danger" rows={bottom} startRank={ranked} descending linkFor={linkFor} big={big} />
          )}
        </div>
      )}
    </Card>
  );
}

function RankList({
  title,
  icon: Icon,
  tone,
  rows,
  startRank,
  descending,
  linkFor,
  big,
}: {
  title: string;
  icon: typeof Trophy;
  tone: 'success' | 'danger';
  rows: KafedraStat[];
  startRank: number;
  descending?: boolean;
  linkFor: Props['linkFor'];
  big?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className={cn('mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em]', TONE_TEXT[tone])}>
        <Icon size={13} aria-hidden="true" /> {title}
      </p>
      <ol className="flex flex-col">
        {rows.map((unit, i) => {
          const rank = descending ? startRank - i : startRank + i;
          const expected = unit.present + unit.absent + unit.notYet;
          const body = (
            <>
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-subtle">{rank}</span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate font-medium text-fg', big ? 'text-[15px]' : 'text-[13px]')}>{unit.name}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  {UNIT_KIND_LABELS[unit.kind] ?? "Bo'linma"} · {formatNumber(unit.present)}/{formatNumber(expected)} keldi
                  {unit.late > 0 ? ` · ${formatNumber(unit.late)} kech` : ''}
                </span>
              </span>
              <span className="flex w-20 shrink-0 flex-col items-end gap-1">
                <span className={cn('font-semibold tabular-nums', TONE_TEXT[toneForRate(unit.rate)], big ? 'text-base' : 'text-sm')}>{formatPercent(unit.rate)}</span>
                <ProgressBar value={unit.rate} size="xs" className="w-full" ariaLabel={`${unit.name}: ${formatPercent(unit.rate)}`} />
              </span>
            </>
          );
          const cls = 'flex items-center gap-3 rounded-control px-1.5 py-2';
          return (
            <li key={unit.id}>
              {linkFor ? (
                <Link to={linkFor(unit)} className={cn(cls, 'transition-colors hover:bg-surface-2', focusRing)}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
