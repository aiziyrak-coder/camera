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
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs font-medium text-muted">
        {TONES.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
            {MARKER_TONE_LABEL[tone]}
            <span className="ml-auto tabular-nums text-fg">{counts[tone]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-1.5">
          <Siren size={11} aria-hidden="true" className="text-danger" />
          Signalli
          <span className="ml-auto tabular-nums text-fg">{withEvents}</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">Bu qavatga kamera biriktirilmagan</p>
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
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {pulsingIds.has(camera.id) && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
                    )}
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{camera.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {camera.zone}
                      {!placed && ' · rejada joyi yo\'q'}
                    </span>
                  </span>
                  {camera.openEvents > 0 && (
                    <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-danger-fg">
                      {camera.openEvents}
                    </span>
                  )}
                  {!placed && <MapPin size={12} className="shrink-0 text-subtle" aria-label="Rejada joyi yo'q" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
