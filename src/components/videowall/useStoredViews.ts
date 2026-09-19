import { useCallback, useEffect, useState } from 'react';
import { sanitizeViews, type WallView } from '../../lib/videoWall';

/** Saqlangan ko'rinishlar — shu brauzerda (localStorage), usePersistedState
 * bilan bir xil naqsh (har murojaat try/catch ichida), lekin ikki farq bilan:
 *
 * - o'qilgan qiymat tekshiriladi (sanitizeViews): qo'lda buzilgan yoki
 *   eski format devorni sindirmasin;
 * - boshqa oynadagi o'zgarish (`storage` hodisasi) shu yerga ham keladi —
 *   ikkinchi monitordagi /videodevor oynasi asosiy oynada yangilangan
 *   ko'rinishni o'zi oladi. */
export const VIEWS_STORAGE_KEY = 'videowall-views';

function read(): WallView[] {
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
    return raw ? sanitizeViews(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function useStoredViews() {
  const [views, setViewsState] = useState<WallView[]>(read);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === VIEWS_STORAGE_KEY || event.key === null) setViewsState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setViews = useCallback((next: WallView[] | ((prev: WallView[]) => WallView[])) => {
    setViewsState((prev) => {
      const resolved = sanitizeViews(typeof next === 'function' ? next(prev) : next);
      try {
        localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(resolved));
      } catch {
        /* xotira to'la yoki taqiqlangan — holat baribir shu oynada yangilanadi */
      }
      return resolved;
    });
  }, []);

  return [views, setViews] as const;
}
