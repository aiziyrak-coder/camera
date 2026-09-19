import { isValidElement, type ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface EmptyStateProps {
  /** Lucide ikonka komponenti yoki tayyor element. */
  icon?: LucideIcon | ReactNode;
  title: ReactNode;
  /** Nega bo'sh va nima qilish mumkin. */
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  /** Uzuq chegara (standart). Karta ichida `false`. */
  bordered?: boolean;
  className?: string;
}

/** "Ma'lumot yo'q" holati: sabab va keyingi qadam bilan. */
export function EmptyState({ icon = Inbox, title, description, action, compact = false, bordered = true, className }: EmptyStateProps) {
  let iconNode: ReactNode;
  if (isValidElement(icon)) iconNode = icon;
  else if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
    const Icon = icon as LucideIcon;
    iconNode = <Icon size={compact ? 18 : 22} aria-hidden="true" />;
  } else iconNode = icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        bordered && 'rounded-card border border-dashed border-border-strong/70 bg-surface/60',
        compact ? 'px-4 py-6' : 'px-6 py-12 sm:py-16',
        className,
      )}
    >
      <div className={cn('mb-3 flex items-center justify-center rounded-full bg-surface-2 text-muted', compact ? 'h-10 w-10' : 'h-12 w-12')}>{iconNode}</div>
      <p className={cn('font-semibold text-fg', compact ? 'text-sm' : 'text-[15px]')}>{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
