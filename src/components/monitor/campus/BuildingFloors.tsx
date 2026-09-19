import { AlertTriangle, ChevronRight, Layers, VideoOff } from 'lucide-react';
import StatusBar from './StatusBar';
import { Badge, EmptyState, cn } from '../../../ui';
import type { CampusBuilding, CampusFloor } from '../../../types';

/** 2-daraja: bitta binoning kesimi. Qavatlar ustma-ust, eng yuqorisi
 * tepada — binoga qaragandagidek. Har qavat bosiladigan qator: kamera
 * soni, holat ulushi va bugungi signallar.
 *
 * Kamera ro'yxati bu yerda ham yuklanmaydi — u faqat qavat tanlanganda
 * keladi. */
export default function BuildingFloors({
  building,
  onOpenFloor,
}: {
  building: CampusBuilding;
  onOpenFloor: (floor: CampusFloor) => void;
}) {
  const stack = [...building.floors].reverse();

  if (stack.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Bu binoda kamera yo'q"
        description="Kameralarni «Sozlamalar → Kameralar» bo'limida binoga va qavatga biriktiring."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {stack.map((floor) => {
        const empty = floor.cameras === 0;
        return (
          <button
            key={floor.label}
            type="button"
            onClick={() => onOpenFloor(floor)}
            className={cn(
              'group flex items-center gap-4 rounded-card border px-4 py-3 text-left shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
              empty ? 'border-dashed border-border-strong/70 bg-surface/60' : 'border-border bg-surface',
            )}
          >
            <span
              className={cn(
                'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-control text-center',
                empty ? 'bg-surface-2 text-subtle' : 'bg-primary-soft text-primary',
              )}
            >
              <span className="text-base font-semibold leading-none tabular-nums">{floor.floor ?? '—'}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide">qavat</span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-fg">{floor.label}</span>
                {floor.noVideo > 0 && (
                  <Badge tone="warning" icon={VideoOff}>
                    {floor.noVideo} tasvirsiz
                  </Badge>
                )}
                {floor.eventsToday > 0 && (
                  <Badge tone="danger" icon={AlertTriangle}>
                    {floor.eventsToday} signal
                  </Badge>
                )}
              </span>
              <span className="mt-2 block">
                <StatusBar live={floor.live} noVideo={floor.noVideo} offline={floor.offline} />
              </span>
              <span className="mt-1.5 block text-xs text-muted">
                {floor.cameras} ta kamera · <span className="text-success">{floor.live} jonli</span> · {floor.offline} oflayn
              </span>
            </span>

            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-subtle group-hover:text-primary" />
          </button>
        );
      })}
    </div>
  );
}
