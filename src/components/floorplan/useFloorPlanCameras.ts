import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { listPlanCameras, type FloorPlanCamera } from '../../lib/floorPlansApi';

/** Holat yangilanish oralig'i — kampus kesimi keshi (15 s) bilan bir xil. */
export const CAMERA_REFRESH_MS = 15_000;

/** Tanlangan reja kameralari: har 15 soniyada (sahifa ko'rinib turganda)
 *  yangilanadi. `reload()` — darhol (realtime signal kelganda). */
export function useFloorPlanCameras(planId: string | null, includeUnassigned: boolean) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<FloorPlanCamera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!planId || !token) {
      setCameras([]);
      loadedFor.current = null;
      return;
    }
    const key = `${planId}:${includeUnassigned}`;
    // Boshqa rejaga o'tilganda eski markerlar yangi rasm ustida bir
    // lahza ham ko'rinmasin.
    if (loadedFor.current?.split(':')[0] !== planId) setCameras([]);
    const controller = new AbortController();
    setLoading(true);
    listPlanCameras(token, planId, includeUnassigned, { signal: controller.signal })
      .then((res) => {
        loadedFor.current = key;
        setCameras(res);
        setError(null);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Kameralar holatini yuklab bo'lmadi");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [planId, includeUnassigned, token, nonce]);

  useEffect(() => {
    if (!planId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNonce((n) => n + 1);
    }, CAMERA_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [planId]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { cameras, loading, error, reload };
}
