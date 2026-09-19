import { Camera as CameraIcon, RotateCw } from 'lucide-react';
import { MARKER_TONE_COLOR, MARKER_TONE_LABEL, fovConePath, pointAtAngle, type MarkerTone } from '../../lib/floorPlan';

export interface MarkerData {
  id: string;
  name: string;
  zone: string;
  tone: MarkerTone;
  openEvents: number;
  /** Hozirgina realtime signal keldi — marker bir muddat "urib" turadi. */
  pulsing: boolean;
  ptzEnabled: boolean;
}

const CONE_RADIUS = 46;
const FOV_DEGREES = 70;
/** Aylantirish tutqichi markazdan shu masofada — konusning uchida. */
const ROTATE_HANDLE_DISTANCE = 52;
const BOX = (ROTATE_HANDLE_DISTANCE + 12) * 2;
const C = BOX / 2;

/** Rejadagi bitta kamera: rangli doira, qaragan tomoniga ko'rish konusi,
 *  ochiq signallar soni va sichqoncha ostida qisqa ma'lumot.
 *
 * Bosish/sudrash ishoralari bu yerda emas, FloorPlanCanvas'da
 * (data-marker-id / data-rotate-id atributlari orqali) — shunda bitta
 * ko'rsatkich (sichqoncha yoki barmoq) kuzatuvi siljitish, pinch va
 * marker sudrashni bir-biridan to'g'ri ajratadi. */
export default function CameraMarker({
  marker,
  x,
  y,
  rotation,
  selected,
  editing,
  onKeyboardActivate,
}: {
  marker: MarkerData;
  x: number;
  y: number;
  rotation: number | null;
  selected: boolean;
  editing: boolean;
  onKeyboardActivate: () => void;
}) {
  const color = MARKER_TONE_COLOR[marker.tone];
  const hasEvents = marker.openEvents > 0;
  const handle = pointAtAngle({ x: C, y: C }, rotation ?? 0, ROTATE_HANDLE_DISTANCE);

  return (
    <div
      className="group pointer-events-none absolute left-0 top-0"
      style={{ transform: `translate(${x - C}px, ${y - C}px)`, width: BOX, height: BOX, zIndex: selected ? 30 : hasEvents ? 20 : 10 }}
    >
      <svg width={BOX} height={BOX} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
        {rotation !== null && (
          <path
            d={fovConePath(C, C, CONE_RADIUS, FOV_DEGREES)}
            fill={color}
            fillOpacity={selected ? 0.28 : 0.18}
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={1}
            style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${C}px ${C}px` }}
          />
        )}
        {editing && selected && (
          <line x1={C} y1={C} x2={handle.x} y2={handle.y} stroke="rgb(var(--c-primary))" strokeWidth={1.5} strokeDasharray="3 3" />
        )}
      </svg>

      {(marker.pulsing || hasEvents) && (
        <span
          className={`pointer-events-none absolute rounded-full bg-danger/40 ${marker.pulsing ? 'animate-ping' : 'animate-pulse'}`}
          style={{ left: C - 18, top: C - 18, width: 36, height: 36 }}
        />
      )}

      <button
        type="button"
        data-marker-id={marker.id}
        onClick={(e) => {
          // Sichqoncha/barmoq bosishini Canvas o'zi hal qiladi; bu yerda
          // faqat klaviaturadan (Enter/Probel) kelgan "click" (detail=0).
          if (e.detail === 0) onKeyboardActivate();
        }}
        aria-label={`${marker.name} — ${MARKER_TONE_LABEL[marker.tone]}${hasEvents ? `, ${marker.openEvents} ta ochiq signal` : ''}`}
        className={`pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-white text-white shadow-md outline-none transition-transform focus-visible:ring-4 focus-visible:ring-primary/50 ${
          selected ? 'scale-110 ring-4 ring-primary/60' : ''
        } ${editing ? 'cursor-move' : 'cursor-pointer'}`}
        style={{ left: C - 14, top: C - 14, width: 28, height: 28, backgroundColor: color, touchAction: 'none' }}
      >
        <CameraIcon size={14} strokeWidth={2.4} />
        {hasEvents && (
          <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {marker.openEvents > 99 ? '99+' : marker.openEvents}
          </span>
        )}
      </button>

      {editing && selected && (
        <span
          data-rotate-id={marker.id}
          title="Yo'nalishni burish uchun sudrang"
          className="pointer-events-auto absolute flex h-6 w-6 cursor-grab items-center justify-center rounded-full border-2 border-white bg-primary text-primary-fg shadow-md active:cursor-grabbing"
          style={{ left: handle.x - 12, top: handle.y - 12, touchAction: 'none' }}
        >
          <RotateCw size={12} />
        </span>
      )}

      <div
        className="pointer-events-none absolute left-1/2 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-control bg-black/85 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg group-hover:block"
        style={{ bottom: C + 20 }}
      >
        <p className="truncate font-semibold">{marker.name}</p>
        <p className="truncate text-white/70">{marker.zone}</p>
        <p className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {MARKER_TONE_LABEL[marker.tone]}
          {marker.ptzEnabled && <span className="text-white/70">· PTZ</span>}
          {hasEvents && <span className="font-semibold text-danger">· {marker.openEvents} ta signal</span>}
        </p>
      </div>
    </div>
  );
}
