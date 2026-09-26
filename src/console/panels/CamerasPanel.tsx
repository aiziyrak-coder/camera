import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { cn } from '../../ui';
import { CodeText, MicroLabel } from '../../ui/intel';
import LiveVideoPlayer from '../../components/LiveVideoPlayer';
import type { LiveDetectionResult } from '../../types';
import CameraThumbnail from '../../components/videowall/CameraThumbnail';
import PtzControls from '../../components/ptz/PtzControls';
import { usePtzAvailability } from '../../components/ptz/usePtzAvailability';
import { useWallCameras } from '../../components/videowall/useWallCameras';
import { usePageVisible } from '../../components/videowall/usePageVisible';
import { buildCameraCodes, cameraCode, cameraPlaceCode } from '../../components/videowall/cameraCode';
import type { CameraFeed } from '../../types';
import Panel from '../Panel';
import { EASE, panelIn, stagger } from '../motion';
import { useVideoFlow } from '../useVideoFlow';
import {
  EMPTY_FILTER,
  WALL_LAYOUTS,
  buildingOptions,
  cameraStats,
  filterCameras,
  floorLabel,
  floorOptions,
  isStreaming,
  layoutColumns,
  pickMosaic,
  rankCameras,
  type CameraFilter,
  type WallLayout,
} from '../cameraPick';

/**
 * KAMERALAR paneli.
 *
 * Yig'ilgan holat — 4 ta katak va bitta son: nechta kamera tasvir
 * uzatmoqda. Ko'proq katak ochilmaydi, chunki har katak = bitta HLS
 * oqimi = MediaMTX'da bitta o'quvchi; konsol soatlab ochiq turadi.
 *
 * Yoyilgan holat — butun devor: filtr, 4/9/16 setkasi va bitta kamerani
 * kattalashtirish (PTZ bilan, agar kamera qo'llab-quvvatlasa). Bu yerda
 * ichki siljish (scroll) ruxsat etilgan.
 *
 * Oqim hisobi (ataylab qattiq chegaralangan):
 *   yig'ilgan  — 4 tagacha;
 *   yoyilgan   — setka tanlovicha 4/9/16 tagacha;
 *   kattalashtirilgan — ATIGI 1 (devor kataklari kadrga o'tadi);
 *   varaq fonda — 0.
 */

const MOSAIC_TILES = 4;
/** Yig'ilgan mozaika shu oraliqda navbatdagi 4 ta kameraga o'tadi. */
export const ROTATE_MS = 10_000;

/** Aylanuvchi mozaika: tasvir uzatayotgan kameralar 4 tadan navbat bilan.
 *  Kamera 4 tadan kam bo'lsa — aylanmaydi. */
export function rotatingMosaic(cameras: readonly CameraFeed[], step: number, count = MOSAIC_TILES): CameraFeed[] {
  const pool = rankCameras(cameras).filter(isStreaming);
  if (pool.length <= count) return pickMosaic(cameras, count);
  const pages = Math.ceil(pool.length / count);
  const start = (step % pages) * count;
  const page = pool.slice(start, start + count);
  // Oxirgi sahifa to'lmasa — boshidan to'ldiriladi (katak bo'sh qolmaydi).
  return page.length < count ? [...page, ...pool.slice(0, count - page.length)] : page;
}

/** Tashqaridan (Ctrl+K) "shu kamerani kattalashtir" so'rovi. */
export interface FocusRequest {
  id: string;
  nonce: number;
}

