/** Ko'p variantli filtr (fakultet, kurs, bino) — yuzlab "chip" tugmalar o'rniga. */
export default function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = 'Barchasi',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-[14rem] rounded-lg border px-2.5 py-1.5 text-sm font-medium outline-none transition-colors focus:border-indigo-300 ${
          value ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-white/80 bg-white/70 text-slate-700'
        }`}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
