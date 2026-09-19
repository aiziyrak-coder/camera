import { useRef, type KeyboardEvent } from 'react';
import { cn, focusRing } from './cn';
import type { TabItem } from './urlTab';

export interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** 'underline' — sahifa bo'limlari (Page ostida); 'segmented' — kichik almashtirgich (davr, ko'rinish). */
  variant?: 'underline' | 'segmented';
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  /** Har bir tab paneli id'si uchun prefiks (aria-controls). */
  idPrefix?: string;
}

/** Tablar: klaviatura bilan (← → Home End), aria roli bilan. */
export function Tabs<T extends string>({ tabs, value, onChange, variant = 'underline', size = 'md', ariaLabel = "Bo'limlar", className, idPrefix }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = tabs.map((tab, i) => (tab.disabled ? -1 : i)).filter((i) => i >= 0);
    const position = enabled.indexOf(index);
    let target: number | undefined;
    if (event.key === 'ArrowRight') target = enabled[(position + 1) % enabled.length];
    else if (event.key === 'ArrowLeft') target = enabled[(position - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled[enabled.length - 1];
    if (target === undefined) return;
    event.preventDefault();
    refs.current[target]?.focus();
    onChange(tabs[target].id);
  }

  const underline = variant === 'underline';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        underline
          ? 'no-scrollbar -mb-px flex gap-1 overflow-x-auto border-b border-border sm:gap-4'
          : 'no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control border border-border bg-surface-2 p-0.5',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              focusRing,
              underline
                ? cn(
                    'rounded-t-control border-b-2 px-2 sm:px-1',
                    size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-sm',
                    active ? 'border-primary text-fg' : 'border-transparent text-muted hover:border-border-strong hover:text-fg',
                  )
                : cn(
                    'rounded-[6px] px-3',
                    size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
                    active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                  ),
            )}
          >
            {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" className={active ? 'text-primary' : undefined} />}
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none',
                  active ? 'bg-primary-soft text-primary' : 'bg-surface-3 text-muted',
                )}
              >
                {tab.count.toLocaleString('ru-RU')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
