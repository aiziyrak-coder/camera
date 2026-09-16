import { useCallback, useEffect, useState } from 'react';
import { api, isAbortError } from './apiClient';
import type { Campus } from '../types';

/** Kampus kesimi (bino -> qavat -> sanoq) — Video Monitoring Markazining
 * birinchi ekrani shu bitta so'rovdan quriladi.
 *
 * Kameralar ro'yxati bu yerda yuklanmaydi: 100+ kamerani (va ularning
 * oqimlarini) birdaniga ochish aynan biz qochayotgan yuk edi. Backend
 * javobni 15 soniya keshlaydi, shuning uchun bu yerdagi davriy yangilash
 * serverga qo'shimcha ish tug'dirmaydi. */
const REFRESH_MS = 30_000;

const EMPTY: Campus = {
  buildings: [],
  cameras: 0,
  live: 0,
  offline: 0,
  noVideo: 0,
  eventsToday: 0,
  generatedAt: '',
};

export function useCampus() {
  const [campus, setCampus] = useState<Campus>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get<Campus>('/api/public/campus', undefined, { signal });
      setCampus(res);
      setError(null);
    } catch (err) {
      if (isAbortError(err)) return;
      // Jimgina bo'sh ro'yxat chizish xavfli: nosozlik "kamera yo'q"
      // bo'lib ko'rinardi. Xato holati alohida aytiladi.
      setError("Kampus kesimini yuklab bo'lmadi. Sahifani yangilang yoki qayta kiring.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => {
      // Varaq fonda bo'lsa yangilash keraksiz — operator ko'rmayapti.
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  return { campus, loading, error, reload: () => void load() };
}
