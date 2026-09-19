import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllPages } from '../../lib/apiClient';
import type { CameraFeed } from '../../types';

/** Videodevor uchun BARCHA kameralar (GET /api/public/cameras, sahifama-
 * sahifa, 500 tadan). Yuzlab kamera — bir necha yuz KB, bir martada
 * olinadi: yon paneldagi qidiruv/filtr va saqlangan ko'rinishlardagi
 * kameralarni id bo'yicha topish shu ro'yxatdan ishlaydi.
 *
 * Holat (jonli/oflayn) daqiqada bir yangilanadi, faqat varaq ko'rinib
 * turganda. Video havolalari imzolangan, lekin 6 soatlik oraliqda
 * o'zgarmaydi (camera-api/app/services/stream_links.py) — shuning uchun
 * yangilanish pleyerlarni qayta ulamaydi. */
const REFRESH_MS = 60_000;

export function useWallCameras() {
  const [cameras, setCameras] = useState<CameraFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const items = await fetchAllPages<CameraFeed>('/api/public/cameras', undefined, {}, 500);
      setCameras(items);
      setError(null);
    } catch {
      // Eski ro'yxat (bo'lsa) qoladi — devor bir martalik tarmoq xatosidan
      // bo'shab qolmasin; xato alohida ko'rsatiladi.
      setError("Kameralar ro'yxatini yuklab bo'lmadi. Tarmoqni tekshiring yoki qayta kiring.");
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return { cameras, loading, error, reload: load };
}
