import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, ArrowRightLeft, Loader2, MessageSquare, Send, Sparkles, UserCheck } from 'lucide-react';
import { ApiError, api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent, EventTimelineItem } from '../../types';

const MAX_COMMENT = 2000;

const KIND_ICON: Record<EventTimelineItem['kind'], typeof MessageSquare> = {
  yaratildi: Sparkles,
  izoh: MessageSquare,
  holat: ArrowRightLeft,
  tayinlash: UserCheck,
  muddat: AlarmClock,
};

const KIND_TONE: Record<EventTimelineItem['kind'], string> = {
  yaratildi: 'bg-indigo-100 text-indigo-600',
  izoh: 'bg-sky-100 text-sky-700',
  holat: 'bg-emerald-100 text-emerald-700',
  tayinlash: 'bg-violet-100 text-violet-700',
  muddat: 'bg-red-100 text-red-600',
};

/** Hodisa tarixi va izohlar: kim, qachon, nima qildi. Hodisa o'zgarganda
 *  (holat, tayinlov, izohlar soni — jumladan boshqa operator tomonidan,
 *  WebSocket orqali) tarix qayta yuklanadi. Boshqa hodisaga o'tilganda
 *  komponent qayta yaratiladi (key={event.id}) — qoralama izoh qolmaydi. */
export default function EventActivity({ event }: { event: AIEvent }) {
  const { token } = useAuth();
  const [items, setItems] = useState<EventTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Tarixga ta'sir qiladigan maydonlar — shular o'zgarsa qayta so'raymiz.
  const changeKey = [
    event.id,
    event.status,
    event.assignedToId ?? '',
    event.commentsCount ?? '',
    event.escalatedAt ?? '',
    event.reviewedAt ?? '',
  ].join('|');

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<EventTimelineItem[]>(`/api/events/${event.id}/timeline`, token, { signal: controller.signal })
      .then(setItems)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError(err instanceof ApiError ? err.message : "Tarixni yuklab bo'lmadi");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // changeKey event.id ni ham o'z ichiga oladi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeKey, token, nonce]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.post(`/api/events/${event.id}/comments`, { body }, token);
      setDraft('');
      setNonce((n) => n + 1);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Izohni yuborib bo'lmadi");
    } finally {
      setSending(false);
    }
  }, [draft, sending, event.id, token]);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white/70 p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Tarix va izohlar</h4>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-4 text-slate-400">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : error ? (
        <p className="text-xs font-medium text-red-600">
          {error}{' '}
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="font-semibold underline">
            Qayta urinish
          </button>
        </p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} className="flex gap-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${KIND_TONE[item.kind]}`}>
                  <Icon size={12} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-400" title={item.at.slice(0, 19).replace('T', ' ')}>
                    {item.authorName ? <span className="font-semibold text-slate-600">{item.authorName}</span> : 'Tizim'}
                    {' · '}
                    {relativeTime(item.at)}
                  </p>
                  <p
                    className={`whitespace-pre-line break-words text-sm ${
                      item.kind === 'izoh' ? 'rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-800' : 'text-slate-700'
                    }`}
                  >
                    {item.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          aria-label="Izoh yozish"
          placeholder="Izoh yozing… (Ctrl+Enter — yuborish)"
          className="min-w-0 flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          aria-label="Izohni yuborish"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-btn hover:bg-indigo-700 disabled:opacity-40"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
      {sendError && <p className="mt-1.5 text-xs font-semibold text-red-600">{sendError}</p>}
    </section>
  );
}
