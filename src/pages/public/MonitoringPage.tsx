import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Layers, Pencil, RefreshCw, Search, Video, X } from 'lucide-react';
import MainCameraView from '../../components/monitor/MainCameraView';
import CampusOverview from '../../components/monitor/campus/CampusOverview';
import BuildingFloors from '../../components/monitor/campus/BuildingFloors';
import FloorCameras from '../../components/monitor/campus/FloorCameras';
import ReportPanel from '../../components/monitor/ReportPanel';
import EventsLogPanel from '../../components/monitor/EventsLogPanel';
import AlarmPanel from '../../components/monitor/AlarmPanel';
import ErrorState from '../../components/ui/ErrorState';
import CameraLocationEditModal from '../../components/admin/CameraLocationEditModal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { useCampus } from '../../lib/useCampus';
import { useServerPage } from '../../lib/useServerPage';
import {
  buildingKey,
  campusListParams,
  floorKey,
  parseCampusRoute,
  withCampusRoute,
  type CampusPatch,
} from '../../lib/campusNavigation';
import type { CameraFeed, CampusBuilding, CampusFloor } from '../../types';

/** Video Monitoring Markazi — kampus, bino va qavat darajalari.
 *
 * Nega uch daraja: ilgari bu sahifa ochilishi bilan bir asosiy va sakkiz
 * miniatyura oqimini ochardi, ya'ni har tomoshabinga to'qqizta HLS va
 * MediaMTX'da to'qqizta ffmpeg transkodi. Endi ochilishda faqat sanoqlar
 * keladi (GET /api/public/campus), kameralar ro'yxati qavat tanlangandan
 * keyin, kadrlar esa rasm ko'rinishida (CameraThumbnail) — jonli oqim
 * faqat operator tanlagan BITTA kamerada ochiladi.
 *
 * Holat URL'da: ?bino=&qavat=&kamera=&q= — havolani ulashish, sahifani
 * yangilash va brauzerning "orqaga" tugmasi ishlaydi. */

const PAGE_SIZE = 12;

