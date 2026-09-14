import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';

interface FieldWrapperProps {
  label: string;
  error?: string;
  children: ReactNode;
}

function FieldWrapper({ label, error, children }: FieldWrapperProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-red-500">{error}</p>}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, className, ...rest }: TextFieldProps) {
  return (
    <FieldWrapper label={label} error={error}>
      <input
        {...rest}
        aria-invalid={!!error}
        className={`w-full rounded-xl border bg-white/60 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 ${
          error
            ? 'border-red-300 focus:border-red-400'
            : 'border-white/80 focus:border-indigo-300'
        } ${className ?? ''}`}
      />
    </FieldWrapper>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, error, options, placeholder, className, ...rest }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} error={error}>
      <select
        {...rest}
        aria-invalid={!!error}
        className={`w-full rounded-xl border bg-white/60 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors ${
          error
            ? 'border-red-300 focus:border-red-400'
            : 'border-white/80 focus:border-indigo-300'
        } ${className ?? ''}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
