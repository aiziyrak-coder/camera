import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

/** Ro'yxat filtrlari paneli: sahifa pastga aylantirilganda ham tepada qoladi.
 *  `activeCount > 0` bo'lsa "Filtrlarni tozalash" tugmasi chiqadi. */
export default function FilterBar({
  children,
  activeCount = 0,
  onReset,
}: {
  children: ReactNode;
  activeCount?: number;
  onReset?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/75 px-3 py-2.5 backdrop-blur-xl">
      {children}
      {onReset && activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-indigo-600"
        >
          <RotateCcw size={13} />
          Filtrlarni tozalash ({activeCount})
        </button>
      )}
    </div>
  );
}
