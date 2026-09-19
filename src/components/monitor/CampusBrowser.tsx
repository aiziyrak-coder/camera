import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, ChevronRight, Layers, Pencil, RefreshCw, Video, VideoOff } from 'lucide-react';
import {
  Button,
  Card,
  ErrorState,
  Page,
  SearchInput,
  StatTile,
  Toolbar,
  cn,
  focusRing,
  formatNumber,
  useToast,
  type TabItem,
} from '../../ui';
import MainCameraView from './MainCameraView';
import CampusOverview from './campus/CampusOverview';
import BuildingFloors from './campus/BuildingFloors';
import FloorCameras from './campus/FloorCameras';
import ReportPanel from './ReportPanel';
import EventsLogPanel from './EventsLogPanel';
import AlarmPanel from './AlarmPanel';
import CameraLocationEditModal from '../admin/CameraLocationEditModal';
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

/** "Bino bo'yicha" — kampus → bino → qavat → kamera.
 *
 * Nega uch daraja: ochilishda faqat sanoqlar keladi (GET /api/public/campus),
 * kameralar ro'yxati qavat tanlangandan keyin, kadrlar esa rasm
 * ko'rinishida (CameraThumbnail) — jonli oqim faqat operator tanlagan
 * BITTA kamerada ochiladi (MainCameraView, PTZ bilan).
 *
 * Holat URL'da: ?bino=&qavat=&kamera=&q= — havolani ulashish, sahifani
 * yangilash va brauzerning "orqaga" tugmasi ishlaydi. */

const PAGE_SIZE = 12;
// Video havolalari imzolangan va muddatli (camera-api/app/services/
// stream_links.py): ro'yxat vaqti-vaqti bilan yangilanib turadi. Havola
// 6 soat davomida o'zgarmaydi, shuning uchun pleyer qayta ulanmaydi.
const LIST_REFRESH_MS = 30 * 60 * 1000;

function floorText(floor: number | null | undefined): string {
  return floor === null || floor === undefined ? 'qavat belgilanmagan' : `${floor}-qavat`;
}

