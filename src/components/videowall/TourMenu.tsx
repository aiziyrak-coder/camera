import { Pause, Play, Repeat } from 'lucide-react';
import {
  TOUR_MAX_SECONDS,
  TOUR_MIN_SECONDS,
  normalizeTourInterval,
  type TourKind,
  type WallView,
} from '../../lib/videoWall';
import WallPopover from './WallPopover';

export interface TourSettings {
  kind: TourKind;
  intervalSec: number;
  /** Turda qatnashadigan ko'rinishlar; bo'sh — hammasi. */
  viewIds: string[];
}

export const DEFAULT_TOUR: TourSettings = { kind: 'views', intervalSec: 20, viewIds: [] };

/** localStorage'dan o'qilgan tur sozlamasini tekshirish. */
export function sanitizeTour(raw: unknown): TourSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    kind: value.kind === 'pages' ? 'pages' : 'views',
    intervalSec: normalizeTourInterval(value.intervalSec),
    viewIds: Array.isArray(value.viewIds) ? value.viewIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** Aylanish (tur): saqlangan ko'rinishlar yoki filtrlangan kameralar
 * sahifalari har N soniyada almashadi. Katak kattalashtirilganda yoki
 * varaq fonda bo'lsa tur to'xtab turadi. */
export default function TourMenu({
  settings,
  onChange,
  running,
  onToggle,
  views,
  pages,
}: {
  settings: TourSettings;
  onChange: (next: TourSettings) => void;
  running: boolean;
  onToggle: () => void;
  views: WallView[];
  pages: number;
}) {
  const selected = new Set(settings.viewIds);
  const canRun = settings.kind === 'views' ? views.length >= 2 : pages >= 2;

  return (
    <WallPopover
      icon={running ? <Repeat size={14} className="animate-spin [animation-duration:3s]" /> : <Repeat size={14} />}
      label={running ? `Tur · ${settings.intervalSec}s` : 'Tur'}
      active={running}
      title="Aylanish rejimi (T)"
      widthClass="w-72"
    >
      {() => (
        <div className="space-y-3 text-xs">
          <p className="text-sm font-bold">Aylanish rejimi</p>
          <div role="tablist" aria-label="Tur turi" className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
            {(
              [
                ['views', "Ko'rinishlar"],
                ['pages', 'Kamera sahifalari'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={settings.kind === value}
                onClick={() => onChange({ ...settings, kind: value })}
                className={`flex-1 rounded-md px-2 py-1 font-semibold ${
                  settings.kind === value ? 'bg-indigo-600 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="block font-semibold text-white/70">
            Almashish oralig&apos;i: {settings.intervalSec} soniya
            <input
              type="range"
              min={TOUR_MIN_SECONDS}
              max={120}
              step={5}
              value={Math.min(settings.intervalSec, 120)}
              onChange={(event) => onChange({ ...settings, intervalSec: normalizeTourInterval(Number(event.target.value)) })}
              className="mt-1 w-full accent-indigo-400"
            />
            <input
              type="number"
              min={TOUR_MIN_SECONDS}
              max={TOUR_MAX_SECONDS}
              value={settings.intervalSec}
              onChange={(event) => onChange({ ...settings, intervalSec: normalizeTourInterval(Number(event.target.value)) })}
              aria-label="Oraliq (soniya)"
              className="mt-1 w-20 rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs outline-none"
            />
          </label>

          {settings.kind === 'views' ? (
            <div>
              <p className="mb-1 font-semibold text-white/70">Qaysi ko&apos;rinishlar (tanlanmasa — hammasi)</p>
              {views.length === 0 ? (
                <p className="text-white/40">Avval ko&apos;rinishlarni saqlang.</p>
              ) : (
                <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                  {views.map((view) => (
                    <li key={view.id}>
                      <label className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={selected.has(view.id)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(view.id);
                            else next.delete(view.id);
                            onChange({ ...settings, viewIds: [...next] });
                          }}
                          className="h-3.5 w-3.5 accent-indigo-500"
                        />
                        <span className="truncate">{view.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-white/50">
              Yon paneldagi filtrga mos kameralar setka sig&apos;imi bo&apos;yicha sahifalanadi ({pages} sahifa).
            </p>
          )}

          <button
            type="button"
            onClick={onToggle}
            disabled={!running && !canRun}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold disabled:opacity-40 ${
              running ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
            {running ? "To'xtatish" : 'Boshlash'}
          </button>
          {!running && !canRun && (
            <p className="text-[10px] text-amber-300">
              {settings.kind === 'views' ? "Kamida 2 ta ko'rinish kerak." : "Kamida 2 sahifa bo'lishi kerak."}
            </p>
          )}
        </div>
      )}
    </WallPopover>
  );
}
