import type { ReactNode } from 'react';
import { cn } from './cn';

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** Qiymat ostida kichik izoh. */
  hint?: ReactNode;
}

const COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
} as const;

/** Nom → qiymat ro'yxati (<dl>). `layout="inline"` — nom chapda, qiymat o'ngda
 *  (tor panellar, Drawer uchun); `stacked` — nom ustida (kartalar uchun). */
export function KeyValue({
  items,
  columns = 1,
  layout = 'inline',
  className,
}: {
  items: KeyValueItem[];
  columns?: keyof typeof COLUMNS;
  layout?: 'inline' | 'stacked';
  className?: string;
}) {
  if (layout === 'inline') {
    return (
      <dl className={cn('divide-y divide-border', className)}>
        {items.map((item, index) => (
          <div key={index} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-[13px] text-muted">{item.label}</dt>
            <dd className="min-w-0 text-right text-sm font-medium text-fg">
              {item.value ?? '—'}
              {item.hint && <p className="text-xs font-normal text-muted">{item.hint}</p>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', COLUMNS[columns], className)}>
      {items.map((item, index) => (
        <div key={index} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-fg">
            {item.value ?? '—'}
            {item.hint && <p className="text-xs font-normal text-muted">{item.hint}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
