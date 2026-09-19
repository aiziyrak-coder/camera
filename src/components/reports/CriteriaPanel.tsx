import { TONE_TEXT, cn, focusRing, Skeleton } from '../../ui';
import type { HisobotCriterion } from '../../lib/hisobotApi';

interface CriteriaPanelProps {
  criteria: HisobotCriterion[] | null;
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
}

/** Yon panel: mezonlar ro'yxati va har birining qisqa ko'rsatkichi.
 *  Kompyuterda — chapda ustun, telefonda — gorizontal aylanadigan qator. */
export default function CriteriaPanel({ criteria, value, onChange, loading }: CriteriaPanelProps) {
  if (!criteria) {
    return (
      <div className="flex gap-2 lg:flex-col" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-40 shrink-0 lg:w-full" />
        ))}
      </div>
    );
  }
  return (
    <nav aria-label="Mezonlar" className={cn('transition-opacity', loading && 'opacity-70')}>
      <p className="mb-2 hidden px-1 text-xs font-medium uppercase tracking-wide text-subtle lg:block">Mezonlar</p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {criteria.map((c) => {
          const active = c.key === value;
          return (
            <li key={c.key} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onChange(c.key)}
                aria-current={active ? 'true' : undefined}
                title={c.description}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-control border px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 font-semibold text-fg'
                    : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg lg:border-transparent lg:bg-transparent',
                  focusRing,
                )}
              >
                <span className="whitespace-nowrap lg:whitespace-normal">{c.label}</span>
                <span className={cn('tabular-nums text-[13px] font-semibold', TONE_TEXT[c.tone])}>{c.indicator}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
