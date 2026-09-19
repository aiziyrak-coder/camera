import { MapPin, Siren } from 'lucide-react';
import { MARKER_TONE_COLOR, MARKER_TONE_LABEL, cameraAttentionRank, markerTone, type MarkerTone } from '../../lib/floorPlan';
import type { FloorPlanCamera } from '../../lib/floorPlansApi';

const TONES: MarkerTone[] = ['online', 'noVideo', 'offline'];

/** Ko'rish rejimidagi yon panel: holat bo'yicha sanoq (legend ham
 *  vazifasini bajaradi) va kameralar ro'yxati — avval e'tibor talab
 *  qiladiganlari. Rejaga qo'yilmagan kamera ham shu yerda ko'rinadi,
 *  aks holda u umuman ko'zdan yo'qolardi. */
export default function FloorPlanCameraList({
  cameras,
  placedIds,
  pulsingIds,
  onSelect,
}: {
  cameras: FloorPlanCamera[];
  placedIds: Set<string>;
  pulsingIds: Set<string>;
  onSelect: (camera: FloorPlanCamera) => void;
}) {
  const counts: Record<MarkerTone, number> = { online: 0, noVideo: 0, offline: 0 };
  let withEvents = 0;
  for (const camera of cameras) {
    counts[markerTone(camera)] += 1;
    if (camera.openEvents > 0) withEvents += 1;
  }
  const sorted = [...cameras].sort(
    (a, b) => cameraAttentionRank(a) - cameraAttentionRank(b) || a.name.localeCompare(b.name, 'uz'),
  );

  return (
    <div className="glass-deep flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-3 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-slate-600">
        {TONES.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
            {MARKER_TONE_LABEL[tone]}
            <span className="ml-auto tabular-nums text-slate-800">{counts[tone]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2 py-1.5">
          <Siren size={11} className="text-red-500" />
          Signalli
          <span className="ml-auto tabular-nums text-slate-800">{withEvents}</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Bu qavatga kamera biriktirilmagan</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {sorted.map((camera) => {
            const tone = markerTone(camera);
            const placed = placedIds.has(camera.id);
            return (
              <li key={camera.id}>
                <button
                  type="button"
                  onClick={() => onSelect(camera)}
                  className="flex w-full items-center gap-2 rounded-lg bg-white/60 px-2 py-1.5 text-left transition-colors hover:bg-white"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {pulsingIds.has(camera.id) && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    )}
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-700">{camera.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">
                      {camera.zone}
                      {!placed && ' · rejada joyi yo\'q'}
                    </span>
                  </span>
                  {camera.openEvents > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {camera.openEvents}
                    </span>
                  )}
                  {!placed && <MapPin size={12} className="shrink-0 text-slate-300" aria-label="Rejada joyi yo'q" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
