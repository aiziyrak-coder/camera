import { ChevronDown } from 'lucide-react';
import type { ReportAnalytics } from '../../types';

const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <caption className="mb-2 text-left text-sm font-bold text-slate-800">{caption}</caption>
        <thead className="bg-white/70 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${i === 0 ? '' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-1.5 ${i === 0 ? 'text-slate-700' : 'text-right'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Operator uchun: grafiklar ortidagi aniq raqamlar. Standart holatda yopiq —
 *  rahbar ko'rinishini to'ldirib yubormaydi. */
export default function DetailTables({ analytics }: { analytics: ReportAnalytics }) {
  const { staff, students } = analytics.attendance;
  return (
    <details className="group rounded-2xl border border-white/70 bg-white/45">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-slate-800">
        Batafsil jadvallar (operator uchun)
        <ChevronDown size={16} className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-6 border-t border-white/70 px-4 py-4">
        <Table
          caption="Davomat kunlar bo'yicha"
          head={['Sana', 'Xodim: keldi', 'Xodim: kech', 'Xodim: kelmadi', 'Xodim %', 'Talaba: keldi', 'Talaba: kech', 'Talaba %']}
          rows={staff.byDay.map((day, i) => [
            day.date,
            day.keldi,
            day.kechKeldi,
            day.kelmadi,
            pct(day.rate),
            students.byDay[i]?.keldi ?? 0,
            students.byDay[i]?.kechKeldi ?? 0,
            pct(students.byDay[i]?.rate ?? null),
          ])}
        />
        <Table
          caption="AI signallar kunlar bo'yicha"
          head={['Sana', 'Past', "O'rta", 'Yuqori', 'Jami']}
          rows={analytics.security.byDay.map((day) => [day.date, day.past, day.orta, day.yuqori, day.total])}
        />
        {analytics.security.topModules.length > 0 && (
          <Table
            caption="Modullar"
            head={['Modul', 'Signallar', 'Tasdiqlangan', 'Rad etilgan', "Ko'rilmagan", 'Aniqlik']}
            rows={analytics.security.topModules.map((m) => [
              `№${m.code} ${m.name}`,
              m.count,
              m.confirmed,
              m.rejected,
              m.unreviewed,
              pct(m.precision),
            ])}
          />
        )}
      </div>
    </details>
  );
}
