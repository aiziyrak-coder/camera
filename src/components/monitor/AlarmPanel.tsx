import { useCallback } from 'react';
import { AlertTriangle, ShieldCheck, Siren } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorState, Skeleton, StatusBadge } from '../../ui';
import { api, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useLiveEvents } from '../../lib/realtime';
import { useServerPage } from '../../lib/useServerPage';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent, CameraFeed } from '../../types';

const PAGE_SIZE = 5;

/** Eng yuqori muhimlikdagi (severity=yuqori) hodisalar — "signal".
 * Kamerani bosish uni asosiy ko'rinishga o'tkazadi: avval joriy yuklangan
 * `cameras` ro'yxatidan qidiradi, topilmasa (sahifalash tufayli hozir
 * ro'yxatda yo'q) ochiq qidiruv orqali bitta so'rov bilan topadi. */
export default function AlarmPanel({
  cameras,
  onSelectCamera,
}: {
  cameras: CameraFeed[];
  onSelectCamera: (camera: CameraFeed) => void;
}) {
  const { token } = useAuth();
  const {
    items: events,
    page,
    loading,
    error,
    reload,
  } = useServerPage<AIEvent>(
    '/api/events',
    // Avtomatik o'chirilgan kamera×modul juftligining eski signallari
    // "hozirgi xavf" emas — devorda ko'rsatilmaydi (Hodisalar sahifasida qoladi).
    { severity: 'yuqori', excludeSuppressed: 'true' },
    PAGE_SIZE,
  );

  useLiveEvents(
    (event) => {
      if (page === 1 && event.severity === 'yuqori') reload();
    },
    !!token,
  );

  const handleClick = useCallback(
    async (event: AIEvent) => {
      const known = cameras.find((c) => c.id === event.cameraId);
      if (known) {
        onSelectCamera(known);
        return;
      }
      try {
        const res = await api.get<Page<CameraFeed>>(
          `/api/public/cameras?search=${encodeURIComponent(event.cameraName)}&pageSize=1`,
        );
        if (res.items[0]) onSelectCamera(res.items[0]);
      } catch {
        /* kamera topilmadi — jim o'tkazib yuboriladi, ro'yxat baribir foydali */
      }
    },
    [cameras, onSelectCamera],
  );

  return (
    <Card>
      <CardHeader title="Signallar" subtitle="Yuqori muhimlik — kamerani ochish uchun bosing" icon={Siren} className="mb-3" />

      {loading && events.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : events.length === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="Faol signal yo'q" />
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => handleClick(e)}
                className="flex w-full items-start gap-2.5 rounded-control border border-danger/20 bg-danger-soft px-2.5 py-2 text-left transition-colors hover:border-danger/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
              >
                <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-fg">{e.cameraName}</span>
                  <span className="block truncate text-xs text-muted">
                    {e.moduleName} · {e.occurredAt ? relativeTime(e.occurredAt) : e.timestamp}
                  </span>
                  {/* Ish jarayonidagi holat: kimdir shug'ullanyaptimi yoki yopilganmi. */}
                  {(e.status !== 'yangi' || e.overdue) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {e.status !== 'yangi' && <StatusBadge kind="event" status={e.status} />}
                      {e.assignedToName && <span className="text-xs text-muted">{e.assignedToName}</span>}
                      {e.overdue && <span className="text-[11px] font-semibold uppercase text-danger">Muddati o&apos;tgan</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
