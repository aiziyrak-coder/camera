import { useEffect, useState } from 'react';
import { ExternalLink, Lock, Siren, VideoOff } from 'lucide-react';
import { Badge, ButtonLink, Drawer, EmptyState, ErrorState, SkeletonText, StatusBadge, cn, type Tone } from '../../ui';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { ApiError, api, buildQuery, isAbortError, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { MARKER_TONE_LABEL, markerTone } from '../../lib/floorPlan';
import type { FloorPlanCamera } from '../../lib/floorPlansApi';
import { SEVERITY_STRIPE } from '../../lib/eventLabels';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';

const TONE_BADGE: Record<string, Tone> = { online: 'success', noVideo: 'warning', offline: 'danger' };
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
  floor: number | null;
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
  const eventsLink = `/hodisalar${buildQuery({ korinish: 'jurnal', bino: buildingName })}`;

  let videoPlaceholder: { icon: typeof VideoOff; text: string } | null = null;
  if (!canViewLive) videoPlaceholder = { icon: Lock, text: "Jonli tasvirni ko'rish huquqi yo'q" };
  else if (!camera.online) videoPlaceholder = { icon: VideoOff, text: 'Kamera oflayn — tarmoqda javob bermayapti' };
  else if (!camera.streamUrl) videoPlaceholder = { icon: VideoOff, text: 'Jonli oqim sozlanmagan' };

  return (
    <Drawer open onClose={onClose} title={camera.name} subtitle={`${buildingName} · ${floor === null ? "qavati belgilanmagan" : `${floor}-qavat`} · ${camera.zone}`} size="lg">
      <div className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-card bg-black">
          {videoPlaceholder ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/60">
              <videoPlaceholder.icon size={26} aria-hidden="true" className="text-white/40" />
              {videoPlaceholder.text}
            </div>
          ) : (
            <LiveVideoPlayer key={camera.id} streamUrl={camera.streamUrl ?? undefined} cameraId={camera.id} priority fit="contain" className="h-full w-full" />
          )}
          {camera.online && !camera.videoFlowing && (
            <div className="absolute left-3 top-3 rounded-control bg-warning px-2 py-1 text-[11px] font-semibold text-warning-fg">
              Kamera javob beryapti, lekin yaroqli kadr kelmayapti
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE_BADGE[tone]} dot>{MARKER_TONE_LABEL[tone]}</Badge>
          <Badge>{ADMIN_STATUS_LABEL[camera.status] ?? camera.status}</Badge>
          {camera.ptzEnabled && <Badge tone="primary">PTZ</Badge>}
          {camera.openEvents > 0 ? (
            <Badge tone="danger">24 soatda {camera.openEvents} ta ochiq signal</Badge>
          ) : (
            <Badge tone="success">Ochiq signal yo&apos;q</Badge>
          )}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Siren size={15} aria-hidden="true" className="text-danger" /> Oxirgi signallar
            </h3>
            {canReviewEvents && (
              <ButtonLink to={eventsLink} size="sm" variant="ghost" iconRight={ExternalLink}>
                Hodisalar
              </ButtonLink>
            )}
          </div>
          {!canReviewEvents ? (
            <p className="text-[13px] text-muted">Hodisalarni ko&apos;rish huquqi yo&apos;q.</p>
          ) : eventsError ? (
            <ErrorState message={eventsError} />
          ) : eventsLoading && events.length === 0 ? (
            <SkeletonText lines={3} />
          ) : events.length === 0 ? (
            <EmptyState compact icon={Siren} title="Bu kamerada signal qayd etilmagan" />
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={cn('h-8 w-1 shrink-0 rounded-full', SEVERITY_STRIPE[event.severity])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{event.moduleName}</p>
                    <p className="truncate text-xs text-muted">
                      {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
                      {event.personName ? ` · ${event.personName}` : ''}
                    </p>
                  </div>
                  <StatusBadge kind="event" status={event.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
