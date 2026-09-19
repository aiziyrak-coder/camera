import { useState } from 'react';
import { CheckCircle2, CircleDot, Loader2, RotateCcw, ShieldAlert, UserCheck, X } from 'lucide-react';
import ResolveDialog from './ResolveDialog';
import SlaBadge from './SlaBadge';
import { useAssignees } from './useAssignees';
import { useToast } from '../ui/Toast';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL } from '../../lib/eventLabels';
import { canAssign, statusActions, type StatusAction } from '../../lib/eventWorkflow';
import type { AIEvent, EventStatus } from '../../types';

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

const ACTION_ICON: Record<EventStatus, typeof CircleDot> = {
  yangi: RotateCcw,
  jarayonda: CircleDot,
  tasdiqlangan: ShieldAlert,
  rad_etilgan: X,
  hal_qilindi: CheckCircle2,
};

const VARIANT_CLASS: Record<StatusAction['variant'], string> = {
  primary: 'bg-indigo-600 text-white shadow-btn hover:bg-indigo-700',
  success: 'bg-emerald-600 text-white shadow-btn hover:bg-emerald-700',
  neutral: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
};

function formatLocal(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 16).replace('T', ' ') : null;
}

/** Ish jarayoni bloki: mas'ul (tayinlash), muddat, holat amallari va yechim.
 *  Har amaldan keyin server qaytargan yangi hodisa `onChanged` ga beriladi. */
export default function EventWorkflowPanel({
  event,
  onChanged,
}: {
  event: AIEvent;
  onChanged: (updated: AIEvent) => void;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const assignable = canAssign(event);
  const { assignees, error: assigneesError } = useAssignees(assignable);
  const [pending, setPending] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function assign(userId: string | null) {
    setPending('assign');
    try {
      const updated = await api.post<AIEvent>(`/api/events/${event.id}/assign`, { userId }, token);
      onChanged(updated);
      toast.success(userId ? `Tayinlandi: ${updated.assignedToName ?? ''}` : 'Tayinlov olib tashlandi');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(null);
    }
  }

  async function changeStatus(target: EventStatus, note?: string) {
    setPending(target);
    try {
      const updated = await api.post<AIEvent>(`/api/events/${event.id}/status`, { status: target, note }, token);
      onChanged(updated);
      toast.success(`Holat: ${STATUS_LABEL[updated.status]}`);
    } catch (err) {
      // Yechim dialogi xatoni o'zida ko'rsatadi (ochiq qoladi).
      if (note === undefined) toast.error(errorText(err));
      throw err;
    } finally {
      setPending(null);
    }
  }

  if (event.isTrial) return null;

  const actions = statusActions(event.status);
  // Tanlangan foydalanuvchi ro'yxatda bo'lmasa ham (huquqi olingan) ko'rinsin.
  const options =
    event.assignedToId && !assignees.some((a) => a.id === event.assignedToId)
      ? [{ id: event.assignedToId, fullName: event.assignedToName ?? "Noma'lum", role: '' }, ...assignees]
      : assignees;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-100 bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Ish jarayoni</h4>
        <SlaBadge event={event} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`assignee-${event.id}`} className="text-xs font-semibold text-slate-500">
          Mas&apos;ul
        </label>
        {assignable ? (
          <>
            <select
              id={`assignee-${event.id}`}
              value={event.assignedToId ?? ''}
              disabled={pending !== null}
              onChange={(e) => assign(e.target.value || null)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300 disabled:opacity-60"
            >
              <option value="">— Tayinlanmagan —</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                  {a.role ? ` (${a.role})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => assign('me')}
              disabled={pending !== null}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {pending === 'assign' ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
              Menga
            </button>
          </>
        ) : (
          <span className="text-sm font-medium text-slate-700">{event.assignedToName ?? '—'}</span>
        )}
      </div>
      {assigneesError && assignable && (
        <p className="text-[11px] text-red-600">Foydalanuvchilar ro&apos;yxatini yuklab bo&apos;lmadi</p>
      )}
      {event.assignedAt && event.assignedToName && (
        <p className="text-[11px] text-slate-400">Tayinlangan: {formatLocal(event.assignedAt)}</p>
      )}

      {event.status === 'hal_qilindi' && event.resolutionNote && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-emerald-700">
            Yechim · {event.resolvedBy ?? ''}
            {event.resolvedAt ? ` · ${formatLocal(event.resolvedAt)}` : ''}
          </p>
          <p className="whitespace-pre-line text-sm text-emerald-900">{event.resolutionNote}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = ACTION_ICON[action.target];
          return (
            <button
              key={action.target}
              type="button"
              disabled={pending !== null}
              onClick={() => {
                if (action.needsNote) setResolving(true);
                else changeStatus(action.target).catch(() => undefined);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${VARIANT_CLASS[action.variant]}`}
            >
              {pending === action.target ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
              {action.label}
            </button>
          );
        })}
      </div>

      <ResolveDialog
        open={resolving}
        onCancel={() => setResolving(false)}
        onConfirm={async (note) => {
          try {
            await changeStatus('hal_qilindi', note);
          } catch (err) {
            throw new Error(errorText(err));
          }
          setResolving(false);
        }}
      />
    </section>
  );
}
