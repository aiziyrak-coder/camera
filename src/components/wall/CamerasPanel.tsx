import { Cctv } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { fetchAllPages } from '../../lib/apiClient';
import { isCameraOnline } from '../../lib/videoWall';
import type { CameraFeed } from '../../types';
import { WallPanel } from './primitives';

/** 2–4 jonli kamera. Kanal kengligini tejash uchun faqat tanlangan
 *  (yoki birinchi onlayn) kameralar; onlayn kamera yo'q bo'lsa panel
 *  umuman chiqmaydi (`onEmpty`). */
export function CamerasPanel({ ids, onAvailability }: { ids: string[]; onAvailability: (has: boolean) => void }) {
  const [cams, setCams] = useState<CameraFeed[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchAllPages<CameraFeed>('/api/public/cameras', undefined, {}, 500)
        .then((items) => {
          if (!cancelled) setCams(items);
        })
        .catch(() => {
          /* oflayn — oxirgi ro'yxat qoladi */
        });
    void load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const picked = useMemo(() => {
    const online = (cams ?? []).filter((c) => isCameraOnline(c) && c.streamUrl);
    if (!ids.length) return online.slice(0, 2);
    // Indeks bo'yicha: ilgari har bir id uchun butun ro'yxat qidirilardi.
    const byId = new Map(online.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is CameraFeed => Boolean(c));
  }, [cams, ids]);
  const has = picked.length > 0;

  useEffect(() => {
    if (cams) onAvailability(has);
  }, [cams, has, onAvailability]);

  if (!has) return null;
  return (
    <WallPanel area="F" title="Kameralar" icon={<Cctv />}>
      <div
        className="grid min-h-0 flex-1 gap-[0.6em]"
        style={{ gridTemplateRows: `repeat(${picked.length > 2 ? Math.ceil(picked.length / 2) : picked.length}, minmax(0, 1fr))`, gridTemplateColumns: picked.length > 2 ? '1fr 1fr' : '1fr' }}
      >
        {picked.map((c, i) => (
          <div key={c.id} className="relative min-h-0 overflow-hidden rounded-[0.7em] bg-surface-3">
            <LiveVideoPlayer streamUrl={c.streamUrl} fit="cover" className="absolute inset-0 h-full w-full" startDelayMs={i * 800} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-[0.7em] pb-[0.4em] pt-[1.2em] text-[0.8em] text-white">
              {c.name}
              {c.building ? <span className="opacity-70"> · {c.building}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </WallPanel>
  );
}
