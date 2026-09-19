import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Asboblar panelidagi ochiladigan menyu (ko'rinishlar, tur, yordam).
 * Tashqarida bosilganda yoki Escape bilan yopiladi. */
export default function WallPopover({
  label,
  icon,
  children,
  active = false,
  align = 'left',
  title,
  widthClass = 'w-80',
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: (close: () => void) => ReactNode;
  active?: boolean;
  align?: 'left' | 'right';
  title?: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={title}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          active || open ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white'
        }`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 ${widthClass} max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900 p-3 text-white shadow-2xl ring-1 ring-white/15 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
