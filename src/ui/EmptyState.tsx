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
  /** Illyustratsiya ohangi (standart: neytral). */
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'info';
  /** Uzuq chegara (standart). Karta ichida `false`. */
  bordered?: boolean;
  className?: string;
}

/** "Ma'lumot yo'q" holati: sabab va keyingi qadam bilan. */
export function EmptyState({ icon = Inbox, title, description, action, compact = false, bordered = true, tone = 'neutral', className }: EmptyStateProps) {
  let iconNode: ReactNode;
  if (isValidElement(icon)) iconNode = icon;
  else if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
    const Icon = icon as LucideIcon;
    iconNode = <Icon size={compact ? 18 : 24} strokeWidth={1.8} aria-hidden="true" />;
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
      {compact ? (
        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset ring-border', ILLU_TONE[tone].chip)}>{iconNode}</div>
      ) : (
        <EmptyIllustration tone={tone}>{iconNode}</EmptyIllustration>
      )}
      <p className={cn('font-semibold tracking-[-0.01em] text-fg', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

const ILLU_TONE = {
  neutral: { chip: 'bg-surface-2 text-muted', accent: 'text-subtle' },
  primary: { chip: 'bg-primary-soft text-primary', accent: 'text-primary' },
  success: { chip: 'bg-success-soft text-success', accent: 'text-success' },
  warning: { chip: 'bg-warning-soft text-warning', accent: 'text-warning' },
  info: { chip: 'bg-info-soft text-info', accent: 'text-info' },
} as const;

/** Tokenlar bilan bo'yalgan (mavzuga mos) bezak: halqalar, nuqtalar va
 *  o'rtada ikonka "kartochkasi". Faqat bezak — ekran o'quvchilardan yashirin. */
function EmptyIllustration({ tone, children }: { tone: keyof typeof ILLU_TONE; children: ReactNode }) {
  const t = ILLU_TONE[tone];
  return (
    <div className="relative mb-4 h-[104px] w-[152px]" aria-hidden="true">
      <svg viewBox="0 0 152 104" className="absolute inset-0 h-full w-full" fill="none">
        <circle cx="76" cy="52" r="50" className="stroke-border" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx="76" cy="52" r="36" className="fill-surface-2 stroke-border" strokeWidth="1" />
        <g className={t.accent} fill="currentColor">
          <circle cx="18" cy="30" r="3" opacity="0.35" />
          <circle cx="136" cy="22" r="2.5" opacity="0.5" />
          <circle cx="130" cy="84" r="3.5" opacity="0.25" />
          <circle cx="26" cy="82" r="2" opacity="0.45" />
        </g>
        <g className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round">
          <path d="M8 52h10M134 52h10" opacity="0.6" />
        </g>
      </svg>
      <div
        className={cn(
          'absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] items-center justify-center rounded-[14px] shadow-card ring-1 ring-inset ring-border',
          t.chip,
        )}
      >
        {children}
      </div>
    </div>
  );
}
