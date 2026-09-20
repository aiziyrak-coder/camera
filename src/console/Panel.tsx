import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../ui';
import { EASE, panelIn, scrim, spring } from './motion';

/**
 * Konsol paneli.
 *
 * Har panel setkada o'z joyini egallaydi va bosilganda BUTUN maydonga
 * yoyiladi — yangi sahifaga o'tilmaydi, shuning uchun kontekst
 * yo'qolmaydi va sahifa siljishi (scroll) ham kerak emas: joy yetmasa
 * panel kattalashadi.
 *
 * Yoyilish `layoutId` orqali: bitta element ikki holat orasida
 * siljiydi, ikkita alohida oyna emas.
 */

export interface PanelProps {
  id: string;
  title: string;
  /** O'ng yuqoridagi qisqa qiymat (son, holat). */
  badge?: ReactNode;
  /** Jonli manba — panel ustidan yorug' chiziq o'tadi. */
  live?: boolean;
  /** Setkadagi joyi: Tailwind `col-span-*` / `row-span-*`. */
  area?: string;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  /** Yoyilganda ko'rsatiladigan boshqacha (kengaytirilgan) mazmun. */
  full?: ReactNode;
  children: ReactNode;
}

export default function Panel({
  id,
  title,
  badge,
  live = false,
  area,
  expanded,
  onExpand,
  full,
  children,
}: PanelProps) {
  const body = (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/70 px-3 py-2">
        <h2 className="intel-micro !text-fg">{title}</h2>
        <span className="ms-auto flex items-center gap-2">
          {badge}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onExpand(expanded ? null : id);
            }}
            aria-label={expanded ? `${title} — yopish` : `${title} — kattalashtirish`}
            className="grid h-6 w-6 place-items-center rounded-[3px] text-subtle transition-colors hover:bg-white/70 hover:text-fg"
          >
            {expanded ? <X size={14} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
          </button>
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">{expanded && full ? full : children}</div>
    </>
  );

  return (
    <>
      <motion.section
        layoutId={`panel-${id}`}
        variants={panelIn}
        transition={spring}
        aria-label={title}
        onClick={() => !expanded && onExpand(id)}
        className={cn(
          'glass glass-hover relative flex min-h-0 flex-col overflow-hidden rounded-[6px]',
          live && 'scanline',
          !expanded && 'cursor-pointer',
          expanded && 'pointer-events-none opacity-0',
          area,
        )}
      >
        {body}
      </motion.section>

      <AnimatePresence>
        {expanded && (
          <>
            <motion.div
              variants={scrim}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={() => onExpand(null)}
              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px]"
            />
            <motion.section
              layoutId={`panel-${id}`}
              transition={spring}
              aria-label={title}
              className={cn(
                'glass fixed inset-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-[8px] sm:inset-6',
                live && 'scanline',
              )}
            >
              {body}
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Panel ichidagi katta raqam — konsolning asosiy "ovozi". */
export function BigNumber({
  value,
  unit,
  tone,
  sub,
}: {
  value: ReactNode;
  unit?: string;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 px-3 py-2">
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={cn('intel-code text-[clamp(28px,4.2vh,52px)] font-semibold leading-none', tone)}
      >
        {value}
        {unit && <span className="ms-1 text-[0.4em] font-medium text-muted">{unit}</span>}
      </motion.span>
      {sub && <span className="truncate text-[11px] text-muted">{sub}</span>}
    </div>
  );
}
