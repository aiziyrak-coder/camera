import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHref, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Hand,
  Keyboard,
  ListVideo,
  Maximize,
  Minimize,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from 'lucide-react';
import { Button, ErrorState, IconButton, Page, Toolbar, cn, useShell, useToast } from '../../ui';
import CameraSidebar from './CameraSidebar';
import LayoutPicker from './LayoutPicker';
import TourMenu, { DEFAULT_TOUR, sanitizeTour, type TourSettings } from './TourMenu';
import ViewsMenu from './ViewsMenu';
import WallPopover from './WallPopover';
import WallTile from './WallTile';
import { usePageVisible } from './usePageVisible';
import { useStoredViews } from './useStoredViews';
import { useWallCameras } from './useWallCameras';
import { downloadBlob } from '../../lib/download';
import { usePersistedState } from '../../lib/usePersistedState';
import {
  EMPTY_WALL_FILTERS,
  WALL_MAX_LIVE,
  addToFirstEmpty,
  filterCameras,
  isCameraOnline,
  isFeaturedLayout,
  layoutCapacity,
  layoutForKey,
  layoutGeometry,
  mergeViews,
  newViewId,
  nextTourView,
  pageCount,
  pageTiles,
  parseViewsImport,
  placeCamera,
  planPlayback,
  removeAt,
  resizeTiles,
  sanitizeWallState,
  serializeViews,
  stepPage,
  swapTiles,
  tourSequence,
  type WallCameraFilters,
  type WallLayout,
  type WallState,
  type WallTiles,
  type WallView,
} from '../../lib/videoWall';
import type { CameraFeed } from '../../types';

/** Videodevor — ko'p kamerali setka (operator xonasi ekrani).
 *
 * Ikki rejim:
 * - qobiq ichida (/videodevor) — `Page` sarlavhasi, o'ngda setka/ko'rinish/
 *   tur/oyna/to'liq ekran, ostida asboblar qatori va yon panel;
 * - `standalone` (/videodevor/ekran?view=<id>) — menyusiz, qorong'i fon,
 *   ikkinchi monitorda to'liq ekran uchun. Asboblar paneli sichqoncha
 *   qimirlaganda chiqadi va 3 soniyadan keyin yashirinadi.
 *
 * Yuk bo'yicha qoidalar (yuzlab kamera, HLS pleyer esa qimmat):
 * - faqat joriy setkadagi kataklar o'ynaydi; kattalashtirilgan katak
 *   bo'lsa — faqat u (qolganlari umuman render qilinmaydi);
 * - bir vaqtda ko'pi bilan WALL_MAX_LIVE ta jonli pleyer, qolganlari
 *   10 soniyada yangilanadigan kadr (rasm);
 * - varaq 15 soniyadan ko'p fonda qolsa, barcha pleyerlar yopiladi;
 * - brauzerga beriladigan oqim — MediaMTX'dagi substream (102, past
 *   ruxsat), asosiy oqim emas (camera-api config: rtsp_substream_path). */

type Source = 'manual' | 'list';

const CURRENT_KEY = 'videowall-current';
const STANDALONE_CURRENT_KEY = 'videowall-current-standalone';
const DEFAULT_STATE: WallState = { layout: '2x2', tiles: [null, null, null, null] };
const CHROME_HIDE_MS = 3000;
const STAGGER_MS = 150;
/** Ikkinchi monitor uchun sahifa (menyusiz). */
export const STANDALONE_PATH = '/videodevor/ekran';

