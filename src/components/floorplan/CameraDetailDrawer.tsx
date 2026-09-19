import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Lock, Siren, VideoOff } from 'lucide-react';
import Drawer from '../ui/Drawer';
import Badge from '../Badge';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { ApiError, api, buildQuery, isAbortError, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { MARKER_TONE_LABEL, markerTone } from '../../lib/floorPlan';
import type { FloorPlanCamera } from '../../lib/floorPlansApi';
import { SEVERITY_TONE, STATUS_LABEL, STATUS_TONE } from '../../lib/eventLabels';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';

const TONE_BADGE = { online: 'green', noVideo: 'amber', offline: 'red' } as const;
const ADMIN_STATUS_LABEL: Record<string, string> = { faol: 'Faol', nofaol: 'Nofaol', tamirda: "Ta'mirda" };
const RECENT_LIMIT = 6;

/** Rejadagi kamera bosilganda: jonli tasvir, holat va oxirgi signallar. */
export default function CameraDetailDrawer({
  camera,
  buildingName,
  floor,
  canViewLive,
  canReviewEvents,
  eventsNonce,
  onClose,
}: {
  camera: FloorPlanCamera | null;
  buildingName: string;
  floor: number;
  canViewLive: boolean;
  canReviewEvents: boolean;
  /** Realtime signal kelganda oshadi — ro'yxat qayta yuklanadi. */
  eventsNonce: number;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [events, setEvents] = useState<AIEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const cameraId = camera?.id ?? null;

  useEffect(() => {
    if (!cameraId || !canReviewEvents || !token) {
      setEvents([]);
      return;
    }
    const controller = new AbortController();
    setEventsLoading(true);
    api
      .get<Page<AIEvent>>(
        `/api/events${buildQuery({ cameraId, page: 1, pageSize: RECENT_LIMIT })}`,
        token,
        { signal: controller.signal },
      )
      .then((res) => {
        setEvents(res.items);
        setEventsError(null);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setEventsError(err instanceof ApiError ? err.message : "Signallarni yuklab bo'lmadi");
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [cameraId, canReviewEvents, token, eventsNonce]);

  if (!camera) return null;
  const tone = markerTone(camera);
  const eventsLink = `/admin/events${buildQuery({ korinish: 'jurnal', bino: buildingName })}`;

  let videoPlaceholder: { icon: typeof VideoOff; text: string } | null = null;
  if (!canViewLive) videoPlaceholder = { icon: Lock, text: "Jonli tasvirni ko'rish huquqi yo'q" };
  else if (!camera.online) videoPlaceholder = { icon: VideoOff, text: 'Kamera oflayn — tarmoqda javob bermayapti' };
  else if (!camera.streamUrl) videoPlaceholder = { icon: VideoOff, text: 'Jonli oqim sozlanmagan' };

  return (
    <Drawer
      open
      onClose={onClose}
      title={camera.name}
      subtitle={`${buildingName} · ${floor}-qavat · ${camera.zone}`}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
          {videoPlaceholder ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
              <videoPlaceholder.icon size={26} className="text-slate-500" />
              {videoPlaceholder.text}
            </div>
          ) : (
            <LiveVideoPlayer
              key={camera.id}
              streamUrl={camera.streamUrl ?? undefined}
              cameraId={camera.id}
              priority
              fit="contain"
              className="h-full w-full"
            />
          )}
          {camera.online && !camera.videoFlowing && (
            <div className="absolute left-3 top-3 rounded-lg bg-amber-500/90 px-2 py-1 text-[11px] font-semibold text-white">
              Kamera javob beryapti, lekin yaroqli kadr kelmayapti
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE_BADGE[tone]}>{MARKER_TONE_LABEL[tone]}</Badge>
          <Badge tone="slate">{ADMIN_STATUS_LABEL[camera.status] ?? camera.status}</Badge>
          {camera.ptzEnabled && <Badge tone="indigo">PTZ</Badge>}
          {camera.openEvents > 0 ? (
            <Badge tone="red">24 soatda {camera.openEvents} ta ochiq signal</Badge>
          ) : (
            <Badge tone="green">Ochiq signal yo'q</Badge>
          )}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Siren size={15} className="text-red-500" /> Oxirgi signallar
            </h4>
            {canReviewEvents && (
              <Link to={eventsLink} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                Hodisalar jurnali <ExternalLink size={12} />
              </Link>
            )}
          </div>
          {!canReviewEvents ? (
            <p className="text-xs text-slate-500">Hodisalarni ko'rish huquqi yo'q.</p>
          ) : eventsError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{eventsError}</p>
          ) : eventsLoading && events.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Yuklanmoqda...
            </p>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500">Bu kamerada signal qayd etilmagan.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white/70">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={`h-8 w-1 shrink-0 rounded-full ${
                      SEVERITY_TONE[event.severity] === 'red'
                        ? 'bg-red-500'
                        : SEVERITY_TONE[event.severity] === 'amber'
                          ? 'bg-amber-400'
                          : 'bg-slate-300'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{event.moduleName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
                      {event.personName ? ` · ${event.personName}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[event.status] ?? 'slate'}>{STATUS_LABEL[event.status] ?? event.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