export default function CampusBrowser<T extends string>({ tabs, defaultTab }: { tabs: readonly TabItem<T>[]; defaultTab?: T }) {
  const [params, setParams] = useSearchParams();
  const route = useMemo(() => parseCampusRoute(params), [params]);
  const { building: buildingParam, floor: floorParam, camera: cameraParam, search: queryParam, level } = route;

  const [searchInput, setSearchInput] = useState(queryParam);
  const [activeCamera, setActiveCamera] = useState<CameraFeed | null>(null);
  // Kamera ma'lumotini shu yerdan to'g'rilash — kamera mas'uli uchun eng
  // qulay joy: jonli tasvirni ko'rib turib, qaysi bino/qavat ekanini
  // darhol yozadi. Huquqi yo'q tomoshabin buni ko'rmaydi.
  const [editingCamera, setEditingCamera] = useState<CameraFeed | null>(null);
  const { role } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const canEditLocation = can('editCameraLocation', role);
  const canReviewEvents = can('reviewEvents', role);
  const canViewReports = can('viewReports', role);

  const { campus, loading: campusLoading, error: campusError, reload: reloadCampus } = useCampus();

  const setQuery = useCallback((patch: CampusPatch) => setParams(withCampusRoute(params, patch)), [params, setParams]);

  // URL tashqaridan o'zgarsa (orqaga tugmasi) — maydon ham yangilansin.
  useEffect(() => {
    setSearchInput((current) => (current.trim() === queryParam ? current : queryParam));
  }, [queryParam]);

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
  const floor = useMemo(() => building?.floors.find((item) => floorKey(item.floor) === floorParam) ?? null, [building, floorParam]);

  const searching = level === 'search';
  const listShown = level === 'floor' || level === 'search';
  const listParams = useMemo(() => campusListParams(route), [route]);
  const list = useServerPage<CameraFeed>('/api/public/cameras', listParams, PAGE_SIZE, { enabled: listShown });

  const reloadList = list.reload;
  useEffect(() => {
    if (!listShown) return;
    const timer = window.setInterval(reloadList, LIST_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [listShown, reloadList]);

  // Havola bilan kelingan bo'lsa (?kamera=...) — ro'yxat yuklangach o'sha
  // kamerani tanlaymiz. Tanlov olib tashlansa, jonli oqim yopiladi.
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
      setQuery({ bino: target ? buildingKey(target) : 'yoq', qavat: floorKey(camera.floor), kamera: camera.id, q: null });
      setSearchInput('');
    },
    [campus.buildings, setQuery],
  );

  const crumbClass = (current: boolean) =>
    cn(
      'rounded-control px-2 py-1 text-[13px] font-medium transition-colors',
      focusRing,
      current ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
    );

  const crumbs = (
    <nav aria-label="Kampus navigatsiyasi" className="flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        aria-current={level === 'campus' ? 'page' : undefined}
        onClick={() => {
          setSearchInput('');
          setQuery({ bino: null, qavat: null, kamera: null, q: null });
        }}
        className={crumbClass(level === 'campus')}
      >
        Kampus
      </button>
      {building && !searching && (
        <>
          <ChevronRight size={14} aria-hidden="true" className="text-subtle" />
          <button
            type="button"
            aria-current={level === 'building' ? 'page' : undefined}
            onClick={() => setQuery({ qavat: null, kamera: null })}
            className={crumbClass(level === 'building')}
          >
            {building.name}
          </button>
        </>
      )}
      {building && floor && !searching && (
        <>
          <ChevronRight size={14} aria-hidden="true" className="text-subtle" />
          <span aria-current="page" className={crumbClass(true)}>
            {floor.label}
          </span>
        </>
      )}
      {searching && (
        <>
          <ChevronRight size={14} aria-hidden="true" className="text-subtle" />
          <span aria-current="page" className={crumbClass(true)}>
            Qidiruv: {queryParam}
          </span>
        </>
      )}
    </nav>
  );

  const scope =
    listShown
      ? `${formatNumber(list.total)} ta kamera`
      : level === 'building' && building
        ? `${building.floors.length} ta qavat · ${formatNumber(building.cameras)} ta kamera`
        : `${campus.buildings.length} ta bino · ${formatNumber(campus.cameras)} ta kamera`;

  const problems = campus.noVideo + campus.offline;
  const livePct = campus.cameras > 0 ? Math.round((Math.max(0, campus.live - campus.noVideo) * 100) / campus.cameras) : null;

  return (
    <Page
      title="Videodevor"
      subtitle={
        <>
          {scope} · <span className="text-success">{formatNumber(campus.live)} jonli</span>
          {campus.noVideo > 0 && <span className="text-warning"> · {formatNumber(campus.noVideo)} tasvirsiz</span>}
          {campus.eventsToday > 0 && <span className="text-danger"> · {formatNumber(campus.eventsToday)} signal (bugun)</span>}
        </>
      }
      tabs={tabs}
      defaultTab={defaultTab}
      actions={
        <Button icon={RefreshCw} loading={campusLoading && campus.buildings.length > 0} onClick={reloadCampus}>
          Yangilash
        </Button>
      }
      toolbar={
        <Toolbar>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Kamera yoki zona bo'yicha qidiruv…"
            ariaLabel="Kameralarni qidirish"
            className="sm:max-w-sm"
          />
          {crumbs}
        </Toolbar>
      }
    >
      {campusError && <ErrorState message={campusError} onRetry={reloadCampus} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {level === 'campus' && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Kameralar" value={formatNumber(campus.cameras)} hint={`${campus.buildings.length} ta bino`} icon={Camera} loading={campusLoading && campus.buildings.length === 0} />
              <StatTile
                label="Jonli"
                value={formatNumber(campus.live)}
                tone="success"
                icon={Video}
                progress={livePct}
                hint={livePct === null ? undefined : `${livePct}% sog'lom`}
                loading={campusLoading && campus.buildings.length === 0}
              />
              <StatTile
                label="Muammoli"
                value={formatNumber(problems)}
                tone={problems > 0 ? 'warning' : 'neutral'}
                icon={VideoOff}
                hint={`${formatNumber(campus.noVideo)} tasvirsiz · ${formatNumber(campus.offline)} oflayn`}
                loading={campusLoading && campus.buildings.length === 0}
              />
              <StatTile
                label="Signallar (bugun)"
                value={formatNumber(campus.eventsToday)}
                tone={campus.eventsToday > 0 ? 'danger' : 'neutral'}
                icon={AlertTriangle}
                to={canReviewEvents ? '/hodisalar' : undefined}
                loading={campusLoading && campus.buildings.length === 0}
              />
            </div>
          )}

          {listShown && list.error && <ErrorState message={list.error} onRetry={list.reload} />}

          {/* Tanlangan kamera — sahifadagi YAGONA jonli oqim. */}
          {activeCamera && listShown && (
            <Card padding="sm" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
                    <Video size={16} aria-hidden="true" className="shrink-0 text-primary" />
                    <span className="truncate">{activeCamera.name}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {activeCamera.building || 'Bino belgilanmagan'} · {floorText(activeCamera.floor)}
                    {activeCamera.zone ? ` · ${activeCamera.zone}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {canEditLocation && (
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditingCamera(activeCamera)}>
                      Sozlash
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={Layers}
                    onClick={() => {
                      setActiveCamera(null);
                      setQuery({ kamera: null });
                    }}
                  >
                    Gridga qaytish
                  </Button>
                </div>
              </div>
              <MainCameraView camera={activeCamera} className="aspect-video max-h-[68vh] w-full" />
            </Card>
          )}

          {level === 'campus' && (
            <CampusOverview campus={campus} loading={campusLoading} onOpenBuilding={openBuilding} onOpenFloor={openFloor} />
          )}

          {level === 'building' && building && <BuildingFloors building={building} onOpenFloor={(target) => openFloor(building, target)} />}

          {level === 'building' && !building && !campusLoading && !campusError && (
            <ErrorState
              variant="block"
              title="Bino topilmadi"
              message="Havoladagi bino o'chirilgan bo'lishi mumkin."
              onRetry={() => setQuery({ bino: null, qavat: null, kamera: null })}
            />
          )}

          {listShown && (
            <FloorCameras
              cameras={list.items}
              loading={list.loading}
              activeId={activeCamera?.id ?? null}
              onSelect={searching ? jumpToCamera : openCamera}
              page={list.page}
              totalPages={list.totalPages}
              total={list.total}
              onPageChange={list.setPage}
              onEdit={canEditLocation ? setEditingCamera : undefined}
              compact={Boolean(activeCamera)}
              emptyHint={searching ? "Bu so'rov bo'yicha kamera topilmadi. Boshqa nom yoki zona bilan urinib ko'ring." : undefined}
            />
          )}
        </div>

        {/* Huquqsiz foydalanuvchida (kamera mas'uli) server bu panellarni 403
            bilan rad etadi — bo'sh xato oynasi o'rniga umuman ko'rsatmaymiz. */}
        {(canViewReports || canReviewEvents) && (
          <aside className="flex min-w-0 flex-col gap-4" aria-label="Signallar va hisobot">
            {canReviewEvents && <AlarmPanel cameras={list.items} onSelectCamera={jumpToCamera} />}
            {canReviewEvents && <EventsLogPanel />}
            {canViewReports && <ReportPanel />}
          </aside>
        )}
      </div>

      <CameraLocationEditModal
        camera={editingCamera}
        onClose={() => setEditingCamera(null)}
        onSave={(saved) => {
          // Ekrandagi sarlavha darhol yangilansin, kesim va ro'yxat esa
          // serverdan qayta o'qilsin: kamera boshqa qavatga ko'chgan bo'lishi mumkin.
          setActiveCamera((current) =>
            current && current.id === saved.id
              ? {
                  ...current,
                  name: saved.name,
                  building: saved.building,
                  zone: saved.zone,
                  floor: saved.floor ?? null,
                  department: saved.department ?? current.department,
                }
              : current,
          );
          reloadCampus();
          list.reload();
          toast.success(`${saved.name} ma'lumoti saqlandi`);
        }}
      />
    </Page>
  );
}
