import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export interface ErrorStateProps {
  message?: string | null;
  title?: string;
  onRetry?: () => void;
  /** 'inline' — tor banner (jadval/karta ustida); 'block' — markazdagi katta holat. */
  variant?: 'inline' | 'block';
  className?: string;
}

/** Xato holati: nima bo'ldi + "Qayta urinish". */
export function ErrorState({ message, title = "Ma'lumotni olib bo'lmadi", onRetry, variant = 'inline', className }: ErrorStateProps) {
  if (variant === 'block') {
    return (
      <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        {message && <p className="mt-1 max-w-md text-[13px] text-muted">{message}</p>}
        {onRetry && (
          <Button className="mt-4" icon={RotateCcw} onClick={onRetry}>
            Qayta urinish
          </Button>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className={cn('flex flex-wrap items-start gap-3 rounded-card border border-danger/25 bg-danger-soft px-4 py-3', className)}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {message && <p className="text-[13px] text-muted">{message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" icon={RotateCcw} onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}