export default function CamerasPanel({
  expanded,
  onExpand,
  area,
  focusRequest = null,
}: {
  focusRequest?: FocusRequest | null;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}) {
  const { cameras, loading, error, refreshStreams } = useWallCameras();
  const pageVisible = usePageVisible(3_000);

  const stats = useMemo(() => cameraStats(cameras), [cameras]);
  const codes = useMemo(() => buildCameraCodes(cameras), [cameras]);
  const [step, setStep] = useState(0);
  const rotating = !expanded && pageVisible && cameras.filter(isStreaming).length > MOSAIC_TILES;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setStep((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating]);
  const mosaic = useMemo(() => rotatingMosaic(cameras, step), [cameras, step]);

  return (
    <Panel
      id="cameras"
      title="Kameralar"
      live={stats.flowing > 0}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={
        <CodeText className="text-[11px] text-muted">
          {stats.total === 0 ? '—' : `${stats.flowing}/${stats.live}`}
        </CodeText>
      }
      full={
        <CameraWall
          cameras={cameras}
          codes={codes}
          stats={stats}
          loading={loading}
          error={error}
          pageVisible={pageVisible}
          onStreamUnavailable={refreshStreams}
          focusRequest={focusRequest}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-baseline gap-2 px-3 pb-1 pt-2">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="intel-code text-[clamp(20px,3vh,34px)] font-semibold leading-none"
          >
            {stats.total === 0 ? '—' : stats.flowing}
            {stats.total > 0 && <span className="text-[0.5em] font-medium text-muted">/{stats.live}</span>}
          </motion.span>
          <span className="truncate text-[11px] text-muted">
            {stats.total === 0 ? (loading ? 'yuklanmoqda…' : "ma'lumot yo'q") : 'tasvir uzatmoqda'}
          </span>
        </div>

        {mosaic.length === 0 ? (
          <div className="intel-grid m-1 flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-border">
            <MicroLabel>{error ? 'Aloqa yo‘q' : loading ? 'Yuklanmoqda' : 'Kamera yo‘q'}</MicroLabel>
          </div>
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1 p-1"
          >
            {mosaic.map((camera, index) => (
              <CameraTile
                key={camera.id}
                camera={camera}
                code={cameraCode(codes, camera.id)}
                index={index}
                dense
                // Yoyilganda yig'ilgan nusxa ekranda qolsa ham (Panel uni
                // shaffof qilib saqlaydi) oqimlar YOPILADI — aks holda
                // devor ustiga yana 4 ta ulanish qo'shilardi.
                dormant={expanded}
                playing={pageVisible && !expanded && isStreaming(camera)}
                onStreamUnavailable={refreshStreams}
              />
            ))}
          </motion.div>
        )}
      </div>
    </Panel>
  );
}

/** Yoyilgan panel — to'liq kamera devori. */
function CameraWall({
  cameras,
  codes,
  stats,
  loading,
  error,
  pageVisible,
  onStreamUnavailable,
  focusRequest,
}: {
  focusRequest: FocusRequest | null;
  cameras: CameraFeed[];
  codes: ReadonlyMap<string, string>;
  stats: { flowing: number; live: number; total: number };
  loading: boolean;
  error: string | null;
  pageVisible: boolean;
  onStreamUnavailable: () => void;
}) {
  const [filter, setFilter] = useState<CameraFilter>(EMPTY_FILTER);
  const [layout, setLayout] = useState<WallLayout>(9);
  const [focusId, setFocusId] = useState<string | null>(null);

  const buildings = useMemo(() => buildingOptions(cameras), [cameras]);
  const floors = useMemo(() => floorOptions(cameras), [cameras]);
  const shown = useMemo(
    () => rankCameras(filterCameras(cameras, filter)),
    [cameras, filter],
  );
  const focus = useMemo(() => shown.find((camera) => camera.id === focusId) ?? null, [shown, focusId]);

  // Palitradan tanlangan kamera: filtr tozalanadi (u yashirib qo'ymasin) va kamera kattalashadi.
  useEffect(() => {
    if (!focusRequest) return;
    setFilter(EMPTY_FILTER);
    setFocusId(focusRequest.id);
  }, [focusRequest]);

  // Filtr o'zgarib, tanlangan kamera ro'yxatdan chiqib ketsa — yopamiz.
  useEffect(() => {
    if (focusId && !focus) setFocusId(null);
  }, [focusId, focus]);

  // Esc: avval kattalashtirilgan kamera yopiladi, panel esa ochiq qoladi.
  // Tutqich `capture` bosqichida — ConsoleShell'ning oyna tinglovchisi
  // shu bosqichdan keyin ishlaydi, shuning uchun to'xtatib turamiz.
  useEffect(() => {
    if (!focusId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFocusId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusId]);

  const columns = layoutColumns(layout);
  const ptzAvailable = usePtzAvailability(focus?.id ?? null, focus?.ptzEnabled);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/70 px-3 py-2">
        <label className="glass flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[5px] px-2.5 sm:max-w-xs">
          <Search size={14} aria-hidden="true" className="shrink-0 text-subtle" />
          <input
            value={filter.q}
            onChange={(event) => setFilter((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Kamera nomi"
            aria-label="Kamera qidirish"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
        </label>

        <select
          value={filter.building}
          onChange={(event) => setFilter((prev) => ({ ...prev, building: event.target.value }))}
          aria-label="Bino"
          className="glass h-8 rounded-[5px] px-2 text-[12.5px] outline-none"
        >
          <option value="">Barcha binolar</option>
          {buildings.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={filter.floor}
          onChange={(event) => setFilter((prev) => ({ ...prev, floor: event.target.value }))}
          aria-label="Qavat"
          className="glass h-8 rounded-[5px] px-2 text-[12.5px] outline-none"
        >
          <option value="">Barcha qavatlar</option>
          {floors.map((value) => (
            <option key={value} value={value}>
              {floorLabel(value)}
            </option>
          ))}
        </select>

        <div className="glass flex h-8 items-center rounded-[5px] p-0.5" role="group" aria-label="Setka">
          {WALL_LAYOUTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              className={cn(
                'intel-code h-7 rounded-[4px] px-2 text-[12px] transition-colors',
                layout === value ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-white/70',
              )}
            >
              {value}
            </button>
          ))}
        </div>

        <span className="ms-auto flex items-center gap-2">
          <CodeText className="text-[12px] text-muted">
            {stats.flowing}/{stats.live}
          </CodeText>
          <MicroLabel>{shown.length} ta</MicroLabel>
        </span>
      </div>

      {/* Devor — yoyilgan panel ichida siljish ruxsat etilgan. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {shown.length === 0 ? (
          <div className="intel-grid flex h-full min-h-[40vh] items-center justify-center rounded-[4px] border border-dashed border-border">
            <MicroLabel>{error ? 'Aloqa yo‘q' : loading ? 'Yuklanmoqda' : 'Topilmadi'}</MicroLabel>
          </div>
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {shown.map((camera, index) => {
              const focused = camera.id === focusId;
              // Oqim faqat BIRINCHI `layout` ta katakda (ular eng
              // "gapiradiganlari — rankCameras). Qolganlari kadr
              // ko'rsatadi: ro'yxat uzun bo'lsa ham ulanishlar soni
              // tanlangan setkadan oshmaydi.
              const playing =
                pageVisible && !focusId && index < layout && isStreaming(camera);
              if (focused) {
                // Kattalashtirilganda katak o'rni bo'sh qoladi: aynan shu
                // element yuqorida `layoutId` bilan qayta tug'iladi.
                return <div key={camera.id} className="intel-grid aspect-video rounded-[4px] opacity-40" />;
              }
              return (
                <CameraTile
                  key={camera.id}
                  camera={camera}
                  code={cameraCode(codes, camera.id)}
                  index={index}
                  playing={playing}
                  layoutId={`camera-tile-${camera.id}`}
                  onSelect={() => setFocusId(camera.id)}
                  onStreamUnavailable={onStreamUnavailable}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {focus && (
          <motion.div
            key="focus"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute inset-0 z-30 flex flex-col bg-white/80 p-2 backdrop-blur-[2px] sm:p-3"
          >
            <FocusedCamera
              camera={focus}
              code={cameraCode(codes, focus.id)}
              ptz={ptzAvailable}
              playing={pageVisible}
              onClose={() => setFocusId(null)}
              onStreamUnavailable={onStreamUnavailable}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Kattalashtirilgan bitta kamera — devordagi katagidan "o'sib chiqadi". */
function FocusedCamera({
  camera,
  code,
  ptz,
  playing,
  onClose,
  onStreamUnavailable,
}: {
  camera: CameraFeed;
  code: string;
  ptz: boolean;
  playing: boolean;
  onClose: () => void;
  onStreamUnavailable: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const live = playing && isStreaming(camera);
  const flow = useVideoFlow(holder, live);
  const place = cameraPlaceCode(camera);
  // Yuz skaneri — faqat shu BITTA kattalashtirilgan kamerada: har so'rov
  // serverda haqiqiy kadr olish va yuz tahlili, gridning 16 katagida
  // yoqilsa server bo'g'ilardi.
  const [scan, setScan] = useState<LiveDetectionResult | null>(null);
  const counts = scanCounts(scan);

  return (
    <motion.div
      layoutId={`camera-tile-${camera.id}`}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] bg-neutral-900"
    >
      <div ref={holder} className="relative min-h-0 flex-1">
        {live ? (
          <LiveVideoPlayer
            streamUrl={camera.streamUrl}
            priority
            fit="contain"
            cameraId={camera.id}
            showDetections
            onDetection={setScan}
            onStreamUnavailable={onStreamUnavailable}
          />
        ) : (
          <CameraThumbnail cameraId={camera.id} alt={camera.name} className="h-full w-full" refreshMs={10_000} />
        )}
        <DegradedLayer show={live && flow === 'stalled'} />
        {!live && <StateLayer camera={camera} />}
        {live && <ScanBadge counts={counts} />}
      </div>

      <div className="flex shrink-0 items-center gap-2 bg-black/70 px-3 py-2 text-white">
        <LiveDot on={flow === 'flowing'} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{camera.name}</span>
        {place && <CodeText className="text-[11px] text-white/60">{place}</CodeText>}
        <CodeText className="text-[11px] text-white/60">{code}</CodeText>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kamerani yopish"
          className="grid h-7 w-7 place-items-center rounded-[4px] text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {ptz && (
        <div className="absolute end-3 top-3 z-10 w-[min(220px,45%)]">
          <PtzControls cameraId={camera.id} globalKeyboard defaultOpen={false} />
        </div>
      )}
    </motion.div>
  );
}

/** Devor/mozaika katagi. */
function CameraTile({
  camera,
  code,
  index,
  playing,
  dense = false,
  dormant = false,
  layoutId,
  onSelect,
  onStreamUnavailable,
}: {
  camera: CameraFeed;
  code: string;
  index: number;
  playing: boolean;
  dense?: boolean;
  /** Katak ekranda ko'rinmayapti (panel yoyilgan) — na oqim, na kadr
   * so'raladi: yoyilgan devor ustiga ortiqcha so'rov qo'shilmasin. */
  dormant?: boolean;
  /** Faqat devor kataklarida: kattalashtirishdagi `layoutId` morfi.
   * Yig'ilgan mozaika uni BERMAYDI — aks holda yoyilganda bir xil
   * `layoutId` ikki joyda turib qolardi. */
  layoutId?: string;
  onSelect?: () => void;
  onStreamUnavailable: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const flow = useVideoFlow(holder, playing);
  const place = cameraPlaceCode(camera);

  return (
    <motion.div
      layoutId={layoutId}
      variants={panelIn}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={camera.name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative min-h-0 min-w-0 overflow-hidden rounded-[4px] bg-neutral-900 outline-none',
        !dense && 'aspect-video',
        onSelect && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      <div ref={holder} className="absolute inset-0">
        {dormant ? (
          <span className="intel-grid block h-full w-full bg-surface-2" />
        ) : playing && camera.streamUrl ? (
          <LiveVideoPlayer
            streamUrl={camera.streamUrl}
            priority
            // Kataklar birdaniga emas, navbat bilan ulanadi.
            startDelayMs={index * 220}
            fit="cover"
            onStreamUnavailable={onStreamUnavailable}
          />
        ) : (
          <CameraThumbnail cameraId={camera.id} alt={camera.name} className="h-full w-full" refreshMs={15_000} />
        )}
      </div>

      <DegradedLayer show={playing && flow === 'stalled'} />
      {!playing && !dormant && <StateLayer camera={camera} />}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-white">
        <LiveDot on={flow === 'flowing'} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{camera.name}</span>
        {!dense && place && <CodeText className="text-[10px] text-white/60">{place}</CodeText>}
        <CodeText className="text-[10px] text-white/60">{code}</CodeText>
      </div>
    </motion.div>
  );
}

/** Skaner natijasi: nechta yuz, nechtasi tanildi, nechtasi notanish. */
export function scanCounts(scan: LiveDetectionResult | null) {
  if (!scan) return null;
  let known = 0;
  let unknown = 0;
  let small = 0;
  for (const face of scan.faces) {
    const status = face.status ?? (face.personName ? 'tanildi' : 'notanish');
    if (status === 'tanildi') known += 1;
    else if (status === 'notanish') unknown += 1;
    else small += 1;
  }
  return { total: scan.faces.length, known, unknown, small, hd: scan.source === 'asosiy' };
}

/** Video ustidagi skaner holati — AI hozir nimani ko'rayotgani. */
function ScanBadge({ counts }: { counts: ReturnType<typeof scanCounts> }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[3] flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur">
      <span className={cn('h-2 w-2 rounded-full', counts ? 'live-dot bg-sky-400 text-sky-400' : 'bg-white/40')} aria-hidden="true" />
      {counts ? (
        <>
          <span>Yuz {counts.total}</span>
          <span className="text-emerald-300">Tanildi {counts.known}</span>
          <span className="text-rose-300">Notanish {counts.unknown}</span>
          {counts.small > 0 && <span className="text-white/60">Kichik {counts.small}</span>}
          {counts.hd && <span className="rounded bg-white/15 px-1 text-[10px]">4K</span>}
        </>
      ) : (
        <span>Skanerlanmoqda…</span>
      )}
    </div>
  );
}

/** Nafas oluvchi nuqta — faqat kadr ROSTDAN almashayotganda. */
function LiveDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', on ? 'live-dot bg-emerald-400 text-emerald-400' : 'bg-white/35')}
    />
  );
}

/** Oqim yo'qolgan katak qorayib qolmaydi: o'lchov to'ri va bitta so'z. */
function DegradedLayer({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="intel-grid absolute inset-0 z-[2] grid place-items-center bg-surface-2"
        >
          <MicroLabel>Uzildi</MicroLabel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Oqim ochilmagan katak nega jim turibdi — bir so'zda. */
function StateLayer({ camera }: { camera: CameraFeed }) {
  const word =
    camera.status !== 'live' ? 'Oflayn' : camera.hasVideo === false ? 'Tasvirsiz' : !camera.streamUrl ? 'Havolasiz' : 'Kadr';
  return (
    <span className="pointer-events-none absolute start-1.5 top-1.5 z-[2] rounded-[3px] bg-black/60 px-1.5 py-0.5">
      <MicroLabel className="!text-white/75">{word}</MicroLabel>
    </span>
  );
}
