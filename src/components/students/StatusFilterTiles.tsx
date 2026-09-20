import { cn, focusRing, formatNumber, TONE_SOLID, type Tone } from '../../ui';
import type { StudentFilter } from '../../lib/studentAttendance';

export interface FilterTile<T extends string = StudentFilter> {
  id: T;
  label: string;
  value: number;
  tone: Tone;
}

/** Holatlar bo'yicha sonlar — bir vaqtda ham ko'rsatkich, ham filtr:
 *  bosilganda setka shu holatdagilarga toraytiriladi. */
export function StatusFilterTiles<T extends string = StudentFilter>({
  tiles,
  total,
  value,
  onChange,
  big = false,
}: {
  tiles: FilterTile<T>[];
  total: number;
  value: T;
  onChange: (value: T) => void;
  big?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Holat bo'yicha filtr" className={cn('grid gap-2', tiles.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 min-[520px]:grid-cols-3 lg:grid-cols-6')}>
      {tiles.map((tile) => {
        const active = tile.id === value;
        const share = total > 0 && tile.id !== 'all' ? Math.round((tile.value / total) * 100) : null;
        // Nol plitkani bosish har doim bo'sh setka berardi — o'chirib qo'yiladi.
        const empty = tile.value === 0 && !active && tile.id !== 'all';
        return (
          <button
            key={tile.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={empty}
            title={empty ? `${tile.label}: 0 — filtrlash uchun hech kim yo'q` : undefined}
            onClick={() => onChange(active && tile.id !== 'all' ? ('all' as T) : tile.id)}
            className={cn(
              'flex min-w-0 flex-col rounded-control border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow]',
              active ? 'border-primary bg-primary-soft/60 ring-1 ring-primary/30' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/60',
              empty && 'cursor-default opacity-60 hover:border-border hover:bg-surface',
              focusRing,
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
              {tile.id !== 'all' && <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_SOLID[tile.tone])} aria-hidden="true" />}
              <span className="truncate">{tile.label}</span>
            </span>
            <span className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn('font-semibold tabular-nums tracking-tight text-fg', big ? 'text-3xl' : 'text-2xl')}>{formatNumber(tile.value)}</span>
              {share !== null && <span className="text-xs tabular-nums text-subtle">{share}%</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
