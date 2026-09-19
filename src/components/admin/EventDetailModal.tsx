import { Check, ImageOff, User, X } from 'lucide-react';
import Modal from '../Modal';
import Badge from '../Badge';
import SlaBadge from '../events/SlaBadge';
import { SEVERITY_LABEL, SEVERITY_TONE, STATUS_LABEL, STATUS_TONE } from '../../lib/eventLabels';
import { isOpenStatus } from '../../lib/eventWorkflow';
import type { AIEvent } from '../../types';

export default function EventDetailModal({
  event,
  onClose,
  onReview,
}: {
  event: AIEvent | null;
  onClose: () => void;
  onReview: (id: string, status: 'tasdiqlangan' | 'rad_etilgan') => void;
}) {
  return (
    <Modal open={!!event} onClose={onClose} title={event?.moduleName} maxWidth="max-w-lg">
      {event && (
        <div className="space-y-5">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
            {event.snapshotUrl ? (
              <img
                src={event.snapshotUrl}
                alt={`${event.moduleName} — ${event.cameraName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-white/30">
                <ImageOff size={28} />
                <span className="text-xs">Kadr saqlanmagan</span>
              </div>
            )}
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-bold text-white">
              AI aniqlagan kadr
            </span>
            <span className="absolute bottom-3 right-3 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
              {event.timestamp}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[event.severity]}>{`Muhimlik: ${SEVERITY_LABEL[event.severity]}`}</Badge>
            <Badge tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
            <Badge tone="indigo">{`Ishonch: ${event.confidence}%`}</Badge>
            <SlaBadge event={event} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Kamera</p>
              <p className="font-medium text-slate-800">{event.cameraName}</p>
            </div>
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Joylashuv</p>
              <p className="font-medium text-slate-800">{event.building}</p>
            </div>
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Kriteriya kodi</p>
              <p className="font-medium text-slate-800">№{event.moduleCode}</p>
            </div>
            {event.personName && (
              <div className="glass-deep flex items-center gap-2 px-3 py-2.5">
                <User size={14} className="text-slate-400" />
                <div>
                  <p className="text-[11px] text-slate-400">Shaxs</p>
                  <p className="font-medium text-slate-800">{event.personName}</p>
                </div>
              </div>
            )}
            {event.assignedToName && (
              <div className="glass-deep px-3 py-2.5">
                <p className="text-[11px] text-slate-400">Mas&apos;ul</p>
                <p className="font-medium text-slate-800">{event.assignedToName}</p>
              </div>
            )}
            {event.reviewedBy && (
              <div className="glass-deep px-3 py-2.5">
                <p className="text-[11px] text-slate-400">Ko'rib chiqdi</p>
                <p className="font-medium text-slate-800">{event.reviewedBy}</p>
              </div>
            )}
          </div>

          {event.status === 'hal_qilindi' && event.resolutionNote && (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">Yechim{event.resolvedBy ? ` · ${event.resolvedBy}` : ''}</p>
              <p className="mt-0.5 whitespace-pre-line">{event.resolutionNote}</p>
            </div>
          )}

          {isOpenStatus(event.status) && (
            <div className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
              AI signal — bu "dalil" emas, "ko'rsatkich". Yakuniy qarorni yuqoridagi kadrni ko'rib chiqqan
              holda inson qabul qiladi (human-in-the-loop).
            </div>
          )}

          {isOpenStatus(event.status) && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onReview(event.id, 'rad_etilgan')}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                <X size={14} />
                Rad etish
              </button>
              <button
                onClick={() => onReview(event.id, 'tasdiqlangan')}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-emerald-700"
              >
                <Check size={14} />
                Tasdiqlash
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
