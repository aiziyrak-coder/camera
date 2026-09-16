import { AlertTriangle, ChevronRight, Layers, VideoOff } from 'lucide-react';
import StatusBar from './StatusBar';
import EmptyState from '../../ui/EmptyState';
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
        icon={<Layers size={18} />}
        title="Bu binoda kamera yo'q"
        description="Kameralarni admin panelidagi 'Kameralar va Zonalar' bo'limida binoga va qavatga biriktiring."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Tom — kesim binoga o'xshab ko'rinsin uchun. */}
      <div className="mx-auto h-3 w-[92%] rounded-t-xl bg-gradient-to-r from-indigo-200 via-indigo-300 to-indigo-200" />
      {stack.map((floor) => {
        const dark = floor.cameras === 0;
        return (
          <button
            key={floor.label}
            type="button"
            onClick={() => onOpenFloor(floor)}
            className={`group flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60 ${
              dark ? 'border-dashed border-slate-200 bg-slate-50/60' : 'border-white/70 bg-white/70'
            }`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-center font-extrabold ${
                dark ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600/10 text-indigo-700'
              }`}
            >
              <span className="text-base leading-none tabular-nums">
                {floor.floor ?? '—'}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wide">qavat</span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-slate-900">{floor.label}</span>
                {floor.noVideo > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <VideoOff size={10} />
                    {floor.noVideo} tasvirsiz
                  </span>
                )}
                {floor.eventsToday > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    <AlertTriangle size={10} />
                    {floor.eventsToday} signal
                  </span>
                )}
              </span>
              <span className="mt-1.5 block">
                <StatusBar live={floor.live} noVideo={floor.noVideo} offline={floor.offline} />
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                {floor.cameras} ta kamera · <span className="text-emerald-600">{floor.live} jonli</span> ·{' '}
                {floor.offline} oflayn
              </span>
            </span>

            <ChevronRight size={18} className="shrink-0 text-slate-300 group-hover:text-indigo-500" />
          </button>
        );
      })}
      {/* Poydevor. */}
      <div className="mx-auto h-2 w-[96%] rounded-b-xl bg-slate-200" />
    </div>
  );
}
