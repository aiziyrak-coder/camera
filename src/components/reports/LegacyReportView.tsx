import { History } from 'lucide-react';
import type { Report } from '../../types';

/** Tahlil ma'lumoti saqlanmagan eski hisobotlar — mazmuni saqlanadi, lekin
 *  grafik va solishtirish yo'qligi ochiq aytiladi. */
export default function LegacyReportView({ report }: { report: Report }) {
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
        <History size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Bu hisobot eski formatda saqlangan: grafiklar va oldingi davr bilan solishtirish yo&apos;q. To&apos;liq tahlil
        uchun «Tahlil» bo&apos;limida shu davrni tanlang.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {report.stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white/70 px-3 py-2">
            <p className="text-[11px] text-slate-500">{stat.label}</p>
            <p className="text-base font-extrabold tabular-nums text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {report.body && (
        <div className="rounded-2xl border border-white/70 bg-white/55 p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{report.body}</p>
        </div>
      )}

      {(report.sections ?? []).map((section) => (
        <div key={section.title} className="rounded-2xl border border-white/70 bg-white/55 p-4">
          <h4 className="mb-2 text-sm font-bold text-slate-800">{section.title}</h4>
          <dl className="divide-y divide-slate-100">
            {section.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <dt className="min-w-0 text-slate-600">{row.label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>
          {section.note && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{section.note}</p>}
        </div>
      ))}
    </div>
  );
}
