import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, ImageUp, Layers, Loader2, Map as MapIcon, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { SkeletonBlock } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import FloorPlanCanvas, { type CanvasMarker, type FloorPlanCanvasHandle } from '../../components/floorplan/FloorPlanCanvas';
import FloorPlanCameraList from '../../components/floorplan/FloorPlanCameraList';
import FloorPlanEditPanel from '../../components/floorplan/FloorPlanEditPanel';
import FloorPlanUploadModal from '../../components/floorplan/FloorPlanUploadModal';
import CameraDetailDrawer from '../../components/floorplan/CameraDetailDrawer';
import { useFloorPlanCameras } from '../../components/floorplan/useFloorPlanCameras';
import { useUnsavedChangesGuard } from '../../components/floorplan/useUnsavedChangesGuard';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useBuildings } from '../../lib/useBuildings';
import { useLiveEvents } from '../../lib/realtime';
import {
  clampUnit,
  diffPositions,
  markerTone,
  normalizeRotation,
  type PlanPosition,
  type Point,
  type PositionMap,
} from '../../lib/floorPlan';
import {
  deleteFloorPlan,
  listFloorPlans,
  savePlanPositions,
  type FloorPlan,
  type FloorPlanCamera,
} from '../../lib/floorPlansApi';

/** Realtime signal kelgan marker shuncha vaqt "urib" turadi. */
const PULSE_MS = 20_000;
const UNSAVED_MESSAGE = "Rejadagi o'zgarishlar saqlanmagan. Baribir chiqasizmi?";

function serverPosition(camera: FloorPlanCamera): PlanPosition | null {
  if (!camera.assigned || camera.planX === null || camera.planY === null) return null;
  return { x: camera.planX, y: camera.planY, rotation: camera.planRotation };
}

/** Qavat rejalari — binoning qavat chizmasi ustida kameralar (Smart Map).
 *
 * Ko'rish: marker rangi holatni bildiradi (yashil — jonli, sariq —
 * tasvir yo'q, qizil — oflayn), qizil nishon — oxirgi 24 soatdagi ochiq
 * signallar. Markerni bosish jonli tasvir va signallarni ochadi.
 *
 * Tahrir (editCameraLocation): reja yuklash/almashtirish, kameralarni
 * ro'yxatdan sudrab qo'yish, siljitish, burish va olib tashlash. Barcha
 * o'zgarishlar qoralamada to'planadi va "Saqlash" bilan birdan yuboriladi. */
