import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  /** Bosiladigan karta: hover va fokus holati. (onClick bilan birga.) */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article';
}

/** Oq (qorong'ida — to'q) sirt: 12px radius, 1px chegara, juda yengil soya. */
export function Card({ padding = 'md', interactive = false, as: Tag = 'div', className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        PADDING[padding],
        interactive &&
          'lift cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** O'ng tomondagi tugmalar/havolalar. */
  actions?: ReactNode;
  className?: string;
  /** Sarlavha darajasi (sahifa tuzilishi uchun). Standart h3. */
  level?: 2 | 3 | 4;
}

/** Karta sarlavhasi: chapda nom (+izoh), o'ngda harakatlar. `Card padding="md"` ichida ishlatiladi. */
export function CardHeader({ title, subtitle, icon: Icon, actions, className, level = 3 }: CardHeaderProps) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted">
            <Icon size={15} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <Heading className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-fg">{title}</Heading>
          {subtitle && <p className="text-[13px] leading-5 text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
