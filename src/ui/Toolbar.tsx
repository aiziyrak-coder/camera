import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export interface ToolbarProps {
  /** Filtrlar: SearchInput, Select, DatePicker... (chapdan). */
  children: ReactNode;
  /** O'ng tomonda (masalan "Eksport", ko'rinish almashtirgich). */
  end?: ReactNode;
  /** Faol filtrlar soni — 0 dan katta bo'lsa "Tozalash" chiqadi. */
  activeCount?: number;
  onReset?: () => void;
  /** Aylantirilganda yuqorida yopishib turadi. */
  sticky?: boolean;
  className?: string;
}

/** Filtrlar qatori — har sahifada bir xil joyda (sarlavha/tablar ostida)
 *  va bir xil ko'rinishda. Telefonda elementlar qatorlarga o'raladi. */
export function Toolbar({ children, end, activeCount = 0, onReset, sticky = false, className }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Filtrlar"
      className={cn(
        'flex flex-wrap items-center gap-2',
        sticky && '-mx-1 rounded-card bg-bg/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-bg/75 sticky top-14 z-20',
        className,
      )}
    >
      {children}
      {onReset && activeCount > 0 && (
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset}>
          Tozalash ({activeCount})
        </Button>
      )}
      {end && <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>}
    </div>
  );
}

/** Nomi boshqacha, vazifasi bir xil — eski FilterBar nomi bilan qidiruvchilar uchun. */
export const FilterBar = Toolbar;
