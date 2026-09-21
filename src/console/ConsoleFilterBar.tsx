import { motion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { cn } from '../ui';
import { formatUzDate } from '../ui/dates';
import { addDays } from '../lib/uzDate';
import { EASE } from './motion';
import { SCOPES, SCOPE_LABEL, type ConsoleFilter } from './consoleFilter';

/**
 * Konsolning filtr satri — uchala davomat paneli SHU yerdan boshqariladi.
 *
 * Ataylab bitta qator: konsolda joy qimmat. Tanlov URL'da saqlanadi
 * (`?sana=…&kim=…`), shuning uchun ko'rinishni havola qilib yuborish
 * mumkin; marshrut o'zgarmagani uchun konsol qayta yuklanmaydi.
 */

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'h-8 rounded-control px-3 text-[12px] font-semibold transition-all',
        active ? 'bg-primary text-primary-fg shadow-[0_6px_14px_-8px_rgb(45_83_222/0.7)]' : 'text-muted hover:bg-primary-soft hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

export default function ConsoleFilterBar({ filter }: { filter: ConsoleFilter }) {
  const { date, today, setDate, scope, setScope } = filter;
  const yesterday = addDays(today, -1);
  const picked = date !== today && date !== yesterday;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
      className="relative z-20 mx-3 mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-card border border-white/90 bg-white/65 px-2 py-1.5 shadow-card backdrop-blur-xl"
    >
      <div className="flex items-center gap-0.5 rounded-control bg-surface-2 p-0.5" role="group" aria-label="Sana">
        <Chip active={date === today} onClick={() => setDate(today)}>
          Bugun
        </Chip>
        <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
          Kecha
        </Chip>
        <label
          className={cn(
            'relative flex h-8 items-center gap-1.5 rounded-control px-3 text-[12px] font-semibold',
            picked ? 'bg-primary text-primary-fg shadow-[0_6px_14px_-8px_rgb(45_83_222/0.7)]' : 'text-muted hover:bg-primary-soft hover:text-primary',
          )}
        >
          <CalendarDays size={13} aria-hidden="true" />
          <span className="hidden sm:inline">{picked ? formatUzDate(date, { year: false }) : 'Kun tanlash'}</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            aria-label="Kun tanlash"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="flex items-center gap-0.5 rounded-control bg-surface-2 p-0.5" role="group" aria-label="Kim">
        {SCOPES.map((item) => (
          <Chip key={item} active={scope === item} onClick={() => setScope(item)}>
            {SCOPE_LABEL[item]}
          </Chip>
        ))}
      </div>

      <span className="ms-auto hidden pr-2 text-[12px] font-semibold text-muted sm:block">{formatUzDate(date)}</span>
    </motion.div>
  );
}
