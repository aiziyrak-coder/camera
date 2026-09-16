import { AlertTriangle, Building2, Camera, ChevronRight } from 'lucide-react';
import StatusBar from './StatusBar';
import { SkeletonBlock } from '../../ui/Skeleton';
import type { Campus, CampusBuilding, CampusFloor } from '../../../types';

/** 1-daraja: kampus. Har bino — karta, kartaning ichida binoning kesimi:
 * qavatlar ustma-ust, eng yuqorisi tepada.
 *
 * Qavat plitasini bosish to'g'ridan-to'g'ri o'sha qavat kameralariga
 * olib boradi (bino ekranidan o'tmasdan) — devor oldida turgan operator
 * uchun eng qisqa yo'l. Kartaning o'zi esa binoning to'liq kesimini
 * ochadi. */
function floorTone(floor: CampusFloor): string {
  if (floor.cameras === 0) return 'bg-slate-100 text-slate-400';
  if (floor.offline > 0 && floor.live === 0) return 'bg-slate-300 text-slate-600';
  if (floor.noVideo > 0 || floor.offline > 0) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
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
    <div className="glass flex flex-col gap-3 p-4 transition hover:shadow-lg">
      <button
        type="button"
        onClick={onOpenBuilding}
        className="group flex items-start justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
            <Building2 size={18} />
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-900 group-hover:text-indigo-700">
              {building.name}
            </span>
            <span className="block text-[11px] text-slate-500">
              {building.floors.length} ta qavat · {building.cameras} ta kamera
            </span>
          </span>
        </span>
        <ChevronRight size={16} className="mt-2 shrink-0 text-slate-300 group-hover:text-indigo-500" />
      </button>

      <div className="flex flex-col gap-1">
        {stack.map((floor) => (
          <button
            key={floor.label}
            type="button"
            onClick={() => onOpenFloor(floor)}
            title={`${floor.label}: ${floor.cameras} kamera, ${floor.live} jonli, ${floor.offline} oflayn`}
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:ring-2 hover:ring-indigo-300 ${floorTone(floor)}`}
          >
            <span className="truncate">{floor.label}</span>
            <span className="flex items-center gap-1.5">
              {floor.eventsToday > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-rose-500/90 px-1.5 text-[10px] font-bold text-white">
                  <AlertTriangle size={9} />
                  {floor.eventsToday}
                </span>
              )}
              <span className="flex items-center gap-0.5 tabular-nums">
                <Camera size={10} />
                {floor.cameras}
              </span>
            </span>
          </button>
        ))}
        {stack.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
            Kamera biriktirilmagan
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <StatusBar live={building.live} noVideo={building.noVideo} offline={building.offline} />
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-semibold text-slate-500">
          <span className="text-emerald-600">{building.live} jonli</span>
          {building.noVideo > 0 && <span className="text-amber-600">{building.noVideo} tasvirsiz</span>}
          <span>{building.offline} oflayn</span>
          {building.eventsToday > 0 && (
            <span className="text-rose-600">{building.eventsToday} signal (bugun)</span>
          )}
        </p>
      </div>
    </div>
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <SkeletonBlock key={key} className="h-56 rounded-2xl" />
        ))}
      </div>
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
