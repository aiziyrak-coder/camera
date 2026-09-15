import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/** Grafik kartasi. `table` berilsa "Jadval" tugmasi chiqadi — grafikni
 *  o'qiy olmaydigan yoki aniq raqam kerak bo'lgan foydalanuvchi uchun.
 *  `pdfKey` — PDF eksport aynan shu grafikni rasm sifatida oladi. */
export default function ChartCard({
  title,
  subtitle,
  legend,
  action,
  table,
  pdfKey,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  action?: ReactNode;
  table?: ReactNode;
  pdfKey?: string;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`rounded-2xl border border-white/70 bg-white/55 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-indigo-600"
            >
              {showTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
              {showTable ? 'Grafik' : 'Jadval'}
            </button>
          )}
        </div>
      </div>
      {legend && !showTable && <div className="mb-2">{legend}</div>}
      <div data-pdf-chart={showTable ? undefined : pdfKey}>{showTable && table ? table : children}</div>
    </section>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