export default function FloorPlansPage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('editCameraLocation', role);
  const canViewLive = can('viewLive', role);
  const canReviewEvents = can('reviewEvents', role);
  const toast = useToast();
  const { buildings, loading: buildingsLoading } = useBuildings();
  const [params, setParams] = useSearchParams();
  const buildingId = params.get('bino') ?? '';
  const floorParam = params.get('qavat');

  // --- Rejalar ro'yxati -------------------------------------------------
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansNonce, setPlansNonce] = useState(0);
  const reloadPlans = useCallback(() => setPlansNonce((n) => n + 1), []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setPlansLoading(true);
    listFloorPlans(token, undefined, { signal: controller.signal })
      .then((res) => {
        setPlans(res);
        setPlansError(null);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setPlansError(err instanceof ApiError ? err.message : "Qavat rejalarini yuklab bo'lmadi");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlansLoading(false);
      });
    return () => controller.abort();
  }, [token, plansNonce]);

  const building = buildings.find((b) => b.id === buildingId) ?? null;
  const buildingPlans = useMemo(
    () => plans.filter((p) => p.buildingId === buildingId).sort((a, b) => a.floor - b.floor),
    [plans, buildingId],
  );
  const floorOptions = useMemo(() => {
    const floors = new Set<number>(buildingPlans.map((p) => p.floor));
    for (let n = 1; n <= (building?.floors ?? 0); n += 1) floors.add(n);
    return [...floors].sort((a, b) => a - b);
  }, [buildingPlans, building]);
  const parsedFloor = floorParam !== null && /^-?\d+$/.test(floorParam) ? Number(floorParam) : null;
  const floor = parsedFloor ?? buildingPlans[0]?.floor ?? floorOptions[0] ?? 1;
  const plan = buildingPlans.find((p) => p.floor === floor) ?? null;

  // Bino tanlanmagan bo'lsa — rejasi bor birinchi bino (yoki shunchaki birinchisi).
  useEffect(() => {
    if (buildingId || buildings.length === 0 || plansLoading) return;
    const withPlan = buildings.find((b) => plans.some((p) => p.buildingId === b.id));
    const first = withPlan ?? buildings[0];
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('bino', first.id);
        return next;
      },
      { replace: true },
    );
  }, [buildingId, buildings, plans, plansLoading, setParams]);

  // --- Tahrir holati ----------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState<PositionMap>({});
  const [draft, setDraft] = useState<PositionMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const canvasRef = useRef<FloorPlanCanvasHandle>(null);

  const { cameras, loading: camerasLoading, error: camerasError, reload: reloadCameras } = useFloorPlanCameras(
    plan?.id ?? null,
    editing && canEdit,
  );

  const changes = useMemo(() => (editing ? diffPositions(original, draft) : []), [editing, original, draft]);
  const dirty = changes.length > 0;
  useUnsavedChangesGuard(editing && dirty, UNSAVED_MESSAGE);

  const confirmDiscard = useCallback(() => !(editing && dirty) || window.confirm(UNSAVED_MESSAGE), [editing, dirty]);

  function resetEditing() {
    setEditing(false);
    setOriginal({});
    setDraft({});
    setSelectedId(null);
    setPlacingId(null);
  }

  function selectLocation(nextBuilding: string, nextFloor: number | null) {
    if (!confirmDiscard()) return;
    resetEditing();
    setDrawerId(null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('bino', nextBuilding);
        if (nextFloor === null) next.delete('qavat');
        else next.set('qavat', String(nextFloor));
        return next;
      },
      { replace: true },
    );
  }

  function startEditing() {
    const snapshot: PositionMap = {};
    for (const camera of cameras) {
      if (camera.assigned) snapshot[camera.id] = serverPosition(camera);
    }
    setOriginal(snapshot);
    setDraft(snapshot);
    setSelectedId(null);
    setPlacingId(null);
    setDrawerId(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (!confirmDiscard()) return;
    resetEditing();
  }

  async function saveEditing() {
    if (!plan || !dirty) return;
    setSaving(true);
    try {
      const result = await savePlanPositions(token, plan.id, changes);
      toast.success(
        result.assigned > 0
          ? `Saqlandi: ${result.updated} ta kamera, ${result.assigned} tasi shu qavatga biriktirildi`
          : `Saqlandi: ${result.updated} ta kamera joylashuvi`,
      );
      resetEditing();
      reloadCameras();
      reloadPlans();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tarmoq xatosi — o'zgarishlar saqlanmadi");
    } finally {
      setSaving(false);
    }
  }

  function placeCamera(id: string, point: Point) {
    const p = clampUnit(point);
    setDraft((prev) => ({ ...prev, [id]: { x: p.x, y: p.y, rotation: prev[id]?.rotation ?? null } }));
    setSelectedId(id);
    setPlacingId(null);
  }

  function rotateCamera(id: string, rotation: number | null) {
    setDraft((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, rotation: rotation === null ? null : normalizeRotation(rotation) } };
    });
  }

  function removeCamera(id: string) {
    setDraft((prev) => ({ ...prev, [id]: null }));
    setSelectedId(null);
  }

  // --- Realtime signallar -------------------------------------------------
  const [pulseUntil, setPulseUntil] = useState<Record<string, number>>({});
  const [eventsNonce, setEventsNonce] = useState(0);
  const cameraIds = useMemo(() => new Set(cameras.filter((c) => c.assigned).map((c) => c.id)), [cameras]);
  const reloadTimer = useRef<number | null>(null);

  useLiveEvents(
    (event) => {
      if (event.isTrial || !cameraIds.has(event.cameraId)) return;
      // Holati o'zgargan eski hodisa (event_updated) marker'ni miltillatmaydi —
      // faqat ochiq hodisalar sonini yangilaydi.
      if (event.kind !== 'event_updated') {
        setPulseUntil((prev) => ({ ...prev, [event.cameraId]: Date.now() + PULSE_MS }));
      }
      if (event.cameraId === drawerId) setEventsNonce((n) => n + 1);
      // Bir nechta signal ketma-ket kelsa, bitta so'rov yetadi.
      if (reloadTimer.current === null) {
        reloadTimer.current = window.setTimeout(() => {
          reloadTimer.current = null;
          reloadCameras();
        }, 1500);
      }
    },
    Boolean(plan),
  );

  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  // Muddati o'tgan "urish"larni tozalash.
  useEffect(() => {
    const times = Object.values(pulseUntil);
    if (times.length === 0) return;
    const wait = Math.max(0, Math.min(...times) - Date.now()) + 50;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setPulseUntil((prev) => Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now)));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [pulseUntil]);

  const pulsingIds = useMemo(() => new Set(Object.keys(pulseUntil)), [pulseUntil]);

  // --- Markerlar ----------------------------------------------------------
  const positionOf = useCallback(
    (camera: FloorPlanCamera): PlanPosition | null =>
      editing ? (draft[camera.id] ?? null) : serverPosition(camera),
    [editing, draft],
  );

  const markers: CanvasMarker[] = useMemo(
    () =>
      cameras.flatMap((camera) => {
        const position = positionOf(camera);
        if (!position) return [];
        return [
          {
            id: camera.id,
            name: camera.name,
            zone: camera.zone,
            tone: markerTone(camera),
            openEvents: camera.openEvents,
            pulsing: pulsingIds.has(camera.id),
            ptzEnabled: camera.ptzEnabled,
            position,
          },
        ];
      }),
    [cameras, positionOf, pulsingIds],
  );
  const placedIds = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);
  const unplaced = useMemo(
    () =>
      cameras
        .filter((c) => !placedIds.has(c.id))
        .sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.name.localeCompare(b.name, 'uz')),
    [cameras, placedIds],
  );
  const assignedCameras = useMemo(() => cameras.filter((c) => c.assigned), [cameras]);
  const selectedCamera = cameras.find((c) => c.id === selectedId) ?? null;
  const drawerCamera = cameras.find((c) => c.id === drawerId) ?? null;

  function activateMarker(id: string) {
    if (editing) setSelectedId((prev) => (prev === id ? null : id));
    else setDrawerId(id);
  }

  async function handleDelete() {
    if (!plan) return;
    await deleteFloorPlan(token, plan.id);
    setConfirmDelete(false);
    resetEditing();
    toast.success("Qavat rejasi o'chirildi");
    reloadPlans();
  }

  // --- Ko'rinish ----------------------------------------------------------
  const header = (
    <PageHeader
      title="Qavat rejalari"
      subtitle="Bino qavatlari chizmasida kameralar joylashuvi va jonli holati"
      action={
        canEdit && building ? (
          <div className="flex flex-wrap gap-2">
            {plan && !editing && (
              <button type="button" onClick={startEditing} className="btn-glass flex items-center gap-1.5" disabled={camerasLoading && cameras.length === 0}>
                <Pencil size={14} /> Kameralarni joylashtirish
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[12.5px] font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700"
              >
                <ImageUp size={14} /> {plan ? 'Rejani tahrirlash' : 'Reja yuklash'}
              </button>
            )}
            {plan && !editing && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="glass-btn-danger flex items-center gap-1.5 !py-2 text-[12.5px]">
                <Trash2 size={14} /> O'chirish
              </button>
            )}
          </div>
        ) : null
      }
    />
  );

  const selectors = (
    <div className="glass flex flex-wrap items-center gap-3 px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Building2 size={14} />
        <select
          value={buildingId}
          onChange={(e) => selectLocation(e.target.value, null)}
          className="max-w-[16rem] rounded-lg border border-white/80 bg-white/70 px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300"
          aria-label="Bino"
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {plans.some((p) => p.buildingId === b.id) ? '' : ' (reja yo\'q)'}
            </option>
          ))}
        </select>
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Layers size={14} className="shrink-0 text-slate-400" />
        <div role="tablist" aria-label="Qavat" className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-white/50 p-1">
          {floorOptions.map((n) => {
            const active = n === floor;
            const has = buildingPlans.some((p) => p.floor === n);
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectLocation(buildingId, n)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? 'bg-indigo-600 text-white shadow-btn' : has ? 'text-slate-700 hover:bg-white/80' : 'text-slate-400 hover:bg-white/80'
                }`}
                title={has ? undefined : 'Bu qavat uchun reja yuklanmagan'}
              >
                {n}-qavat
              </button>
            );
          })}
          {floorOptions.length === 0 && <span className="px-2 py-1.5 text-xs text-slate-400">Qavatlar soni kiritilmagan</span>}
        </div>
      </div>
      {plan && (
        <span className="text-xs text-slate-500">
          {plan.placedCount}/{plan.cameraCount} kamera rejada
          {camerasLoading && <Loader2 size={12} className="ml-1.5 inline animate-spin" />}
        </span>
      )}
    </div>
  );

  let body: ReactNode;
  if (plansError) {
    body = <ErrorState message={plansError} onRetry={reloadPlans} />;
  } else if ((plansLoading && plans.length === 0) || (buildingsLoading && buildings.length === 0)) {
    body = <SkeletonBlock className="h-[480px] rounded-xl" />;
  } else if (buildings.length === 0) {
    body = (
      <EmptyState
        icon={<Building2 size={18} />}
        title="Binolar yo'q"
        description="Avval tashkiliy tuzilma sahifasida bino qo'shing."
      />
    );
  } else if (!plan) {
    body = (
      <EmptyState
        icon={<MapIcon size={18} />}
        title={`${building?.name ?? 'Bino'}, ${floor}-qavat uchun reja yuklanmagan`}
        description={
          canEdit
            ? "Qavat chizmasini (PNG, JPEG yoki WebP) yuklang, so'ng kameralarni uning ustiga joylashtiring."
            : "Rejani kamera joylashuvini tahrirlash huquqi bor xodim yuklaydi."
        }
        action={
          canEdit ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn hover:bg-indigo-700"
            >
              <ImageUp size={14} /> Reja yuklash
            </button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-2">
          {camerasError && <ErrorState message={camerasError} onRetry={reloadCameras} />}
          <FloorPlanCanvas
            ref={canvasRef}
            planKey={plan.id}
            imageUrl={plan.imageUrl}
            imageSize={{ width: plan.width, height: plan.height }}
            markers={markers}
            editing={editing}
            selectedId={editing ? selectedId : drawerId}
            placing={editing && placingId !== null}
            onMarkerActivate={activateMarker}
            onMarkerMove={(id, point) => {
              setDraft((prev) => {
                const current = prev[id];
                return current ? { ...prev, [id]: { ...current, x: point.x, y: point.y } } : prev;
              });
              setSelectedId(id);
            }}
            onMarkerRotate={rotateCamera}
            onPlaceAt={(point) => placingId && placeCamera(placingId, point)}
            className="h-[calc(100vh-17rem)] min-h-[420px]"
          />
        </div>
        <aside className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-17rem)] lg:min-h-[420px]">
          {editing ? (
            <FloorPlanEditPanel
              unplaced={unplaced}
              selected={selectedCamera}
              selectedPosition={selectedId ? (draft[selectedId] ?? null) : null}
              placingId={placingId}
              dirty={dirty}
              changeCount={changes.length}
              saving={saving}
              onArm={setPlacingId}
              onDropAt={(id, clientX, clientY) => {
                const point = canvasRef.current?.clientToPlan(clientX, clientY);
                if (!point) return false;
                placeCamera(id, point);
                return true;
              }}
              onRotate={rotateCamera}
              onRemove={removeCamera}
              onSave={saveEditing}
              onCancel={cancelEditing}
            />
          ) : (
            <FloorPlanCameraList
              cameras={assignedCameras}
              placedIds={placedIds}
              pulsingIds={pulsingIds}
              onSelect={(camera) => setDrawerId(camera.id)}
            />
          )}
        </aside>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {selectors}
      {body}

      {building && uploadOpen && (
        <FloorPlanUploadModal
          open
          onClose={() => setUploadOpen(false)}
          building={building}
          floor={floor}
          plan={plan}
          onSaved={(saved) => {
            setUploadOpen(false);
            toast.success('Qavat rejasi saqlandi');
            setPlans((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
            selectLocation(saved.buildingId, saved.floor);
            reloadPlans();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Qavat rejasini o'chirish"
        message={
          plan
            ? `${plan.name} o'chiriladi va shu qavatdagi ${plan.placedCount} ta kameraning rejadagi joyi tozalanadi. Kameralarning o'zi o'chirilmaydi.`
            : ''
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />

      {!editing && drawerCamera && plan && (
        <CameraDetailDrawer
          camera={drawerCamera}
          buildingName={plan.buildingName}
          floor={plan.floor}
          canViewLive={canViewLive}
          canReviewEvents={canReviewEvents}
          eventsNonce={eventsNonce}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
}
