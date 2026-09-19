import { useEffect, useMemo, useState } from 'react';
import { ImageUp, Map as MapIcon, Siren } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '../../ui';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { MARKER_TONE_COLOR, MARKER_TONE_LABEL, cameraAttentionRank, markerTone, type MarkerTone } from '../../lib/floorPlan';
import { listBuildingCameras, type FloorPlan, type FloorPlanCamera } from '../../lib/floorPlansApi';
import { CAMERA_REFRESH_MS } from './useFloorPlanCameras';

const TONES: MarkerTone[] = ['online', 'noVideo', 'offline'];

/** Chizmasiz qavat sxemasi: bino -> qavatlar -> kameralar (holat rangi bilan).
 *  Chizma yuklash ixtiyoriy — yuklangan qavatda "Chizmada ko'rish" chiqadi. */
export default function FloorSchematic({
  buildingId,
  plans,
  canEdit,
  onOpenCamera,
  onOpenPlan,
  onUpload,
}: {
  buildingId: string;
  plans: FloorPlan[];
  canEdit: boolean;
  onOpenCamera: (camera: FloorPlanCamera) => void;
  onOpenPlan: (floor: number) => void;
  onUpload: (floor: number) => void;
}) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<FloorPlanCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setCameras(null);
  }, [buildingId]);

  useEffect(() => {
    if (!token || !buildingId) return;
    const controller = new AbortController();
    listBuildingCameras(token, buildingId, { signal: controller.signal })
      .then((res) => {
        setCameras(res);
        setError(null);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Kameralarni yuklab bo'lmadi");
      });
    return () => controller.abort();
  }, [token, buildingId, nonce]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNonce((n) => n + 1);
    }, CAMERA_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const floors = useMemo(() => {
    const map = new Map<number | null, FloorPlanCamera[]>();
    for (const camera of cameras ?? []) {
      const list = map.get(camera.floor) ?? [];
      list.push(camera);
      map.set(camera.floor, list);
    }
    for (const plan of plans) if (!map.has(plan.floor)) map.set(plan.floor, []);
    return [...map.entries()].sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b));
  }, [cameras, plans]);

  if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (cameras === null) return <Skeleton className="h-[420px] rounded-card" />;
  if (floors.length === 0) {
    return <EmptyState icon={MapIcon} title="Bu binoga kamera biriktirilmagan" description="Kameralar sahifasida kameraga bino va qavat belgilang." />;
  }

  const total: Record<MarkerTone, number> = { online: 0, noVideo: 0, offline: 0 };
  for (const camera of cameras) total[markerTone(camera)] += 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span className="font-medium text-fg">{cameras.length} ta kamera</span>
        {TONES.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKER_TONE_COLOR[tone] }} />
            {MARKER_TONE_LABEL[tone]} <b className="tabular-nums text-fg">{total[tone]}</b>
          </span>
        ))}
        <span className="ml-auto text-xs">Kamerani bosing — jonli tasvir ochiladi</span>
      </div>

      {floors.map(([floor, list]) => {
        const plan = floor === null ? undefined : plans.find((p) => p.floor === floor);
        const bad = list.filter((c) => markerTone(c) !== 'online').length;
        const sorted = [...list].sort(
          (a, b) => cameraAttentionRank(a) - cameraAttentionRank(b) || a.name.localeCompare(b.name, 'uz'),
        );
        return (
          <section key={floor ?? 'none'} className="rounded-card border border-border bg-surface p-3 shadow-card">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-fg">{floor === null ? 'Qavati belgilanmagan' : `${floor}-qavat`}</h2>
              <span className="text-[13px] text-muted">
                {list.length} kamera{bad > 0 && <span className="text-danger"> · {bad} tasida muammo</span>}
              </span>
              <span className="ml-auto flex gap-2">
                {plan && (
                  <Button size="sm" icon={MapIcon} onClick={() => onOpenPlan(plan.floor)}>
                    Chizmada ko&apos;rish
                  </Button>
                )}
                {!plan && canEdit && floor !== null && (
                  <Button size="sm" variant="ghost" icon={ImageUp} onClick={() => onUpload(floor)}>
                    Chizma qo&apos;shish
                  </Button>
                )}
              </span>
            </header>
            {sorted.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted">Kamera yo&apos;q</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
                {sorted.map((camera) => {
                  const tone = markerTone(camera);
                  return (
                    <li key={camera.id}>
                      <button
                        type="button"
                        onClick={() => onOpenCamera(camera)}
                        className="flex w-full items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
                        style={{ borderLeft: `4px solid ${MARKER_TONE_COLOR[tone]}` }}
                        title={MARKER_TONE_LABEL[tone]}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-fg">{camera.name}</span>
                          <span className="block truncate text-xs text-muted">{camera.zone || MARKER_TONE_LABEL[tone]}</span>
                        </span>
                        {camera.openEvents > 0 && (
                          <span className="flex items-center gap-0.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-danger-fg">
                            <Siren size={10} aria-hidden="true" />
                            {camera.openEvents}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
