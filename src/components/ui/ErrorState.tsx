import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorState({
  message,
  onRetry,
  title = "Ma'lumotni olib bo'lmadi",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-800">{title}</p>
        <p className="text-xs text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <RotateCcw size={13} />
          Qayta urinish
        </button>
      )}
    </div>
  );
}
