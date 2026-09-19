import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, ImageUp, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, ErrorState, Page, Skeleton, Tabs, Toolbar, useToast } from '../../ui';
import FloorPlanCanvas, { type CanvasMarker, type FloorPlanCanvasHandle } from '../../components/floorplan/FloorPlanCanvas';
import FloorPlanCameraList from '../../components/floorplan/FloorPlanCameraList';
import FloorPlanEditPanel from '../../components/floorplan/FloorPlanEditPanel';
import FloorPlanUploadModal from '../../components/floorplan/FloorPlanUploadModal';
import CameraDetailDrawer from '../../components/floorplan/CameraDetailDrawer';
import FloorSchematic from '../../components/floorplan/FloorSchematic';
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
  const floorParam = params.get('chizma');

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
  const floorOptions = useMemo(() => buildingPlans.map((p) => p.floor), [buildingPlans]);
  const parsedFloor = floorParam !== null && /^-?\d+$/.test(floorParam) ? Number(floorParam) : null;
  // chizma=N bo'lsa — N-qavat chizmasi, aks holda sxema (chizmasiz) ko'rinishi.
  const plan = parsedFloor === null ? null : (buildingPlans.find((p) => p.floor === parsedFloor) ?? null);
  const [uploadFloor, setUploadFloor] = useState<number | null>(null);
  const floor = uploadFloor ?? parsedFloor ?? 1;
  const [schematicCamera, setSchematicCamera] = useState<FloorPlanCamera | null>(null);

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
        next.delete('qavat');
        if (nextFloor === null) next.delete('chizma');
        else next.set('chizma', String(nextFloor));
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
  const actions =
    canEdit && building && plan && !editing ? (
      <>
        {plan && (
          <Button icon={Pencil} onClick={startEditing} disabled={camerasLoading && cameras.length === 0}>
            Kameralarni joylashtirish
          </Button>
        )}
        <Button icon={ImageUp} onClick={() => setUploadOpen(true)}>
          Chizmani almashtirish
        </Button>
        {plan && <Button variant="ghost" icon={Trash2} className="text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>O&apos;chirish</Button>}
      </>
    ) : null;

  const floorTabs = floorOptions.map((n) => ({ id: String(n), label: `${n}-qavat` }));
  const buildingTabs = buildings.map((b) => ({ id: b.id, label: b.name.replace(/\s*\(.*\)\s*$/, '') }));

  const selectors = buildings.length > 0 && (
    <Toolbar
      end={
        plan ? (
          <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-muted">
            {plan.placedCount}/{plan.cameraCount} kamera chizmada
            {camerasLoading && <Loader2 size={13} aria-hidden="true" className="animate-spin" />}
          </span>
        ) : undefined
      }
    >
      <Tabs variant="segmented" ariaLabel="Bino" tabs={buildingTabs} value={buildingId} onChange={(id) => selectLocation(id, null)} />
      {plan && (
        <>
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => selectLocation(buildingId, null)}>
            Barcha qavatlar
          </Button>
          {floorTabs.length > 1 && (
            <Tabs variant="segmented" ariaLabel="Qavat" tabs={floorTabs} value={String(plan.floor)} onChange={(id) => selectLocation(buildingId, Number(id))} />
          )}
        </>
      )}
    </Toolbar>
  );

  let body: ReactNode;
  if (plansError) {
    body = <ErrorState message={plansError} onRetry={reloadPlans} />;
  } else if ((plansLoading && plans.length === 0) || (buildingsLoading && buildings.length === 0)) {
    body = <Skeleton className="h-[480px] rounded-card" />;
  } else if (buildings.length === 0) {
    body = (
      <EmptyState
        icon={Building2}
        title="Binolar yo'q"
        description="Avval tashkiliy tuzilma sahifasida bino qo'shing."
      />
    );
  } else if (!plan) {
    body = (
      <FloorSchematic
        buildingId={buildingId}
        plans={buildingPlans}
        canEdit={canEdit}
        onOpenCamera={setSchematicCamera}
        onOpenPlan={(n) => selectLocation(buildingId, n)}
        onUpload={(n) => {
          setUploadFloor(n);
          setUploadOpen(true);
        }}
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
            className="h-[calc(100vh-19rem)] min-h-[420px]"
          />
        </div>
        <aside className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-19rem)] lg:min-h-[420px]">
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
    <Page
      title="Qavat xaritasi"
      subtitle="Har qavatdagi kameralar va ularning holati. Chizma yuklash ixtiyoriy"
      actions={actions}
      toolbar={selectors || undefined}
    >
      {body}

      {building && uploadOpen && (
        <FloorPlanUploadModal
          open
          onClose={() => {
            setUploadOpen(false);
            setUploadFloor(null);
          }}
          building={building}
          floor={floor}
          plan={plan}
          onSaved={(saved) => {
            setUploadOpen(false);
            setUploadFloor(null);
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
        confirmLabel="O'chirish"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />

      {!plan && schematicCamera && building && (
        <CameraDetailDrawer
          camera={schematicCamera}
          buildingName={building.name}
          floor={schematicCamera.floor}
          canViewLive={canViewLive}
          canReviewEvents={canReviewEvents}
          eventsNonce={eventsNonce}
          onClose={() => setSchematicCamera(null)}
        />
      )}

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
    </Page>
  );
}
