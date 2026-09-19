import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { useDialog } from './internal/useDialog';

const SIZE = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Sarlavha yonida (yopish tugmasidan oldin) — masalan "To'liq sahifa" havolasi. */
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
}

/** O'ngdan chiqadigan panel — ro'yxatdan chiqmasdan tafsilotni ko'rish
 *  (hodisa, shaxs, kamera). Telefonda to'liq kenglikda. */
export function Drawer({ open, onClose, title, subtitle, actions, children, footer, size = 'md' }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panelRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn('relative flex h-full w-full animate-slide-in-right flex-col border-l border-border bg-surface text-fg shadow-pop outline-none', SIZE[size])}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="truncate text-base font-semibold text-fg">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <div className="-mr-1.5 flex shrink-0 items-center gap-1">
            {actions}
            <IconButton icon={X} label="Yopish" size="sm" onClick={onClose} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
