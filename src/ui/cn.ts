/** Sinf nomlarini birlashtirish: `cn('a', cond && 'b', undefined)` → "a b". */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/** Barcha interaktiv elementlar uchun yagona fokus halqasi (klaviatura bilan). */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40';

/** Kiritish maydonlari (input/select) uchun umumiy ko'rinish. */
export const controlBase =
  'w-full rounded-control border border-border bg-surface text-fg shadow-[0_1px_0_0_rgb(16_24_40/0.02)] outline-none transition-colors placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-[3px] focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';

export const controlSizes = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-3.5 text-[15px]',
} as const;

export type ControlSize = keyof typeof controlSizes;
