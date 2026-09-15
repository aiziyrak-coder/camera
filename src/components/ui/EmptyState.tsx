import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/** "Ma'lumot yo'q" — nima uchun yo'qligi va nima qilish kerakligi bilan. */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-white/30 text-center ${
        compact ? 'px-4 py-6' : 'px-6 py-12'
      }`}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox size={18} />}
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
