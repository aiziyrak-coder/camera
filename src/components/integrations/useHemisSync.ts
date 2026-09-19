import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../ui';
import { ApiError, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { integrationsApi, progressPercent, statsSummary, type HemisStatus, type HemisTestResult, type SyncRun } from '../../lib/integrationsApi';

const POLL_MS = 2000;

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
    const tick = async () => {
      try {
        const run = await integrationsApi.run(activeRunId, token);
        if (cancelled) return;
        setActiveRun(run);
        if (run.status !== 'ishlamoqda') {
          if (run.status === 'muvaffaqiyatli') toast.success(`HEMIS sinxronlandi. ${statsSummary(run.stats)}`);
          else toast.error(`HEMIS sinxronlash xato bilan tugadi: ${run.error ?? ''}`);
          void loadStatus();
          void loadRuns();
          return;
        }
      } catch {
        /* vaqtinchalik tarmoq xatosi — keyingi urinishda */
      }
      if (!cancelled) pollTimer.current = window.setTimeout(tick, POLL_MS);
    };
    pollTimer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [activeRunId, token, toast, loadStatus, loadRuns]);

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
