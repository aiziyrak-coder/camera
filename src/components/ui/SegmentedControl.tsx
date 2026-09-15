export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Bir nechta variantdan bittasini tanlash — sahifalardagi takroriy "chip"
 *  tugmalar o'rniga bitta komponent. */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-white/50 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            } ${active ? 'bg-indigo-600 text-white shadow-btn' : 'text-slate-600 hover:bg-white/80'}`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${active ? 'text-white/80' : 'text-slate-400'}`}>
                {option.count.toLocaleString('ru-RU')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
