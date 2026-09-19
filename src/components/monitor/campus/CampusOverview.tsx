import { AlertTriangle, Building2, Camera, ChevronRight } from 'lucide-react';
import StatusBar from './StatusBar';
import { Card, EmptyState, Skeleton, TONE_SOFT, cn, type Tone } from '../../../ui';
import type { Campus, CampusBuilding, CampusFloor } from '../../../types';

/** 1-daraja: kampus. Har bino — karta, kartaning ichida binoning kesimi:
 * qavatlar ustma-ust, eng yuqorisi tepada.
 *
 * Qavat plitasini bosish to'g'ridan-to'g'ri o'sha qavat kameralariga
 * olib boradi (bino ekranidan o'tmasdan) — devor oldida turgan operator
 * uchun eng qisqa yo'l. Kartaning sarlavhasi esa binoning to'liq kesimini
 * ochadi. */
function floorTone(floor: CampusFloor): Tone {
  if (floor.cameras === 0) return 'neutral';
  if (floor.offline > 0 && floor.live === 0) return 'neutral';
  if (floor.noVideo > 0 || floor.offline > 0) return 'warning';
  return 'success';
}

function BuildingCard({
  building,
  onOpenBuilding,
  onOpenFloor,
}: {
  building: CampusBuilding;
  onOpenBuilding: () => void;
  onOpenFloor: (floor: CampusFloor) => void;
}) {
  // Kesim: yuqori qavat tepada — binoga qaraganda ko'z shunday ko'radi.
  const stack = [...building.floors].reverse();
  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onOpenBuilding}
        className="group -m-1 flex items-start justify-between gap-3 rounded-control p-1 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
            <Building2 size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-fg group-hover:text-primary">{building.name}</span>
            <span className="block text-xs text-muted">
              {building.floors.length} ta qavat · {building.cameras} ta kamera
            </span>
          </span>
        </span>
        <ChevronRight size={18} aria-hidden="true" className="mt-2 shrink-0 text-subtle group-hover:text-primary" />
      </button>

      <div className="flex flex-col gap-1">
        {stack.map((floor) => (
          <button
            key={floor.label}
            type="button"
            onClick={() => onOpenFloor(floor)}
            title={`${floor.label}: ${floor.cameras} kamera, ${floor.live} jonli, ${floor.offline} oflayn`}
            className={cn(
              'flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
              TONE_SOFT[floorTone(floor)],
              floor.cameras === 0 && 'opacity-70',
            )}
          >
            <span className="truncate">{floor.label}</span>
            <span className="flex items-center gap-1.5">
              {floor.eventsToday > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-danger-fg">
                  <AlertTriangle size={9} aria-hidden="true" />
                  {floor.eventsToday}
                </span>
              )}
              <span className="flex items-center gap-0.5 tabular-nums">
                <Camera size={11} aria-hidden="true" />
                {floor.cameras}
              </span>
            </span>
          </button>
        ))}
        {stack.length === 0 && <p className="rounded-[6px] bg-surface-2 px-2.5 py-2 text-xs text-muted">Kamera biriktirilmagan</p>}
      </div>

      <div className="mt-auto space-y-1.5">
        <StatusBar live={building.live} noVideo={building.noVideo} offline={building.offline} />
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="text-success">{building.live} jonli</span>
          {building.noVideo > 0 && <span className="text-warning">{building.noVideo} tasvirsiz</span>}
          <span>{building.offline} oflayn</span>
          {building.eventsToday > 0 && <span className="text-danger">{building.eventsToday} signal (bugun)</span>}
        </p>
      </div>
    </Card>
  );
}

export default function CampusOverview({
  campus,
  loading,
  onOpenBuilding,
  onOpenFloor,
}: {
  campus: Campus;
  loading: boolean;
  onOpenBuilding: (building: CampusBuilding) => void;
  onOpenFloor: (building: CampusBuilding, floor: CampusFloor) => void;
}) {
  if (loading && campus.buildings.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-56 rounded-card" />
        ))}
      </div>
    );
  }

  if (campus.buildings.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Kameralar hali binolarga biriktirilmagan"
        description="Kameralarni «Sozlamalar → Kameralar» bo'limida bino va qavatga biriktiring."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {campus.buildings.map((building) => (
        <BuildingCard
          key={building.id || 'unassigned'}
          building={building}
          onOpenBuilding={() => onOpenBuilding(building)}
          onOpenFloor={(floor) => onOpenFloor(building, floor)}
        />
      ))}
    </div>
  );
}
