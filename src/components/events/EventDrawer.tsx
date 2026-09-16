import { useEffect } from 'react';
import { Check, ChevronLeft, ChevronRight, ExternalLink, FlaskConical, ImageOff, Lightbulb, Trash2, X } from 'lucide-react';
import Drawer from '../ui/Drawer';
import Badge from '../Badge';
import { detailMetrics } from '../../lib/eventDetails';
import { SEVERITY_LABEL, SEVERITY_TONE, STATUS_LABEL, STATUS_TONE } from '../../lib/eventLabels';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent, EventStatus } from '../../types';

type Decision = Exclude<EventStatus, 'yangi'>;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

/** Hodisa tafsiloti — ro'yxatdan chiqmasdan, klaviatura bilan tez ko'rib chiqish:
 *  T — tasdiqlash, R — rad etish, ← → — oldingi/keyingi hodisa. */
export default function EventDrawer({
  event,
  onClose,
  onReview,
  onDelete,
  onPrev,
  onNext,
  position,
  busy = false,
}: {
  event: AIEvent | null;
  onClose: () => void;
  onReview: (event: AIEvent, status: Decision) => void;
  onDelete?: (event: AIEvent) => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
  busy?: boolean;
}) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      } else if (!busy && (e.key === 't' || e.key === 'T')) {
        onReview(event, 'tasdiqlangan');
      } else if (!busy && (e.key === 'r' || e.key === 'R')) {
        onReview(event, 'rad_etilgan');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [event, onPrev, onNext, onReview, busy]);

  const metrics = detailMetrics(event?.details);
  const reason = event?.details?.reason;

  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      title={event?.moduleName}
      subtitle={event ? `${event.cameraName}${event.building ? ` · ${event.building}` : ''}` : undefined}
      footer={
        event && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                aria-label="Oldingi hodisa"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              {position && <span className="text-xs tabular-nums text-slate-500">{position}</span>}
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Keyingi hodisa"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(event)}
                  aria-label="Hodisani o'chirish"
                  title="O'chirish"
                  className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onReview(event, 'rad_etilgan')}
                disabled={busy || event.status === 'rad_etilgan'}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={15} />
                Rad etish
                <kbd className="ml-1 rounded border border-slate-200 px-1 text-[10px] text-slate-400">R</kbd>
              </button>
              <button
                type="button"
                onClick={() => onReview(event, 'tasdiqlangan')}
                disabled={busy || event.status === 'tasdiqlangan'}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={15} />
                Tasdiqlash
                <kbd className="ml-1 rounded border border-white/40 px-1 text-[10px] text-white/80">T</kbd>
              </button>
            </div>
          </div>
        )
      }
    >
      {event && (
        <div className="space-y-4">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
            {event.snapshotUrl ? (
              <a href={event.snapshotUrl} target="_blank" rel="noreferrer" title="Kadrni to'liq o'lchamda ochish" className="group block h-full w-full">
                <img src={event.snapshotUrl} alt={`${event.moduleName} — ${event.cameraName}`} className="h-full w-full object-contain" />
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ExternalLink size={12} />
                  To&apos;liq
                </span>
              </a>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-white/40">
                <ImageOff size={28} />
                <span className="text-xs">Kadr saqlanmagan</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[event.severity]}>{`Muhimlik: ${SEVERITY_LABEL[event.severity]}`}</Badge>
            <Badge tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
            <Badge tone="indigo">{`Ishonch: ${event.confidence}%`}</Badge>
            {event.isTrial && <Badge tone="amber">Sinov signali</Badge>}
          </div>

          {(reason || metrics.length > 0) && (
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
              <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                <Lightbulb size={13} aria-hidden="true" />
                Nega signal?
              </h4>
              {reason && <p className="text-sm leading-relaxed text-slate-800">{reason}</p>}
              {metrics.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  {metrics.map((metric) => (
                    <div key={metric.key} className="flex justify-between gap-2 border-b border-indigo-100/70 py-0.5">
                      <dt className="text-slate-500">{metric.label}</dt>
                      <dd className="font-semibold tabular-nums text-slate-800">{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          {event.isTrial && (
            <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
              <FlaskConical size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Bu modul hali sinov rejimida — signal operator navbatiga chiqmagan. Bahoyingiz modul aniqligini
                o&apos;lchash uchun ishlatiladi: kadrga qarab haqqoniy baholang.
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Vaqt" value={`${event.timestamp}${event.occurredAt ? ` · ${relativeTime(event.occurredAt)}` : ''}`} />
            <Field label="Kriteriya" value={`№${event.moduleCode} ${event.moduleName}`} />
            <Field label="Kamera" value={event.cameraName} />
            <Field label="Bino" value={event.building} />
            <Field label="Shaxs" value={event.personName} />
            <Field
              label="Ko'rib chiqdi"
              value={event.reviewedBy ? `${event.reviewedBy}${event.reviewedAt ? ` · ${event.reviewedAt}` : ''}` : null}
            />
          </div>

          {event.status === 'yangi' && !event.isTrial && (
            <p className="rounded-xl bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-indigo-800">
              AI signal — bu dalil emas, ko&apos;rsatkich. Yakuniy qarorni kadrni ko&apos;rib chiqqan inson qabul qiladi.
            </p>
          )}
          <p className="text-[11px] text-slate-400">Klaviatura: T — tasdiqlash · R — rad etish · ← → — oldingi / keyingi</p>
        </div>
      )}
    </Drawer>
  );
}
