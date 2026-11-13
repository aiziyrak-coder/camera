/* HEMIS integratsiyasi: talaba/xodim ro'yxati, rasmlar va davomat shu yerdan keladi. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { Alert, Badge, Button, Dot, Meter, PageHead, Panel, Spinner, errorText, useToast } from '../kit';
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

  if (error && !status)
    return (
      <div className="p-6">
        <Alert>{error}</Alert>
      </div>
    );
  if (!status) return <Spinner />;

  const percent = progressPercent(running?.stats?.progress);
  const last = status.lastRun;

  return (
    <div>
      <PageHead
        title="HEMIS"
        text="Talaba va xodimlar ro‘yxati, HEMIS rasmlari va davomat shu yerdan olinadi"
        actions={
          status.configured && (
            <>
              <Button icon={PlugZap} loading={testing} onClick={runTest}>
                Ulanishni tekshirish
              </Button>
              <Button variant="primary" icon={RefreshCw} loading={starting} disabled={Boolean(running)} onClick={startSync}>
                Hozir yangilash
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-5 p-4 lg:p-6 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="card grid grid-cols-1 gap-px overflow-hidden bg-line sm:grid-cols-3 [&>*]:bg-white">
            <Info
              label="Holat"
              value={
                <span className="flex items-center gap-2">
                  <Dot tone={running ? 'warn' : status.configured && last?.status !== 'xato' ? 'ok' : 'bad'} pulse={Boolean(running)} />
                  {running ? 'Yangilanmoqda' : status.configured ? (last?.status === 'xato' ? 'Oxirgisi xato' : 'Ulangan') : 'Sozlanmagan'}
                </span>
              }
            />
            <Info label="Oxirgi muvaffaqiyatli" value={formatDateTime(status.lastSuccessAt)} />
            <Info label="Avtomatik yangilanish" value={`Har ${status.syncIntervalHours} soatda`} />
          </div>

          {running && (
            <div className="card p-4">
              <div className="flex justify-between text-[13px]">
                <span className="text-soft">{running.stats?.progress?.stage || 'Yangilanmoqda...'}</span>
                {percent !== null && <span className="tnum font-medium text-ink">{percent}%</span>}
              </div>
              <Meter value={(percent ?? 15) / 100} className="mt-2.5 h-1.5" />
            </div>
          )}

          {last?.status === 'xato' && last.error && !running && <Alert>{last.error}</Alert>}

          <Panel title="Yangilanishlar tarixi" bodyClassName="p-0">
            {runs.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-faint">Hali yangilanish bo‘lmagan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-[13px]">
                  <thead>
                    <tr className="[&>th]:h-9 [&>th]:border-b [&>th]:border-line [&>th]:px-4 [&>th]:text-[11.5px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-faint">
                      <th className="w-40">Boshlangan</th>
                      <th className="w-36">Holat</th>
                      <th>Natija</th>
                      <th className="w-24 text-right">Davomiyligi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="[&>td]:border-b [&>td]:border-line/70 [&>td]:px-4 [&>td]:py-3 last:[&>td]:border-b-0">
                        <td className="tnum text-ink">{formatDateTime(run.startedAt)}</td>
                        <td>
                          <RunBadge run={run} />
                        </td>
                        <td className="text-soft">{run.status === 'xato' ? run.error : statsSummary(run.stats)}</td>
                        <td className="tnum text-right text-faint">{formatDuration(run.durationSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Ulanish">
            <dl className="flex flex-col gap-3 text-[13px]">
              <div>
                <dt className="text-faint">Manzil</dt>
                <dd className="mt-0.5 break-all font-mono text-[12.5px] text-ink">{status.baseUrl || '—'}</dd>
              </div>
              <div>
                <dt className="text-faint">Oxirgi natija</dt>
                <dd className="mt-0.5 text-ink">{last ? statsSummary(last.stats) : '—'}</dd>
              </div>
            </dl>
          </Panel>

          {test && (
            <Panel title={<span className="flex items-center gap-2"><Dot tone={test.ok ? 'ok' : 'bad'} />{test.ok ? 'Ulanish ishlayapti' : 'Ulanishda muammo'}</span>} bodyClassName="p-0">
              {!test.ok && test.error && <p className="border-b border-line px-4 py-3 text-[13px] text-bad">{test.error}</p>}
              <ul className="divide-y divide-line">
                {Object.entries(test.entities).map(([key, e]) => (
                  <li key={key} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    {e.ok ? <CheckCircle2 size={15} className="text-ok" aria-hidden /> : <XCircle size={15} className="text-bad" aria-hidden />}
                    <span className="flex-1 text-ink">{ENTITY_LABELS[key] ?? key}</span>
                    <span className="tnum text-soft">{e.ok ? (e.total ?? '—') : e.error}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[12.5px] text-soft">{label}</p>
      <p className="mt-1.5 text-[14px] font-medium text-ink">{value}</p>
    </div>
  );
}

function RunBadge({ run }: { run: SyncRun }) {
  if (run.status === 'ishlamoqda') return <Badge tone="warn" pulse>Ishlamoqda</Badge>;
  if (run.status === 'xato') return <Badge tone="bad">Xato</Badge>;
  return <Badge tone="ok">Muvaffaqiyatli</Badge>;
}