const SHORTCUTS: Array<[string, string]> = [
  ['1 – 5', 'Setka: 1, 4, 9, 16, 25 katak'],
  ['6 / 7', 'Setka: 1+5 / 1+7'],
  ['F', "To'liq ekran"],
  ['← / →', "Oldingi / keyingi sahifa yoki ko'rinish"],
  ['T', "Aylanishni yoqish / to'xtatish"],
  ['Esc', 'Kattalashtirilgan katakdan chiqish'],
  ['Ikki marta bosish', 'Katakni kattalashtirish'],
  ['Strelkalar (PTZ)', 'Kattalashtirilgan PTZ kamerani burish'],
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function sameTiles(a: WallTiles, b: WallTiles): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export default function VideoWall({
  standalone = false,
  initialSearch = '',
  initialCameraId = null,
}: {
  standalone?: boolean;
  /** Yon panelning boshlang'ich qidiruvi (eski `?q=` havolasi). */
  initialSearch?: string;
  /** Ochilishda devorga qo'yiladigan kamera (eski `?kamera=` havolasi). */
  initialCameraId?: string | null;
}) {
  const toast = useToast();
  const { presentation } = useShell();
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const standaloneHref = useHref(STANDALONE_PATH);

  const { cameras, loading, error, reload } = useWallCameras();
  const byId = useMemo(() => new Map(cameras.map((camera) => [camera.id, camera])), [cameras]);

  const [views, setViews] = useStoredViews();
  const [storedState, setStoredState] = usePersistedState<WallState>(
    standalone ? STANDALONE_CURRENT_KEY : CURRENT_KEY,
    DEFAULT_STATE,
  );
  const wall = useMemo(() => sanitizeWallState(storedState), [storedState]);
  const capacity = layoutCapacity(wall.layout);
  const geometry = useMemo(() => layoutGeometry(wall.layout), [wall.layout]);

  const [activeViewId, setActiveViewId] = useState<string | null>(viewParam);
  const [source, setSource] = useState<Source>('manual');
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<WallCameraFilters>(() => ({ ...EMPTY_WALL_FILTERS, search: initialSearch }));
  const [maximized, setMaximized] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = usePersistedState<boolean>(
    standalone ? 'videowall-sidebar-standalone' : 'videowall-sidebar',
    !standalone,
  );
  const [storedTour, setStoredTour] = usePersistedState<TourSettings>('videowall-tour', DEFAULT_TOUR);
  const tour = useMemo(() => sanitizeTour(storedTour), [storedTour]);
  const [touring, setTouring] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pageVisible = usePageVisible();

  const filtered = useMemo(() => filterCameras(cameras, filters), [cameras, filters]);
  const filteredIds = useMemo(() => filtered.map((camera) => camera.id), [filtered]);
  const pages = pageCount(filteredIds.length, capacity);

  const tiles: WallTiles = useMemo(
    () => (source === 'list' ? pageTiles(filteredIds, capacity, page) : wall.tiles),
    [source, filteredIds, capacity, page, wall.tiles],
  );
  const onWall = useMemo(() => new Set(tiles.filter((id): id is string => id !== null)), [tiles]);
  const activeView = views.find((view) => view.id === activeViewId) ?? null;
  const dirty = Boolean(activeView) && (activeView!.layout !== wall.layout || !sameTiles(activeView!.tiles, tiles));

  const setWall = useCallback((layout: WallLayout, nextTiles: WallTiles) => setStoredState({ layout, tiles: nextTiles }), [setStoredState]);

  // Sahifa raqami filtr/setka o'zgarganda chegaradan chiqib ketmasin.
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pages - 1)));
  }, [pages]);

  // Katak indeksi yangi setkada yo'q bo'lsa — tanlov/kattalashtirish bekor.
  useEffect(() => {
    setMaximized((current) => (current !== null && (current >= capacity || tiles[current] === null) ? null : current));
    setSelected((current) => (current !== null && current >= capacity ? null : current));
  }, [capacity, tiles]);

  // ---------------------------------------------------------------- views
  const applyView = useCallback(
    (view: WallView) => {
      setSource('manual');
      setMaximized(null);
      setSelected(null);
      setWall(view.layout, view.tiles);
      setActiveViewId(view.id);
      if (standalone) {
        const next = new URLSearchParams(params);
        next.set('view', view.id);
        setParams(next, { replace: true });
      }
    },
    [params, setParams, setWall, standalone],
  );

  // ?view=<id> bilan ochilgan oyna (ikkinchi monitor): ko'rinish topilganda
  // qo'llanadi va asosiy oynada yangilansa (storage hodisasi) — qayta.
  const appliedStamp = useRef<string | null>(null);
  useEffect(() => {
    if (!viewParam) return;
    const view = views.find((item) => item.id === viewParam);
    if (!view) return;
    const stamp = `${view.id}:${view.updatedAt}`;
    if (appliedStamp.current === stamp) return;
    appliedStamp.current = stamp;
    applyView(view);
  }, [viewParam, views, applyView]);

  function saveNewView(name: string) {
    const view: WallView = { id: newViewId(), name, layout: wall.layout, tiles, updatedAt: new Date().toISOString() };
    setViews((prev) => [...prev, view]);
    setSource('manual');
    setWall(wall.layout, tiles);
    setActiveViewId(view.id);
    toast.success(`«${name}» ko'rinishi saqlandi`);
  }

  function updateView(id: string) {
    setViews((prev) =>
      prev.map((view) =>
        view.id === id ? { ...view, layout: wall.layout, tiles, updatedAt: new Date().toISOString() } : view,
      ),
    );
    toast.success("Ko'rinish yangilandi");
  }

  function renameView(id: string, name: string) {
    setViews((prev) => prev.map((view) => (view.id === id ? { ...view, name, updatedAt: new Date().toISOString() } : view)));
  }

  function deleteView(id: string) {
    setViews((prev) => prev.filter((view) => view.id !== id));
    if (activeViewId === id) setActiveViewId(null);
    setStoredTour((prev) => ({ ...sanitizeTour(prev), viewIds: sanitizeTour(prev).viewIds.filter((item) => item !== id) }));
  }

  function exportViews() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([serializeViews(views)], { type: 'application/json' }), `videodevor-korinishlar-${stamp}.json`);
  }

  async function importViews(file: File) {
    if (file.size > 1024 * 1024) {
      toast.error('Fayl juda katta (1 MB dan oshmasin)');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("Faylni o'qib bo'lmadi");
      return;
    }
    const result = parseViewsImport(text);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setViews((prev) => mergeViews(prev, result.views));
    toast.success(
      `${result.views.length} ta ko'rinish import qilindi${result.skipped ? ` (${result.skipped} ta yaroqsiz o'tkazib yuborildi)` : ''}`,
    );
  }

  function openWindow(id: string | null) {
    if (!id) {
      toast.info("Yangi oynada ochish uchun avval joriy devorni ko'rinish sifatida saqlang");
      return;
    }
    const url = `${standaloneHref}?view=${encodeURIComponent(id)}`;
    const opened = window.open(url, `videodevor-${id}`, 'popup=yes,width=1600,height=900');
    if (!opened) toast.error('Brauzer yangi oynani blokladi — bu sayt uchun qalqib chiquvchi oynalarga ruxsat bering');
  }

  // ---------------------------------------------------------------- tiles
  /** "Ro'yxat bo'yicha" rejimda qo'lda o'zgartirish — joriy sahifani
   * qo'lda rejimga ko'chirib, o'shandan davom etadi. */
  const editTiles = useCallback(
    (change: (base: WallTiles) => WallTiles | null) => {
      const next = change(tiles);
      if (next === null) return false;
      setSource('manual');
      setTouring(false);
      setWall(wall.layout, next);
      return true;
    },
    [tiles, setWall, wall.layout],
  );

  const setLayout = useCallback(
    (layout: WallLayout) => {
      setMaximized(null);
      setWall(layout, resizeTiles(source === 'list' ? wall.tiles : tiles, layoutCapacity(layout)));
    },
    [setWall, source, tiles, wall.tiles],
  );

  function addCamera(camera: CameraFeed) {
    if (selected !== null && selected < capacity) {
      editTiles((base) => placeCamera(base, selected, camera.id));
      setSelected(null);
      return;
    }
    const placed = addToFirstEmpty(tiles, camera.id);
    if (!placed) {
      toast.info("Bo'sh katak yo'q — katakni tanlab bosing yoki kattaroq setka tanlang");
      return;
    }
    editTiles(() => placed.tiles);
  }

  // Eski "Bino va qavat bo'yicha" havolasi (?kamera=<id>) — o'sha kamera
  // ro'yxat yuklangach bo'sh katakka qo'yiladi (bir marta).
  const placedInitial = useRef(false);
  useEffect(() => {
    if (placedInitial.current || !initialCameraId || !byId.has(initialCameraId)) return;
    placedInitial.current = true;
    editTiles((base) => addToFirstEmpty(base, initialCameraId)?.tiles ?? null);
  }, [initialCameraId, byId, editTiles]);

  // ---------------------------------------------------------------- tour
  const tourViewIds = useMemo(() => tourSequence(views, tour.viewIds), [views, tour.viewIds]);
  const tourPaused = maximized !== null || !pageVisible;

  const toggleTour = useCallback(() => {
    if (touring) {
      setTouring(false);
      return;
    }
    if (tour.kind === 'views') {
      if (tourViewIds.length < 2) {
        toast.info("Aylanish uchun kamida 2 ta ko'rinish saqlang");
        return;
      }
    } else {
      if (pages < 2) {
        toast.info("Filtrga mos kameralar bitta sahifaga sig'adi — aylanish shart emas");
        return;
      }
      setSource('list');
    }
    setTouring(true);
  }, [touring, tour.kind, tourViewIds.length, pages, toast]);

  useEffect(() => {
    if (!touring || tourPaused) return;
    const timer = window.setInterval(() => {
      if (tour.kind === 'views') {
        const nextId = nextTourView(tourViewIds, activeViewId);
        const view = views.find((item) => item.id === nextId);
        if (view) applyView(view);
      } else {
        setPage((current) => stepPage(current, 1, filteredIds.length, capacity));
      }
    }, tour.intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [touring, tourPaused, tour.kind, tour.intervalSec, tourViewIds, activeViewId, views, applyView, filteredIds.length, capacity]);

  // ---------------------------------------------------------------- fullscreen
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    const node = rootRef.current;
    if (!node?.requestFullscreen) {
      toast.error("Brauzer to'liq ekran rejimini qo'llab-quvvatlamaydi");
      return;
    }
    node.requestFullscreen().catch(() => toast.error("To'liq ekranga o'tib bo'lmadi"));
  }, [toast]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current && rootRef.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Alohida oyna / to'liq ekran: asboblar paneli sichqoncha qimirlaganda chiqadi.
  const autoHide = standalone || isFullscreen;
  useEffect(() => {
    if (!autoHide) {
      setChromeVisible(true);
      return;
    }
    let timer = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
    const onMove = () => {
      setChromeVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onMove);
    };
  }, [autoHide]);

  // ---------------------------------------------------------------- navigation
  const step = useCallback(
    (delta: number) => {
      if (source === 'list') {
        setPage((current) => stepPage(current, delta, filteredIds.length, capacity));
        return;
      }
      if (views.length === 0) return;
      const index = views.findIndex((view) => view.id === activeViewId);
      const next = views[(((index === -1 ? (delta > 0 ? -1 : 0) : index) + delta) % views.length + views.length) % views.length];
      applyView(next);
    },
    [source, filteredIds.length, capacity, views, activeViewId, applyView],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      // Ochiq dialog (masalan Drawer) ustida devor tugmalari ishlamasin.
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) return;
      const layout = layoutForKey(event.key);
      if (layout) {
        event.preventDefault();
        setLayout(layout);
        return;
      }
      switch (event.key) {
        case 'f':
        case 'F':
          event.preventDefault();
          toggleFullscreen();
          break;
        case 't':
        case 'T':
          event.preventDefault();
          toggleTour();
          break;
        case 'Escape':
          if (maximized !== null) {
            event.preventDefault();
            setMaximized(null);
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          // Kattalashtirilgan PTZ katakda strelkalarni PtzControls oladi.
          if (maximized !== null) return;
          // Tablar va boshqa klaviatura bilan boshqariladigan elementlar o'zi ishlatadi.
          if (event.target instanceof HTMLElement && event.target.closest('[role="tablist"],[role="radiogroup"]')) return;
          event.preventDefault();
          step(event.key === 'ArrowRight' ? 1 : -1);
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLayout, toggleFullscreen, toggleTour, maximized, step]);

  // ---------------------------------------------------------------- playback
  const plan = useMemo(
    () =>
      planPlayback({
        tiles,
        isPlayable: (id) => {
          const camera = byId.get(id);
          return Boolean(camera && isCameraOnline(camera) && camera.streamUrl);
        },
        maximized,
        featured: isFeaturedLayout(wall.layout),
        paused: !pageVisible,
      }),
    [tiles, byId, maximized, wall.layout, pageVisible],
  );
  const liveCount = plan.filter((state) => state === 'live').length;
  const startDelays = useMemo(() => {
    let order = 0;
    return plan.map((state) => (state === 'live' ? order++ * STAGGER_MS : 0));
  }, [plan]);
  const snapshotCount = plan.filter((state) => state === 'snapshot').length;

  // ---------------------------------------------------------------- controls
  const immersive = standalone || isFullscreen;
  const compact = capacity >= 16;
  const chromeHidden = autoHide && !chromeVisible;

  const sidebarToggle = (
    <IconButton
      icon={sidebarOpen ? PanelLeftClose : PanelLeftOpen}
      label={sidebarOpen ? 'Kameralar panelini yopish' : 'Kameralar panelini ochish'}
      title="Kameralar paneli"
      variant="secondary"
      pressed={sidebarOpen}
      onClick={() => setSidebarOpen(!sidebarOpen)}
    />
  );

  const layoutPicker = <LayoutPicker value={wall.layout} onChange={setLayout} />;

  const sourceControls = (
    <div className="inline-flex items-center gap-0.5 rounded-control border border-border bg-surface-2 p-0.5">
      <button
        type="button"
        onClick={() => {
          setSource('manual');
          setTouring((value) => (tour.kind === 'pages' ? false : value));
        }}
        aria-pressed={source === 'manual'}
        title="Kataklarni qo'lda to'ldirish"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-colors',
          source === 'manual' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
        )}
      >
        <Hand size={14} aria-hidden="true" />
        Qo&apos;lda
      </button>
      <button
        type="button"
        onClick={() => setSource('list')}
        aria-pressed={source === 'list'}
        title="Yon paneldagi filtrga mos kameralar — sahifama-sahifa"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-colors',
          source === 'list' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
        )}
      >
        <ListVideo size={14} aria-hidden="true" />
        Ro&apos;yxat
      </button>
      {source === 'list' && (
        <span className="flex items-center gap-0.5 pl-1 text-[13px] tabular-nums text-muted">
          <IconButton icon={ChevronLeft} size="sm" label="Oldingi sahifa" onClick={() => step(-1)} className="h-7 w-7" />
          {Math.min(page + 1, pages)}/{pages}
          <IconButton icon={ChevronRight} size="sm" label="Keyingi sahifa" onClick={() => step(1)} className="h-7 w-7" />
        </span>
      )}
    </div>
  );

  const statusText = (
    <span
      className="hidden text-xs tabular-nums text-muted md:inline"
      title={`Bir vaqtda ko'pi bilan ${WALL_MAX_LIVE} ta jonli oqim; qolganlari kadr (rasm) ko'rinishida`}
    >
      {pageVisible ? `${liveCount} jonli${snapshotCount ? ` · ${snapshotCount} kadr` : ''}` : 'Pauza (varaq fonda)'}
      {touring && tourPaused && pageVisible ? " · tur to'xtab turibdi" : ''}
    </span>
  );

  const clearButton = source === 'manual' && onWall.size > 0 && (
    <IconButton icon={Trash2} label="Barcha kataklarni bo'shatish" onClick={() => editTiles((base) => base.map(() => null))} />
  );

  const helpPopover = (
    <WallPopover icon={<Keyboard size={16} aria-hidden="true" />} ariaLabel="Klaviatura tugmalari" title="Klaviatura tugmalari" align="right" widthClass="w-72">
      {() => (
        <div className="space-y-2 text-[13px]">
          <p className="text-sm font-semibold">Klaviatura tugmalari</p>
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">{key}</kbd>
              <span className="text-right text-muted">{label}</span>
            </div>
          ))}
        </div>
      )}
    </WallPopover>
  );

  const viewsMenu = (
    <ViewsMenu
      views={views}
      activeViewId={activeViewId}
      dirty={dirty}
      onApply={applyView}
      onSaveNew={saveNewView}
      onUpdate={updateView}
      onRename={renameView}
      onDelete={deleteView}
      onExport={exportViews}
      onImport={(file) => void importViews(file)}
      onOpenWindow={openWindow}
      align={immersive ? 'left' : 'right'}
    />
  );

  const tourMenu = (
    <TourMenu
      settings={tour}
      onChange={(next) => setStoredTour(next)}
      running={touring}
      onToggle={toggleTour}
      views={views}
      pages={pages}
      align={immersive ? 'left' : 'right'}
    />
  );

  const openWindowButton = standalone ? null : (
    <Button icon={ExternalLink} onClick={() => openWindow(activeViewId)} title="Yangi oynada ochish (ikkinchi monitor uchun)">
      <span className="hidden lg:inline">Yangi oynada ochish</span>
      <span className="sr-only lg:hidden">Yangi oynada ochish</span>
    </Button>
  );

  const fullscreenButton = (
    <IconButton
      icon={isFullscreen ? Minimize : Maximize}
      label={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
      title="To'liq ekran (F)"
      variant="secondary"
      onClick={toggleFullscreen}
    />
  );

  // ---------------------------------------------------------------- grid
  const gridStyle =
    maximized !== null
      ? { gridTemplateColumns: 'minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr)' }
      : {
          gridTemplateColumns: `repeat(${geometry.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${geometry.rows}, minmax(0, 1fr))`,
        };

  const grid = (
    <div role="grid" aria-label="Videodevor" className="grid h-full w-full gap-0.5 overflow-hidden bg-black" style={gridStyle}>
      {geometry.cells.map((cell) => {
        const state = plan[cell.index];
        if (state === 'hidden') return null;
        const cameraId = tiles[cell.index] ?? null;
        const isMax = maximized === cell.index;
        return (
          <WallTile
            key={`${cell.index}:${cameraId ?? ''}`}
            index={cell.index}
            cameraId={cameraId}
            camera={cameraId ? byId.get(cameraId) ?? null : null}
            playback={state}
            pending={loading && Boolean(cameraId) && !byId.has(cameraId ?? '')}
            style={
              isMax
                ? { gridColumn: '1 / -1', gridRow: '1 / -1' }
                : {
                    gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                    gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                  }
            }
            startDelayMs={startDelays[cell.index]}
            selected={selected === cell.index}
            maximized={isMax}
            editable
            compact={compact && !isMax && !(isFeaturedLayout(wall.layout) && cell.index === 0)}
            onSelect={(index) => setSelected((current) => (current === index ? null : index))}
            onToggleMaximize={(index) => setMaximized((current) => (current === index ? null : index))}
            onRemove={(index) => editTiles((base) => removeAt(base, index))}
            onDropCamera={(index, id) => editTiles((base) => placeCamera(base, index, id))}
            onDropTile={(from, to) => editTiles((base) => swapTiles(base, from, to))}
          />
        );
      })}
    </div>
  );

  const sidebar = sidebarOpen && (
    <CameraSidebar
      cameras={cameras}
      filtered={filtered}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next);
        setPage(0);
      }}
      onAdd={addCamera}
      onClose={() => setSidebarOpen(false)}
      onReload={() => void reload()}
      loading={loading}
      error={error}
      onWall={onWall}
      className={immersive ? 'shadow-pop md:w-72' : 'h-72 md:h-full'}
    />
  );

  /** To'liq ekran / alohida oyna: barcha boshqaruvlar bitta suzuvchi qatorda. */
  const overlayChrome: ReactNode = immersive && (
    <div
      className={cn(
        'absolute inset-x-2 top-2 z-40 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface/95 p-1.5 text-fg shadow-pop backdrop-blur transition-opacity duration-300',
        chromeHidden ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
    >
      {sidebarToggle}
      {layoutPicker}
      {sourceControls}
      {viewsMenu}
      {tourMenu}
      <div className="ml-auto flex items-center gap-1.5">
        {statusText}
        {clearButton}
        {helpPopover}
        {fullscreenButton}
      </div>
    </div>
  );

  // Ildiz element BITTA va doim bir xil tuzilishda: to'liq ekranga o'tganda
  // boshqa daraxt chizilsa, Fullscreen API bog'langan element DOM'dan
  // chiqib ketib, to'liq ekran darhol yopilardi (pleyerlar ham qayta ulanardi).
  const root = (
    <div
      ref={rootRef}
      data-theme={immersive ? 'dark' : undefined}
      className={cn(
        immersive
          ? cn('relative flex flex-col bg-black', standalone ? 'h-screen w-screen' : 'h-full w-full')
          : cn('flex min-h-[460px] flex-col', presentation ? 'h-[calc(100vh-15rem)]' : 'h-[calc(100vh-19.5rem)]'),
      )}
    >
      {overlayChrome}
      <div className={cn('flex min-h-0 flex-1', immersive ? '' : 'flex-col gap-3 md:flex-row')}>
        {sidebar && <div className={immersive ? 'z-30 h-full p-2 pt-16' : 'shrink-0 md:h-full'}>{sidebar}</div>}
        <div className={cn('min-h-[260px] min-w-0 flex-1 overflow-hidden', !immersive && 'rounded-card border border-border shadow-card')}>
          {grid}
        </div>
      </div>
      {immersive && error && cameras.length === 0 && (
        <div role="alert" className="absolute inset-x-0 bottom-4 z-40 mx-auto w-fit rounded-control bg-danger px-3 py-2 text-xs text-danger-fg">
          {error}
        </div>
      )}
    </div>
  );

  if (standalone) return root;

  return (
    <Page
      title="Jonli kameralar"
      subtitle="Bir necha kameraning tasvirini bitta ekranda ko'rish. Yon paneldan bino va qavat bo'yicha kerakli kamerani toping, katakchalarga torting, tanlovni saqlab qo'ying yoki ikkinchi monitorda alohida oynada oching."
      actions={
        <>
          {layoutPicker}
          {viewsMenu}
          {tourMenu}
          {openWindowButton}
          {fullscreenButton}
        </>
      }
      toolbar={
        <Toolbar
          end={
            <>
              {statusText}
              {clearButton}
              {helpPopover}
            </>
          }
        >
          {sidebarToggle}
          {sourceControls}
        </Toolbar>
      }
    >
      {error && cameras.length === 0 && !sidebarOpen && <ErrorState message={error} onRetry={() => void reload()} />}
      {root}
    </Page>
  );
}