export default function MonitoringPage() {
  const [params, setParams] = useSearchParams();
  const route = useMemo(() => parseCampusRoute(params), [params]);
  const { building: buildingParam, floor: floorParam, camera: cameraParam, search: queryParam, level } = route;

  const [searchInput, setSearchInput] = useState(queryParam);
  const [activeCamera, setActiveCamera] = useState<CameraFeed | null>(null);
  // Kamera ma'lumotini shu yerdan to'g'rilash — kamera mas'uli uchun
  // eng qulay joy: jonli tasvirni ko'rib turib, qaysi bino/qavat
  // ekanini darhol yozadi. Huquqi yo'q tomoshabin buni ko'rmaydi.
  const [editingCamera, setEditingCamera] = useState<CameraFeed | null>(null);
  const { role } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const canEditLocation = can('editCameraLocation', role);

  const { campus, loading: campusLoading, error: campusError, reload: reloadCampus } = useCampus();

  const setQuery = useCallback(
    (patch: CampusPatch) => setParams(withCampusRoute(params, patch)),
    [params, setParams],
  );

  // Qidiruv har harfda emas, foydalanuvchi to'xtaganda URL'ga yoziladi
  // (replace: tarix qidiruv qadamlariga to'lib ketmasin).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === queryParam) return;
      setParams(withCampusRoute(params, { q: next || null }), { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, queryParam, params, setParams]);

  const building = useMemo(
    () => campus.buildings.find((item) => buildingKey(item) === buildingParam) ?? null,
    [campus.buildings, buildingParam],
  );
  const floor = useMemo(
    () => building?.floors.find((item) => floorKey(item.floor) === floorParam) ?? null,
    [building, floorParam],
  );

  const searching = level === 'search';
  const listParams = useMemo(() => campusListParams(route), [route]);
  const list = useServerPage<CameraFeed>('/api/public/cameras', listParams, PAGE_SIZE, {
    enabled: level === 'floor' || level === 'search',
  });

  // Havola bilan kelingan bo'lsa (?kamera=...) — ro'yxat yuklangach
  // o'sha kamerani tanlaymiz. Ro'yxat almashsa va tanlangan kamera unda
  // bo'lmasa, jonli oqim yopiladi: boshqa qavatni ko'rib turib, eski
  // kameraning videosini ko'rsatib qolish chalg'ituvchi.
  useEffect(() => {
    if (!cameraParam) {
      setActiveCamera(null);
      return;
    }
    const found = list.items.find((item) => item.id === cameraParam);
    if (found) setActiveCamera(found);
  }, [cameraParam, list.items]);

  const openBuilding = useCallback(
    (target: CampusBuilding) => setQuery({ bino: buildingKey(target), qavat: null, kamera: null, q: null }),
    [setQuery],
  );
  const openFloor = useCallback(
    (target: CampusBuilding, targetFloor: CampusFloor) =>
      setQuery({ bino: buildingKey(target), qavat: floorKey(targetFloor.floor), kamera: null, q: null }),
    [setQuery],
  );
  const openCamera = useCallback(
    (camera: CameraFeed) => {
      setActiveCamera(camera);
      setQuery({ kamera: camera.id });
    },
    [setQuery],
  );

  /** Signal panelidan yoki qidiruvdan kelgan kamera — uni o'z qavatiga
   * olib borib ochamiz, shunda operator kontekstni ham ko'radi. */
  const jumpToCamera = useCallback(
    (camera: CameraFeed) => {
      const target = campus.buildings.find((item) => item.name === camera.building);
      setActiveCamera(camera);
      setQuery({
        bino: target ? buildingKey(target) : 'yoq',
        qavat: floorKey(camera.floor),
        kamera: camera.id,
        q: null,
      });
      setSearchInput('');
    },
    [campus.buildings, setQuery],
  );

  const crumbs = (
    <nav aria-label="Kampus navigatsiyasi" className="flex flex-wrap items-center gap-1 text-xs font-semibold">
      <button
        type="button"
        onClick={() => {
          setSearchInput('');
          setQuery({ bino: null, qavat: null, kamera: null, q: null });
        }}
        className={`rounded-lg px-2 py-1 transition ${
          level === 'campus' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/70 hover:text-indigo-700'
        }`}
      >
        Kampus
      </button>
      {building && !searching && (
        <>
          <ChevronRight size={13} className="text-slate-300" />
          <button
            type="button"
            onClick={() => setQuery({ qavat: null, kamera: null })}
            className={`rounded-lg px-2 py-1 transition ${
              level === 'building' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/70 hover:text-indigo-700'
            }`}
          >
            {building.name}
          </button>
        </>
      )}
      {building && floor && !searching && (
        <>
          <ChevronRight size={13} className="text-slate-300" />
          <span className="rounded-lg bg-indigo-600 px-2 py-1 text-white">{floor.label}</span>
        </>
      )}
      {searching && (
        <>
          <ChevronRight size={13} className="text-slate-300" />
          <span className="rounded-lg bg-slate-800 px-2 py-1 text-white">Qidiruv: {queryParam}</span>
        </>
      )}
    </nav>
  );

  const summary =
    level === 'floor' || level === 'search'
      ? `${list.total} ta kamera`
      : level === 'building' && building
        ? `${building.floors.length} ta qavat · ${building.cameras} ta kamera`
        : `${campus.buildings.length} ta bino · ${campus.cameras} ta kamera`;

  return (
    <div className="flex h-full w-full flex-col">
      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="glass flex min-h-0 flex-col gap-3 p-4 lg:col-span-3">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">Video Monitoring Markazi</h2>
              <p className="text-xs text-slate-500">
                {summary} · <span className="text-emerald-600">{campus.live} jonli</span>
                {campus.noVideo > 0 && <span className="text-amber-600"> · {campus.noVideo} tasvirsiz</span>}
                {campus.eventsToday > 0 && <span className="text-rose-600"> · {campus.eventsToday} signal (bugun)</span>}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Kamera yoki zona bo'yicha qidiruv..."
                  aria-label="Kameralarni qidirish"
                  className="w-full rounded-xl border border-white/80 bg-white/60 py-2 pl-9 pr-8 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-300"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    aria-label="Qidiruvni tozalash"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={reloadCampus}
                className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:text-indigo-700"
              >
                <RefreshCw size={14} className={campusLoading ? 'animate-spin' : ''} />
                Yangilash
              </button>
            </div>
          </div>

          {crumbs}

          {campusError && <ErrorState message={campusError} onRetry={reloadCampus} />}
          {list.error && (level === 'floor' || level === 'search') && (
            <ErrorState message={list.error} onRetry={list.reload} />
          )}

          {/* Tanlangan kamera — sahifadagi YAGONA jonli oqim. */}
          {activeCamera && (level === 'floor' || level === 'search') && (
            <div className="flex min-h-0 flex-[2] flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Video size={13} className="text-indigo-500" />
                  {activeCamera.name}
                  <span className="font-medium text-slate-400">
                    · {activeCamera.building || 'Bino belgilanmagan'} ·{' '}
                    {activeCamera.floor === null || activeCamera.floor === undefined
                      ? 'qavat belgilanmagan'
                      : `${activeCamera.floor}-qavat`}{' '}
                    · {activeCamera.zone}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {canEditLocation && (
                    <button
                      type="button"
                      onClick={() => setEditingCamera(activeCamera)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-white/70"
                    >
                      <Pencil size={12} />
                      Sozlash
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCamera(null);
                      setQuery({ kamera: null });
                    }}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-white/70 hover:text-indigo-700"
                  >
                    <Layers size={12} />
                    Gridga qaytish
                  </button>
                </span>
              </div>
              <MainCameraView camera={activeCamera} className="min-h-0 flex-1" />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {level === 'campus' && (
              <CampusOverview
                campus={campus}
                loading={campusLoading}
                onOpenBuilding={openBuilding}
                onOpenFloor={openFloor}
              />
            )}

            {level === 'building' && building && (
              <BuildingFloors building={building} onOpenFloor={(target) => openFloor(building, target)} />
            )}

            {level === 'building' && !building && !campusLoading && (
              <ErrorState
                title="Bino topilmadi"
                message="Havoladagi bino o'chirilgan bo'lishi mumkin."
                onRetry={() => setQuery({ bino: null, qavat: null, kamera: null })}
              />
            )}

            {(level === 'floor' || level === 'search') && (
              <FloorCameras
                cameras={list.items}
                loading={list.loading}
                activeId={activeCamera?.id ?? null}
                onSelect={level === 'search' ? jumpToCamera : openCamera}
                page={list.page}
                totalPages={list.totalPages}
                total={list.total}
                onPageChange={list.setPage}
                onEdit={canEditLocation ? setEditingCamera : undefined}
                compact={Boolean(activeCamera)}
                emptyHint={
                  level === 'search'
                    ? "Bu so'rov bo'yicha kamera topilmadi. Boshqa nom yoki zona bilan urinib ko'ring."
                    : undefined
                }
              />
            )}
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto lg:col-span-1">
          <ReportPanel />
          <EventsLogPanel />
          <AlarmPanel cameras={list.items} onSelectCamera={jumpToCamera} />
        </div>
      </section>

      <CameraLocationEditModal
        camera={editingCamera}
        onClose={() => setEditingCamera(null)}
        onSave={(saved) => {
          // Ekrandagi kamera sarlavhasi darhol yangilansin, kesim va
          // ro'yxat esa serverdan qayta o'qilsin: kamera boshqa qavatga
          // ko'chgan bo'lishi mumkin.
          setActiveCamera((current) =>
            current && current.id === saved.id
              ? {
                  ...current,
                  name: saved.name,
                  building: saved.building,
                  zone: saved.zone,
                  floor: saved.floor ?? null,
                }
              : current,
          );
          reloadCampus();
          list.reload();
          toast.success(`${saved.name} ma'lumoti saqlandi`);
        }}
      />
    </div>
  );
}
