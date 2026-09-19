import { useRef, type KeyboardEvent } from 'react';
import { Skeleton, cn } from '../../ui';
import { CELL_STATUS_LABEL, dayLabel, keyboardTarget, leadingBlanks, monthLabel, monthOf, type CalendarCell, type CellStatus } from '../../lib/attendanceCalendar';
import { UZ_WEEKDAYS_SHORT } from '../../lib/uzDate';

/** Katakdagi "binoda bo'lish" chizig'i shu davomiylikda to'la bo'ladi. */
const FULL_DAY_MINUTES = 9 * 60;

const CELL_STYLE: Record<CellStatus, string> = {
  keldi: 'border-transparent bg-success-soft text-success',
  kech_keldi: 'border-transparent bg-warning-soft text-warning',
  kelmadi: 'border-transparent bg-danger-soft text-danger',
  dam_olish: 'border-transparent bg-surface-2 text-subtle',
  malumot_yoq: 'border-dashed border-border-strong bg-surface text-muted',
  kelajak: 'border-transparent bg-transparent text-subtle/60',
};

const CALENDAR_LEGEND: CellStatus[] = ['keldi', 'kech_keldi', 'kelmadi', 'malumot_yoq', 'dam_olish'];

function DayCell({ cell, selected, dimmed, onOpen }: { cell: CalendarCell; selected: boolean; dimmed: boolean; onOpen: (date: string) => void }) {
  const future = cell.status === 'kelajak';
  const details = [CELL_STATUS_LABEL[cell.status], cell.checkIn ? `keldi ${cell.checkIn}` : null, cell.checkOut ? `ketdi ${cell.checkOut}` : null, cell.earlyLeave ? 'erta ketdi' : null]
    .filter(Boolean)
    .join(', ');
  const fill = cell.presenceMinutes ? Math.min(cell.presenceMinutes / FULL_DAY_MINUTES, 1) : 0;
  return (
    <button
      type="button"
      data-date={cell.date}
      disabled={future}
      onClick={() => onOpen(cell.date)}
      aria-label={`${dayLabel(cell.date)} — ${details}`}
      title={details}
      className={cn(
        'relative flex min-h-[3rem] flex-col justify-between rounded-control border p-1.5 text-left transition sm:min-h-[4.25rem] sm:p-2',
        CELL_STYLE[cell.status],
        future ? 'cursor-default' : 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        cell.isToday && 'ring-2 ring-primary',
        selected && 'shadow-[0_0_0_3px_rgb(var(--c-primary)/0.35)]',
        dimmed && 'opacity-40',
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={cn('text-xs sm:text-sm', cell.isToday ? 'font-bold' : 'font-semibold')}>{cell.day}</span>
        {cell.earlyLeave && <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />}
      </span>
      {cell.checkIn && (
        <span className="hidden truncate text-[10px] font-medium tabular-nums opacity-90 sm:block">
          {cell.checkIn}
          {cell.checkOut ? `–${cell.checkOut}` : ''}
        </span>
      )}
      {fill > 0 && (
        <span className="absolute inset-x-1.5 bottom-1 h-[3px] overflow-hidden rounded-full bg-fg/5" aria-hidden="true">
          <span className="block h-full rounded-full bg-current opacity-50" style={{ width: `${Math.round(fill * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

/** Oylik davomat kalendari (hafta dushanbadan). Strelkalar bilan kunlar
 *  orasida yuriladi; tanlangan oraliqdan tashqaridagi kunlar xiraroq. */
export function MonthCalendar({
  month,
  cells,
  workingWeekdays,
  selectedDate,
  onOpen,
  range,
  loading,
  showTitle = true,
}: {
  month: string;
  cells: CalendarCell[] | null;
  workingWeekdays: number[];
  selectedDate: string | null;
  onOpen: (date: string) => void;
  range?: { from: string; to: string };
  loading?: boolean;
  showTitle?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const date = (event.target as HTMLElement).dataset.date;
    const target = date ? keyboardTarget(date, event.key) : null;
    if (!target || monthOf(target) !== month) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`);
    if (button && !button.disabled) {
      event.preventDefault();
      button.focus();
    }
  }

  return (
    <div className="min-w-0">
      {showTitle && <h3 className="mb-2 text-sm font-semibold text-fg">{monthLabel(month)}</h3>}
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide sm:gap-1.5">
        {UZ_WEEKDAYS_SHORT.map((label, index) => (
          <span key={label} className={workingWeekdays.includes(index + 1) ? 'text-muted' : 'text-subtle'}>
            {label}
          </span>
        ))}
      </div>
      {loading || !cells ? (
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="min-h-[3rem] sm:min-h-[4.25rem]" />
          ))}
        </div>
      ) : (
        <div ref={gridRef} role="group" aria-label={`${monthLabel(month)} — davomat kalendari`} onKeyDown={handleKey} className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {Array.from({ length: leadingBlanks(month) }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden="true" />
          ))}
          {cells.map((cell) => (
            <DayCell
              key={cell.date}
              cell={cell}
              selected={cell.date === selectedDate}
              dimmed={Boolean(range && (cell.date < range.from || cell.date > range.to))}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted', className)}>
      {CALENDAR_LEGEND.map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded border', CELL_STYLE[status])} aria-hidden="true" />
          {CELL_STATUS_LABEL[status]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
        Erta ketdi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-4 rounded-full bg-subtle" aria-hidden="true" />
        Binoda bo'lish (9 soat — to'liq)
      </span>
    </div>
  );
}
