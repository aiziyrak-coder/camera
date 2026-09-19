import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, controlBase, controlSizes, type ControlSize } from './cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Bo'sh qiymatli birinchi variant ("Barcha fakultetlar"). Berilmasa — yo'q. */
  placeholder?: string;
  /** Maydon ichida chapda ko'rinadigan qisqa yorliq ("Fakultet:"). */
  label?: string;
  ariaLabel?: string;
  size?: ControlSize;
  disabled?: boolean;
  invalid?: boolean;
  /** Filtr sifatida: qiymat tanlanganda ajralib turadi. */
  highlightActive?: boolean;
  className?: string;
  id?: string;
  'aria-describedby'?: string;
}

/** Tanlash maydoni (native <select>): telefonda tizim ro'yxati ochiladi,
 *  klaviatura va ekran o'quvchi bilan to'liq ishlaydi. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { value, onChange, options, placeholder, label, ariaLabel, size = 'md', disabled, invalid, highlightActive = false, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const active = highlightActive && value !== '';
  return (
    <div className={cn('relative inline-flex w-full min-w-0 sm:w-auto', className)}>
      {label && (
        <label htmlFor={selectId} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] text-muted">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        value={value}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel ?? placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={rest['aria-describedby']}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          controlBase,
          controlSizes[size],
          'cursor-pointer appearance-none truncate pr-9 font-medium',
          active && 'border-primary/50 bg-primary-soft text-primary',
          invalid && 'border-danger',
        )}
        // Yorliq kengligiga taxminiy joy (Inter 13px ≈ 0.45rem/belgi).
        style={label ? { paddingLeft: `calc(${label.length * 0.45}rem + 1.1rem)` } : undefined}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle" />
    </div>
  );
});
