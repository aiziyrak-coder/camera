import { Check, FlaskConical, ImageOff, UserCheck, X } from 'lucide-react';
import { Badge, Button, StatusBadge, cn } from '../../ui';
import SlaBadge from './SlaBadge';
import { SEVERITY_STRIPE } from '../../lib/eventLabels';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';

type Decision = 'tasdiqlangan' | 'rad_etilgan';

/** Hodisa kadri (kichik). Kadr saqlanmagan bo'lsa — joy egallovchi. */
export function EventThumb({ event, className }: { event: AIEvent; className: string }) {
  return event.snapshotUrl ? (
    <img src={event.snapshotUrl} alt="" loading="lazy" className={cn(className, 'object-cover')} />
  ) : (
    <div className={cn(className, 'flex items-center justify-center bg-surface-2 text-subtle')}>
      <ImageOff size={16} aria-hidden="true" />
    </div>
  );
}

/** Navbat / sinov kartasi: kadr, nima va qayerda, SLA, ikki qaror tugmasi. */
export default function ReviewCard({
  event,
  busy,
  onOpen,
  onReview,
}: {
  event: AIEvent;
  busy: boolean;
  onOpen: () => void;
  onReview: (decision: Decision) => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className={cn('h-1', SEVERITY_STRIPE[event.severity])} aria-hidden="true" />
      <button
        type="button"
        onClick={onOpen}
        className="relative block text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/50"
        aria-label={`${event.moduleName} tafsilotlari`}
      >
        <EventThumb event={event} className="aspect-video w-full" />
        <span className="absolute left-2 top-2 flex gap-1">
          <StatusBadge kind="severity" status={event.severity} />
          {event.isTrial && (
            <Badge tone="warning" icon={FlaskConical}>
              Sinov
            </Badge>
          )}
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] tabular-nums text-white" title={event.timestamp}>
          {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="font-semibold text-fg">{event.moduleName}</p>
        {event.personName && <p className="text-[13px] text-fg">{event.personName}</p>}
        <p className="text-xs text-muted">
          {event.cameraName}
          {event.building ? ` · ${event.building}` : ''} · ishonch <span className="tabular-nums">{event.confidence}%</span>
        </p>
        {event.details?.reason && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted" title={event.details.reason}>
            {event.details.reason}
          </p>
        )}
        {!event.isTrial && (event.status === 'jarayonda' || event.dueAt || event.assignedToName) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {event.status === 'jarayonda' && <StatusBadge kind="event" status="jarayonda" />}
            <SlaBadge event={event} />
            {event.assignedToName && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <UserCheck size={12} aria-hidden="true" />
                {event.assignedToName}
              </span>
            )}
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <Button icon={X} onClick={() => onReview('rad_etilgan')} disabled={busy}>
            Rad etish
          </Button>
          <Button variant="primary" icon={Check} onClick={() => onReview('tasdiqlangan')} disabled={busy}>
            Tasdiqlash
          </Button>
        </div>
      </div>
    </article>
  );
}
