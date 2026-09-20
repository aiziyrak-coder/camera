import { cn, focusRing } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Soya yo'q — sirtlar 1px chiziq bilan ajraladi.
 *  primary = to'q ko'k to'ldirish, secondary = oq + chiziq, ghost = faqat matn. */
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border border-primary bg-primary text-primary-fg hover:bg-primary/90 active:bg-primary/85',
  secondary: 'border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
  ghost: 'border border-transparent text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger bg-danger text-danger-fg hover:bg-danger/90 active:bg-danger/85',
  soft: 'border border-primary/20 bg-primary-soft text-primary hover:border-primary/40 hover:bg-primary/15',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-[12px]',
  md: 'h-8 gap-1.5 px-3 text-[13px]',
  lg: 'h-[34px] gap-2 px-4 text-[14px]',
};

export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = { sm: 13, md: 14, lg: 16 };

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
    // Yorliq monoshriftda, o'rta qalinlikda, gap bosh harfli EMAS — jumla
    // yozuvi ("Qayta urinish"), chunki bu buyruq, sarlavha emas.
    'intel-code inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    focusRing,
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
    className,
  );
}
