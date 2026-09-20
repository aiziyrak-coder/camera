import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../ui';
import { ApiError, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { integrationsApi, progressPercent, statsSummary, type HemisStatus, type HemisTestResult, type SyncRun } from '../../lib/integrationsApi';

const POLL_MS = 2000;
/** Ketma-ket shuncha urinish xato bo'lsa — kuzatishni to'xtatamiz. */
const MAX_POLL_FAILURES = 5;

function errorText(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : "So'rov bajarilmadi";
}

/** HEMIS holati, sinxronlash tarixi va jarayonni kuzatish. Sahifa darajasida
 *  chaqiriladi: sarlavhadagi tugmalar (HemisActions) va panel (HemisPanel)
 *  bitta holatni ishlatadi; boshqa tabga o'tilsa ham jarayon kuzatiladi. */
export function useHemisSync() {
  const { token } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<HemisStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Page<SyncRun> | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsPage, setRunsPage] = useState(1);
  const [activeRun, setActiveRun] = useState<SyncRun | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<HemisTestResult | null>(null);
  const [starting, setStarting] = useState(false);
  const pollTimer = useRef<number | null>(null);
  /** Kuzatish to'xtaganidan keyin uni qaytadan boshlash uchun. */
  const [pollNonce, setPollNonce] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const next = await integrationsApi.hemisStatus(token);
      setStatus(next);
      setStatusError(null);
      if (next.running) setActiveRun(next.running);
    } catch (err) {
      setStatusError(errorText(err));
    }
  }, [token]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      setRuns(await integrationsApi.runs(runsPage, token));
      setRunsError(null);
    } catch (err) {
      // Tarix yuklanmasa ham asosiy holat ko'rinaveradi.
      setRunsError(errorText(err));
    } finally {
      setRunsLoading(false);
    }
  }, [runsPage, token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Ishlayotgan sinxronlash jarayonini kuzatish.
  const activeRunId = activeRun?.status === 'ishlamoqda' ? activeRun.id : null;
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let failures = 0;
    const tick = async () => {
      try {
        const run = await integrationsApi.run(activeRunId, token);
        if (cancelled) return;
        failures = 0;
        setActiveRun(run);
        if (run.status !== 'ishlamoqda') {
          if (run.status === 'muvaffaqiyatli') toast.success(`HEMIS sinxronlandi. ${statsSummary(run.stats)}`);
          // `run.error` bo'sh bo'lsa ilgari "…xato bilan tugadi: " deb
          // ikki nuqta bilan tugagan, sababsiz xabar chiqardi.
          else toast.error(run.error ? `HEMIS sinxronlash xato bilan tugadi: ${run.error}` : 'HEMIS sinxronlash xato bilan tugadi');
          void loadStatus();
          void loadRuns();
          return;
        }
      } catch (err) {
        // Ilgari har qanday xato JIM yutilardi: server o'chib qolsa ham
        // jarayon "ishlamoqda" ko'rinishida abadiy aylanaverardi va
        // foydalanuvchi progressni kutib o'tirardi. Endi ketma-ket bir
        // necha urinish muvaffaqiyatsiz bo'lsa — kuzatish to'xtaydi va
        // sabab ekranda ko'rinadi.
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          if (!cancelled) setStatusError(errorText(err));
          return;
        }
      }
      if (!cancelled) pollTimer.current = window.setTimeout(tick, POLL_MS);
    };
    pollTimer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [activeRunId, token, toast, loadStatus, loadRuns, pollNonce]);

  /** "Qayta urinish": holatni qayta o'qish va (agar u to'xtagan bo'lsa)
   *  jarayon kuzatuvini qaytadan boshlash. */
  const retryStatus = useCallback(() => {
    setPollNonce((n) => n + 1);
    void loadStatus();
  }, [loadStatus]);

  const test = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await integrationsApi.hemisTest(token));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setTesting(false);
    }
  }, [token, toast]);

  const sync = useCallback(async () => {
    setStarting(true);
    try {
      const { runId } = await integrationsApi.hemisSync(token);
      setActiveRun(await integrationsApi.run(runId, token));
      toast.info('HEMIS sinxronlash boshlandi');
      void loadRuns();
    } catch (err) {
      toast.error(errorText(err));
      if (err instanceof ApiError && err.status === 409) void loadStatus();
    } finally {
      setStarting(false);
    }
  }, [token, toast, loadRuns, loadStatus]);

  const running = activeRun?.status === 'ishlamoqda' ? activeRun : null;

  return {
    status,
    statusError,
    loadStatus,
    retryStatus,
    runs,
    runsError,
    runsLoading,
    runsPage,
    setRunsPage,
    loadRuns,
    running,
    percent: progressPercent(running?.stats?.progress),
    testing,
    testResult,
    clearTestResult: () => setTestResult(null),
    test,
    starting,
    sync,
  };
}

export type HemisSync = ReturnType<typeof useHemisSync>;
