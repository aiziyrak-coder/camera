import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { ButtonLink, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatusBadge, useToast } from '../../ui';
import EventDrawer from '../events/EventDrawer';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useLiveEvents } from '../../lib/realtime';
import { useServerPage } from '../../lib/useServerPage';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';

const PAGE_SIZE = 6;

/** Devorda ko'rsatiladigan hodisalar jurnali.
 *
 * Faqat operator TASDIQLAGAN hodisalar chiqadi (hal qilinganlari ham —
 * ular ham haqiqiy deb topilgan, ish jarayonida yopilgan xolos). Bu ataylab:
 * modullarning bir qismi hali ishonchli emas, devor esa institutda
 * ko'rsatiladigan joy. Tasdiqlanmagan signal shovqin bo'lishi mumkin,
 * tasdiqlangani esa odam ko'rib chiqqan dalil.
 *
 * To'liq oqim — tasdiqlanmaganlar ham — Hodisalar sahifasida qoladi. */
export default function EventsLogPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState<AIEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const { items: events, page, loading, error, reload } = useServerPage<AIEvent>(
    '/api/events',
    { status: 'tasdiqlangan,hal_qilindi' },
    PAGE_SIZE,
  );

  useLiveEvents(() => {
    if (page === 1) reload();
  }, !!token);

  // Bu yerdan ham qaror qilish mumkin: devorni kuzatib turgan operator
  // hodisani ko'rib, o'sha zahoti hukm qila oladi. Oyna — Hodisalar
  // sahifasidagi bilan AYNAN bir xil (EventDrawer).
  async function review(event: AIEvent, status: 'tasdiqlangan' | 'rad_etilgan') {
    setBusy(true);
    try {
      await api.patch(`/api/events/${event.id}/review`, { status }, token);
      toast.success(status === 'tasdiqlangan' ? 'Hodisa tasdiqlandi' : "Hodisa rad etildi (yolg'on signal)");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi");
    } finally {
      setBusy(false);
      setSelected(null);
      reload();
    }
  }

  return (
    <Card>
      <CardHeader
        title="Hodisalar jurnali"
        subtitle="Tasdiqlangan signallar"
        icon={ListChecks}
        className="mb-3"
        actions={
          <ButtonLink to="/hodisalar?korinish=jurnal" size="sm" variant="ghost">
            Barchasi
          </ButtonLink>
        }
      />

      {loading && events.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : events.length === 0 ? (
        <EmptyState
          compact
          icon={ListChecks}
          title="Tasdiqlangan hodisa yo'q"
          description="Yangi signallar Hodisalar sahifasida ko'rib chiqiladi."
        />
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => setSelected(event)}
                className="flex w-full items-start gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{event.moduleName}</span>
                  <span className="block truncate text-xs text-muted">
                    {event.cameraName} · {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
                  </span>
                </span>
                <StatusBadge kind="event" status={event.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <EventDrawer event={selected} onClose={() => setSelected(null)} onReview={review} busy={busy} />
    </Card>
  );
}
