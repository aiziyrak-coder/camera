import { Check } from 'lucide-react';
import { MicroLabel, TONE_TEXT, cn, focusRing, Skeleton } from '../../ui';
import type { HisobotCriterion } from '../../lib/hisobotApi';

interface CriteriaPanelProps {
  criteria: HisobotCriterion[] | null;
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
}

/** Yon panel: "Nimani ko'rmoqchisiz?" — har bir qatorda nom, bir qatorli
 *  tushuntirish va hozirgi son. Son hisoblanmasa — nol emas, sababi.
 *  Tanlangani belgi bilan ham ko'rsatiladi (faqat rang emas). */
export default function CriteriaPanel({ criteria, value, onChange, loading }: CriteriaPanelProps) {
  if (!criteria) {
    return (
      <div className="flex gap-2 lg:flex-col" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-56 shrink-0 lg:w-full" />
        ))}
      </div>
    );
  }
  return (
    <nav aria-label="Hisobot turlari" className={cn('transition-opacity print-hide', loading && 'opacity-70')}>
      <p className="mb-2 hidden border-b border-border pb-1.5 lg:block">
        <MicroLabel>Nimani ko&apos;rmoqchisiz?</MicroLabel>
      </p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {criteria.map((c) => {
          const active = c.key === value;
          return (
            <li key={c.key} className="w-64 shrink-0 lg:w-auto lg:shrink">
              <button
                type="button"
                onClick={() => onChange(c.key)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col gap-0.5 border px-2.5 py-1.5 text-left text-[13px] transition-colors',
                  active
                    ? 'border-border-strong bg-primary-soft text-fg shadow-[inset_2px_0_0_rgb(var(--c-primary))]'
                    : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg lg:border-transparent lg:bg-transparent',
                  focusRing,
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={cn('min-w-0 lg:whitespace-normal', active && 'font-semibold')}>
                    {active && <Check size={13} className="mr-1 inline-block align-[-1px] text-primary" aria-hidden="true" />}
                    {c.label}
                  </span>
                  <span className={cn('intel-code shrink-0 text-[13px] font-semibold', TONE_TEXT[c.tone])}>
                    {c.indicator}
                  </span>
                </span>
                <span className="text-[11px] leading-4 text-subtle">
                  {c.unavailable ? c.unavailable : c.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 hidden px-1 text-[11px] leading-4 text-subtle lg:block">
        Tanlangan turga qarab o'ngdagi jadval va sonlar o'zgaradi.
      </p>
    </nav>
  );
}
