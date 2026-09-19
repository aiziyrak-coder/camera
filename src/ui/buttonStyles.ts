import { cn, focusRing } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary/90 active:bg-primary/85',
  secondary: 'border border-border bg-surface text-fg shadow-sm hover:border-border-strong hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-danger-fg shadow-sm hover:bg-danger/90 active:bg-danger/85',
  soft: 'bg-primary-soft text-primary hover:bg-primary/15',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-[15px]',
};

export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = { sm: 15, md: 16, lg: 18 };

/** Tugma ko'rinishini boshqa element (masalan <a>, <label>) uchun olish. */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    focusRing,
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
    className,
  );
}
