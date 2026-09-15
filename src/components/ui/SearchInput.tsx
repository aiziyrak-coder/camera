import { Search, X } from 'lucide-react';

/** Qidiruv maydoni: tozalash tugmasi va Esc. Serverga so'rovni debounce
 *  qilish chaqiruvchida (useServerPage) — bu komponent faqat kiritish. */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full max-w-xs ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pl-9 pr-8 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-200 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Qidiruvni tozalash"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
