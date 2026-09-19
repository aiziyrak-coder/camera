import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, PlugZap, RefreshCw } from 'lucide-react';
import Badge from '../Badge';
import Pagination from '../Pagination';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useToast } from '../ui/Toast';
import { ApiError, type Page } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import {
  RUN_STATUS_META,
  formatDateTime,
  formatDuration,
  integrationsApi,
  progressPercent,
  statsRows,
  statsSummary,
  type HemisStatus,
  type HemisTestResult,
  type SyncRun,
} from '../../lib/integrationsApi';

const POLL_MS = 2000;
const ENTITY_TEST_LABELS: Record<string, string> = {
  students: 'Talabalar',
  employees: 'Xodimlar',
  groups: 'Guruhlar',
  departments: "Bo'linmalar",
};

function errorText(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : "So'rov bajarilmadi";
}

export default function HemisPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<HemisStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Page<SyncRun> | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [activeRun, setActiveRun] = useState<SyncRun | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<HemisTestResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
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
    try {
      setRuns(await integrationsApi.runs(runsPage, token));
    } catch {
      /* tarix yuklanmasa ham asosiy holat ko'rinaveradi */
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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await integrationsApi.hemisTest(token));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
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
  }

  if (statusError && !status) return <ErrorState message={statusError} onRetry={() => void loadStatus()} />;
  if (!status) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const running = activeRun?.status === 'ishlamoqda' ? activeRun : null;
  const percent = progressPercent(running?.stats?.progress);

  return (
    <div className="space-y-4">
      <section className="glass-deep p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">HEMIS ulanishi</h3>
              {status.configured ? <Badge tone="green">Sozlangan</Badge> : <Badge tone="amber">Sozlanmagan</Badge>}
            </div>
            <p className="break-all text-xs text-slate-500">{status.baseUrl ?? 'Manzil kiritilmagan'}</p>
            <p className="text-xs text-slate-500">
              Avtomatik sinxronlash:{' '}
              <span className="font-semibold text-slate-700">
                {status.syncIntervalHours > 0 ? `har ${status.syncIntervalHours} soatda` : "o'chiq (faqat qo'lda)"}
              </span>
              {' · '}HEMIS'da yo'qlarni faolsizlantirish:{' '}
              <span className="font-semibold text-slate-700">{status.deactivateMissing ? 'yoqilgan' : "o'chiq"}</span>
            </p>
            <p className="text-xs text-slate-500">
              Oxirgi muvaffaqiyatli sinxronlash:{' '}
              <span className="font-semibold text-slate-700">{formatDateTime(status.lastSuccessAt)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={!status.configured || testing}
              className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
              Ulanishni tekshirish
            </button>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={!status.configured || starting || Boolean(running)}
              className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting || running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Hozir sinxronlash
            </button>
          </div>
        </div>

        {!status.configured && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Serverdagi <code className="font-mono">.env</code> faylida <code className="font-mono">HEMIS_BASE_URL</code>{' '}
            (masalan <code className="font-mono">https://student.universitet.uz/rest</code>) va{' '}
            <code className="font-mono">HEMIS_API_TOKEN</code> (HEMIS admin panelidagi API token) ni kiriting va
            xizmatni qayta ishga tushiring. Token xavfsizlik uchun faqat serverda saqlanadi.
          </p>
        )}

        {testResult && (
          <div
            className={`mt-4 rounded-xl px-3 py-2.5 text-xs ${
              testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            }`}
          >
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {testResult.ok ? 'Ulanish ishlayapti' : testResult.error ?? 'Ayrim ro\'yxatlarni olib bo\'lmadi'}
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
              {Object.entries(testResult.entities).map(([key, entity]) => (
                <li key={key}>
                  {ENTITY_TEST_LABELS[key] ?? key}:{' '}
                  <span className="font-semibold">
                    {entity.ok ? (entity.total ?? 0).toLocaleString('ru-RU') : entity.error ?? 'xato'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {running && (
          <div className="mt-4 space-y-1.5" aria-live="polite">
            <div className="flex justify-between text-xs text-slate-600">
              <span>{running.stats?.progress?.stage ?? 'Boshlanmoqda'}</span>
              {percent !== null && (
                <span className="tabular-nums">
                  {running.stats?.progress?.done}/{running.stats?.progress?.total}
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
              <div
                className={`h-full rounded-full bg-indigo-500 transition-all ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <section className="glass-deep p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Sinxronlash tarixi</h3>
        {!runs || runs.items.length === 0 ? (
          <EmptyState compact title="Hali sinxronlash bo'lmagan" description="“Hozir sinxronlash” tugmasini bosing." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/70">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-8 px-3 py-3" />
                    <th className="px-3 py-3">Boshlandi</th>
                    <th className="px-3 py-3">Davomiyligi</th>
                    <th className="px-3 py-3">Kim</th>
                    <th className="px-3 py-3">Holat</th>
                    <th className="px-3 py-3">Natija</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.items.map((run) => {
                    const open = expanded === run.id;
                    const meta = RUN_STATUS_META[run.status];
                    return (
                      <RunRow key={run.id} run={run} open={open} tone={meta.tone} label={meta.label}
                        onToggle={() => setExpanded(open ? null : run.id)} />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={runs.page} totalPages={runs.totalPages} total={runs.total} pageSize={runs.pageSize}
              onChange={setRunsPage} />
          </>
        )}
      </section>
    </div>
  );
}

function RunRow({
  run,
  open,
  tone,
  label,
  onToggle,
}: {
  run: SyncRun;
  open: boolean;
  tone: 'green' | 'red' | 'amber' | 'slate' | 'indigo';
  label: string;
  onToggle: () => void;
}) {
  const rows = statsRows(run.stats);
  return (
    <>
      <tr className="cursor-pointer border-t border-white/60 hover:bg-white/40" onClick={onToggle}>
        <td className="px-3 py-2 text-slate-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTime(run.startedAt)}</td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{formatDuration(run.durationSeconds)}</td>
        <td className="px-3 py-2 text-slate-600">{run.triggeredBy}</td>
        <td className="px-3 py-2">
          <Badge tone={tone}>{label}</Badge>
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">
          {run.status === 'xato' && run.error ? (
            <span className="text-red-600">{run.error}</span>
          ) : (
            statsSummary(run.stats)
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-white/30">
          <td />
          <td colSpan={5} className="px-3 py-3">
            {rows.length > 0 ? (
              <table className="w-full max-w-3xl text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-semibold">Bo'lim</th>
                    <th className="py-1 pr-3 text-right font-semibold">Olindi</th>
                    <th className="py-1 pr-3 text-right font-semibold">Yangi</th>
                    <th className="py-1 pr-3 text-right font-semibold">Yangilandi</th>
                    <th className="py-1 pr-3 text-right font-semibold">O'zgarmadi</th>
                    <th className="py-1 pr-3 text-right font-semibold">Faolsizlantirildi</th>
                    <th className="py-1 pr-3 text-right font-semibold">O'tkazildi</th>
                    <th className="py-1 text-right font-semibold">Xato</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-white/60">
                      <td className="py-1 pr-3 font-semibold text-slate-700">{row.label}</td>
                      <td className="py-1 pr-3 text-right">{row.fetched}</td>
                      <td className="py-1 pr-3 text-right text-emerald-700">{row.created}</td>
                      <td className="py-1 pr-3 text-right text-indigo-700">{row.updated}</td>
                      <td className="py-1 pr-3 text-right">{row.unchanged}</td>
                      <td className="py-1 pr-3 text-right text-amber-700">{row.deactivated}</td>
                      <td className="py-1 pr-3 text-right">{row.skipped}</td>
                      <td className="py-1 text-right text-red-600">{row.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">Statistika yo'q.</p>
            )}
            {run.stats?.messages && run.stats.messages.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold text-slate-600">Izohlar (o'tkazilgan yozuvlar):</p>
                <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-slate-600">
                  {run.stats.messages.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
