import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn, focusRing } from './cn';

type Variant = 'ghost' | 'secondary' | 'primary' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  secondary: 'border border-border bg-surface text-muted shadow-sm hover:bg-surface-2 hover:text-fg',
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary/90',
  danger: 'text-danger hover:bg-danger-soft',
};

const SIZE: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'h-8 w-8', icon: 16 },
  md: { box: 'h-9 w-9', icon: 18 },
  lg: { box: 'h-11 w-11', icon: 20 },
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Majburiy: ekran o'quvchi va tooltip uchun (aria-label + title). */
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Burchakdagi hisoblagich (masalan o'qilmagan hodisalar). 0 — ko'rinmaydi. */
  badge?: number;
  /** Toggle tugma holati (aria-pressed). */
  pressed?: boolean;
}

/** Faqat ikonkali tugma. `label` doim beriladi — ekran o'quvchi uchun. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', loading, badge, pressed, className, disabled, type = 'button', title, ...rest },
  ref,
) {
  const { box, icon } = SIZE[size];
  const badgeText = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={badgeText ? `${label} (${badgeText})` : label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50',
        focusRing,
        VARIANT[variant],
        pressed && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
        box,
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={icon} className="animate-spin" aria-hidden="true" /> : <Icon size={icon} aria-hidden="true" />}
      {badgeText && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums leading-none text-danger-fg ring-2 ring-surface">
          {badgeText}
        </span>
      )}
    </button>
  );
});
