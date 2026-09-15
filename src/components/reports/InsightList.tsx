import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import type { ReportInsight } from '../../types';

const LEVEL: Record<ReportInsight['level'], { icon: typeof Info; box: string; iconBox: string; label: string }> = {
  critical: { icon: AlertOctagon, box: 'border-red-200 bg-red-50/80', iconBox: 'bg-red-100 text-red-600', label: 'Shoshilinch' },
  warning: { icon: AlertTriangle, box: 'border-amber-200 bg-amber-50/80', iconBox: 'bg-amber-100 text-amber-600', label: 'Diqqat' },
  info: { icon: Info, box: 'border-indigo-200 bg-indigo-50/70', iconBox: 'bg-indigo-100 text-indigo-600', label: "Ma'lumot" },
  ok: { icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50/80', iconBox: 'bg-emerald-100 text-emerald-600', label: 'Yaxshi' },
};

/** "Qisqa xulosa" — rahbar 30 soniyada o'qiydigan qism: har karta raqam bilan
 *  va keyingi qadamga olib boradigan havola bilan. */
export default function InsightList({ insights }: { insights: ReportInsight[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {insights.map((insight, index) => {
        const style = LEVEL[insight.level];
        const Icon = style.icon;
        return (
          <article
            key={`${insight.title}-${index}`}
            className={`flex gap-3 rounded-2xl border p-4 ${style.box} ${insights.length === 1 ? 'md:col-span-2' : ''}`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}>
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{style.label}</p>
              <h4 className="text-sm font-bold text-slate-900">{insight.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{insight.text}</p>
              {insight.actionHref && (
                <Link
                  to={insight.actionHref}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                >
                  {insight.actionLabel ?? "Ko'rish"}
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
