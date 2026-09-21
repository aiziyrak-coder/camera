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
        'h-7 rounded-[4px] px-2.5 text-[12px] transition-colors',
        active ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-white/70 hover:text-fg',
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
      className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2"
    >
      <div className="glass flex items-center gap-0.5 rounded-[5px] p-0.5" role="group" aria-label="Sana">
        <Chip active={date === today} onClick={() => setDate(today)}>
          Bugun
        </Chip>
        <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
          Kecha
        </Chip>
        <label
          className={cn(
            'relative flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-[12px]',
            picked ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-white/70 hover:text-fg',
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

      <div className="glass flex items-center gap-0.5 rounded-[5px] p-0.5" role="group" aria-label="Kim">
        {SCOPES.map((item) => (
          <Chip key={item} active={scope === item} onClick={() => setScope(item)}>
            {SCOPE_LABEL[item]}
          </Chip>
        ))}
      </div>

      <span className="intel-micro ms-auto hidden sm:block">{formatUzDate(date)}</span>
    </motion.div>
  );
}
