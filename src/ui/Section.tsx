import type { ReactNode } from 'react';
import { cn } from './cn';

/** Sahifa ichidagi nomlangan blok (karta ramkasiz): sarlavha + izoh + o'ngda harakatlar. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn('min-w-0', className)} aria-labelledby={id ? `${id}-title` : undefined} id={id}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-fg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
