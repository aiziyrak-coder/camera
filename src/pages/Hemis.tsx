/* HEMIS integratsiyasi: talaba/xodim ro'yxati, rasmlar va davomat shu yerdan keladi. */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  formatDateTime,
  formatDuration,
  integrationsApi,
  progressPercent,
  statsRows,
  type HemisStatus,
  type HemisTestResult,
  type SyncRun,
} from '../lib/integrationsApi';
import { Alert, Badge, Button, PageHead, Spinner, errorText, useToast } from '../kit';
import type { SyncStats } from '../lib/integrationsApi';

/** "Talabalar: 3 ta yangi, 41 ta o'zgardi" — belgilarsiz, oddiy so'z bilan. */
function statsSummary(stats: SyncStats | null | undefined): string {
  const parts = statsRows(stats)
    .filter((r) => r.created || r.updated || r.deactivated || r.errors)
    .map((r) => {
      const bits = [
        r.created ? `${r.created} ta yangi` : null,
        r.updated ? `${r.updated} ta o‘zgardi` : null,
        r.deactivated ? `${r.deactivated} ta chiqarildi` : null,
        r.errors ? `${r.errors} ta xato` : null,
      ].filter(Boolean);
      return `${r.label}: ${bits.join(', ')}`;
    });
  return parts.length ? parts.join(' · ') : 'O‘zgarish yo‘q';
}

const ENTITY_LABELS: Record<string, string> = {
  students: 'Talabalar',
  employees: 'Xodimlar',
  groups: 'Guruhlar',
  faculties: 'Fakultetlar',
  departments: 'Kafedralar',
  schedule: 'Dars jadvali',
};

export default function HemisPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<HemisStatus | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<HemisTestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([integrationsApi.hemisStatus(token), integrationsApi.runs(1, token)]);
      setStatus(s);
      setRuns(r.items);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Yangilanish ketayotgan paytda holatni har 3 soniyada so'raymiz.
  const running = status?.running;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  async function startSync() {
    setStarting(true);
    try {
      await integrationsApi.hemisSync(token);
      toast('Yangilash boshlandi');
      await load();
    } catch (err) {
      toast(errorText(err), 'bad');
    } finally {
      setStarting(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await integrationsApi.hemisTest(token));
    } catch (err) {
      toast(errorText(err), 'bad');
    } finally {
      setTesting(false);
    }
  }

  if (error && !status) return <Alert>{error}</Alert>;
  if (!status) return <Spinner />;

  const percent = progressPercent(running?.stats?.progress);
  const last = status.lastRun;

  return (
    <div className="max-w-3xl">
      <PageHead title="HEMIS" text="Talaba va xodimlar ro‘yxati, HEMIS rasmlari va davomat shu yerdan olinadi" />

      <div className="card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${status.configured ? 'bg-ok-tint text-ok' : 'bg-bad-tint text-bad'}`}>
            <PlugZap size={24} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[18px] font-semibold text-ink">{status.configured ? 'HEMIS ulangan' : 'HEMIS sozlanmagan'}</p>
              {running ? <Badge tone="brand">Yangilanmoqda</Badge> : last?.status === 'xato' ? <Badge tone="bad">Oxirgisi xato</Badge> : null}
            </div>
            {status.baseUrl && <p className="mt-0.5 break-all text-[14px] text-soft">{status.baseUrl}</p>}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Info label="Oxirgi muvaffaqiyatli" value={formatDateTime(status.lastSuccessAt)} />
          <Info label="Avtomatik yangilanish" value={`Har ${status.syncIntervalHours} soatda`} />
          <Info label="Oxirgi natija" value={last ? statsSummary(last.stats) : '—'} />
        </dl>

        {running && (
          <div className="mt-6 rounded-xl bg-page p-4">
            <div className="flex justify-between text-[14px]">
              <span className="text-soft">{running.stats?.progress?.stage || 'Yangilanmoqda...'}</span>
              {percent !== null && <span className="font-medium text-ink">{percent}%</span>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/[0.07]">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent ?? 15}%` }} />
            </div>
          </div>
        )}

        {last?.status === 'xato' && last.error && !running && <Alert className="mt-5">{last.error}</Alert>}

        {status.configured && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" icon={RefreshCw} loading={starting} disabled={Boolean(running)} onClick={startSync}>
              Hozir yangilash
            </Button>
            <Button loading={testing} onClick={runTest}>
              Ulanishni tekshirish
            </Button>
          </div>
        )}

        {test && (
          <div className="mt-5 rounded-xl border border-line">
            <p className={`border-b border-line px-4 py-3 text-[15px] font-medium ${test.ok ? 'text-ok' : 'text-bad'}`}>
              {test.ok ? 'Ulanish ishlayapti' : test.error || 'Ulanishda muammo bor'}
            </p>
            <ul className="divide-y divide-line">
              {Object.entries(test.entities).map(([key, e]) => (
                <li key={key} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                  {e.ok ? <CheckCircle2 size={17} className="text-ok" aria-hidden /> : <XCircle size={17} className="text-bad" aria-hidden />}
                  <span className="flex-1 text-ink">{ENTITY_LABELS[key] ?? key}</span>
                  <span className="text-soft">{e.ok ? (e.total ?? '—') : e.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-10 text-[18px] font-semibold text-ink">Yangilanishlar tarixi</h2>
      {runs.length === 0 ? (
        <p className="text-[14px] text-soft">Hali yangilanish bo‘lmagan.</p>
      ) : (
        <div className="card divide-y divide-line">
          {runs.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
              <span className="w-36 shrink-0 text-[14px] font-medium text-ink">{formatDateTime(run.startedAt)}</span>
              <RunBadge run={run} />
              <span className="min-w-0 flex-1 text-[14px] text-soft">{run.status === 'xato' ? run.error : statsSummary(run.stats)}</span>
              <span className="text-[13px] text-faint">{formatDuration(run.durationSeconds)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{value}</dd>
    </div>
  );
}

function RunBadge({ run }: { run: SyncRun }) {
  if (run.status === 'ishlamoqda') return <Badge tone="brand">Ishlamoqda</Badge>;
  if (run.status === 'xato') return <Badge tone="bad">Xato</Badge>;
  return <Badge tone="ok">Muvaffaqiyatli</Badge>;
}
