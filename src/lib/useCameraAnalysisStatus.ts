import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAbortError } from './apiClient';
import { useVisibleInterval } from './useVisibleInterval';
import type { CameraAnalysisStatus } from '../types';

const POLL_INTERVAL_MS = 5000;

/** Polls GET /api/public/cameras/{id}/analysis-status for background sweep badge.
 *  So'rov faqat sahifa ko'rinib turganda takrorlanadi (useVisibleInterval) —
 *  fonda qolgan yorliq har 5 soniyada serverga urmaydi. */
export function useCameraAnalysisStatus(cameraId: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<CameraAnalysisStatus | null>(null);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const active = Boolean(cameraId && enabled);

  const poll = useCallback(async () => {
    if (!cameraId || inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await api.get<CameraAnalysisStatus>(`/api/public/cameras/${cameraId}/analysis-status`, undefined, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setStatus(res);
    } catch (err) {
      if (!isAbortError(err)) {
        /* ignore transient errors */
      }
    } finally {
      inFlight.current = false;
    }
  }, [cameraId]);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    poll();
    return () => {
      abort.current?.abort();
      inFlight.current = false;
    };
  }, [active, poll]);

  useVisibleInterval(poll, active ? POLL_INTERVAL_MS : null);

  return status;
}
