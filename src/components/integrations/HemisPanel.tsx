import { useState } from 'react';
import { PlugZap, RefreshCw } from 'lucide-react';
import {
  Button,
  CodeText,
  DataTable,
  Drawer,
  ErrorState,
  IntelPanel,
  KeyValue,
  MicroLabel,
  ProgressBar,
  Section,
  SkeletonCard,
  StatusLamp,
  formatNumber,
  type DataTableColumn,
  type IntelStatus,
} from '../../ui';
import { Notice, pagerFooter } from '../settings/kit';
import {
  RUN_STATUS_META,
  formatDateTime,
  formatDuration,
  statsRows,
  statsSummary,
  type SyncRun,
  type SyncRunStatus,
} from '../../lib/integrationsApi';
import type { HemisSync } from './useHemisSync';

const ENTITY_TEST_LABELS: Record<string, string> = {
  students: 'Talabalar',
  employees: 'Xodimlar',
  groups: 'Guruhlar',
  departments: "Bo'linmalar",
};

/** Sinxronlash holati — chiroq + SO'Z (rang yolg'iz ma'no tashimaydi). */
const RUN_LAMP: Record<SyncRunStatus, IntelStatus> = {
  ishlamoqda: 'warn',
  muvaffaqiyatli: 'ok',
  xato: 'alert',
};

function RunStatusLamp({ status }: { status: SyncRunStatus }) {
  return <StatusLamp status={RUN_LAMP[status] ?? 'idle'} label={RUN_STATUS_META[status].label} pulse={status === 'ishlamoqda'} />;
}

/** Sahifa sarlavhasidagi HEMIS tugmalari (o'ng yuqorida). */
/** Nofaol tugma sababi — sichqoncha ustiga kelganda ko'rinadi. Tugma
 *  o'zi `pointer-events` ni yutadi, shuning uchun izoh o'ram span'da. */
const NOT_CONFIGURED_HINT = 'HEMIS sozlanmagan: serverda HEMIS_BASE_URL va HEMIS_API_TOKEN kiritilishi kerak';

export function HemisActions({ hemis }: { hemis: HemisSync }) {
  const configured = Boolean(hemis.status?.configured);
  const hint = configured ? undefined : NOT_CONFIGURED_HINT;
  return (
    <>
      <span title={hint}>
        <Button icon={PlugZap} loading={hemis.testing} disabled={!configured} onClick={() => void hemis.test()}>
          Ulanishni tekshirish
        </Button>
      </span>
      <span title={hint}>
        <Button
          variant="primary"
          icon={RefreshCw}
          loading={hemis.starting || Boolean(hemis.running)}
          disabled={!configured}
          onClick={() => void hemis.sync()}
        >
          Hozir sinxronlash
        </Button>
      </span>
    </>
  );
}

const RUN_COLUMNS: DataTableColumn<SyncRun>[] = [
  {
    key: 'startedAt',
    header: 'Boshlandi',
    cell: (r) => <CodeText className="whitespace-nowrap text-[12px]">{formatDateTime(r.startedAt)}</CodeText>,
  },
  {
    key: 'status',
    header: 'Holat',
    cell: (r) => <RunStatusLamp status={r.status} />,
  },
  {
    key: 'duration',
    header: 'Davomiyligi',
    cell: (r) => <CodeText className="whitespace-nowrap text-[12px] text-muted">{formatDuration(r.durationSeconds)}</CodeText>,
  },
  { key: 'triggeredBy', header: 'Kim', hideOnMobile: true, cell: (r) => <span className="text-[13px] text-muted">{r.triggeredBy}</span> },
  {
    key: 'result',
    header: 'Natija',
    cell: (r) =>
      r.status === 'xato' && r.error ? (
        <span className="line-clamp-2 text-[13px] text-danger">{r.error}</span>
      ) : (
        <span className="text-[13px] text-muted">{statsSummary(r.stats)}</span>
      ),
  },
];

const NUM_COLUMNS = [
  { key: 'fetched', label: 'Olindi', className: '' },
  { key: 'created', label: 'Yangi', className: 'text-success' },
  { key: 'updated', label: 'Yangilandi', className: 'text-info' },
  { key: 'unchanged', label: "O'zgarmadi", className: '' },
  { key: 'deactivated', label: 'Faolsizlantirildi', className: 'text-warning' },
  { key: 'skipped', label: "O'tkazildi", className: '' },
  { key: 'errors', label: 'Xato', className: 'text-danger' },
] as const;

function RunDetails({ run }: { run: SyncRun }) {
  const rows = statsRows(run.stats);
  return (
    <div className="flex flex-col gap-5">
      <KeyValue
        items={[
          { label: 'Holat', value: <RunStatusLamp status={run.status} /> },
          { label: 'Boshlandi', value: <CodeText>{formatDateTime(run.startedAt)}</CodeText> },
          { label: 'Tugadi', value: <CodeText>{formatDateTime(run.finishedAt)}</CodeText> },
          { label: 'Davomiyligi', value: <CodeText>{formatDuration(run.durationSeconds)}</CodeText> },
          { label: 'Kim ishga tushirdi', value: run.triggeredBy },
        ]}
      />
      {run.status === 'xato' && run.error && <Notice tone="danger" title="Xato">{run.error}</Notice>}
      <Section title="Bo'limlar bo'yicha">
        {rows.length > 0 ? (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-left">
                    <MicroLabel>Bo&apos;lim</MicroLabel>
                  </th>
                  {NUM_COLUMNS.map((c) => (
                    <th key={c.key} scope="col" className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-right">
                      <MicroLabel>{c.label}</MicroLabel>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="intel-code">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="border-b border-border px-2.5 py-1.5 font-sans text-[13px] font-medium text-fg">{row.label}</td>
                    {NUM_COLUMNS.map((c) => (
                      <td key={c.key} className={`border-b border-border px-2.5 py-1.5 text-right ${row[c.key] ? c.className || 'text-fg' : 'text-subtle'}`}>
                        {formatNumber(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Statistika yo'q.</p>
        )}
      </Section>
      {run.stats?.messages && run.stats.messages.length > 0 && (
        <Section title="Izohlar" description="O'tkazilgan yozuvlar sababi">
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto border border-border bg-surface-2 py-2 pl-7 pr-3 text-[13px] text-fg">
            {run.stats.messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** HEMIS ulanishi holati, sinov natijasi, jarayon va sinxronlash tarixi. */
export default function HemisPanel({ hemis, reference }: { hemis: HemisSync; reference?: string }) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const { status, statusError, running, percent, testResult, runs } = hemis;
  const openRun = runs?.items.find((r) => r.id === openRunId) ?? null;

  let connection;
  if (statusError && !status) {
    connection = (
      <IntelPanel title="HEMIS ulanishi" code={reference}>
        <ErrorState variant="block" message={statusError} onRetry={hemis.retryStatus} />
      </IntelPanel>
    );
  } else if (!status) {
    connection = <SkeletonCard lines={3} />;
  } else {
    connection = (
      <IntelPanel
        title="HEMIS ulanishi"
        code={reference}
        right={
          <StatusLamp
            status={running ? 'warn' : status.configured ? 'ok' : 'alert'}
            label={running ? 'Sinxronlanmoqda' : status.configured ? 'Sozlangan' : 'Sozlanmagan'}
            pulse={Boolean(running)}
          />
        }
        bodyClassName="px-3 py-3"
      >
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border pb-2">
          <MicroLabel>Manzil</MicroLabel>
          <CodeText className="break-all text-[12px] text-fg">{status.baseUrl ?? 'Manzil kiritilmagan'}</CodeText>
        </div>
        <KeyValue
          layout="stacked"
          columns={3}
          items={[
            {
              label: 'Avtomatik sinxronlash',
              value:
                status.syncIntervalHours > 0 ? (
                  <span>
                    Har <CodeText className="font-semibold">{status.syncIntervalHours}</CodeText> soatda
                  </span>
                ) : (
                  "O'chiq (faqat qo'lda)"
                ),
            },
            {
              label: "HEMIS'da yo'qlarni faolsizlantirish",
              value: <StatusLamp status={status.deactivateMissing ? 'ok' : 'idle'} label={status.deactivateMissing ? 'Yoqilgan' : "O'chiq"} />,
            },
            { label: 'Oxirgi muvaffaqiyatli sinxronlash', value: <CodeText>{formatDateTime(status.lastSuccessAt)}</CodeText> },
          ]}
        />

        {!status.configured && (
          <Notice tone="warning" className="mt-4" title="HEMIS sozlanmagan">
            Serverdagi <code className="intel-code">.env</code> faylida <code className="intel-code">HEMIS_BASE_URL</code> (masalan{' '}
            <code className="intel-code">https://student.universitet.uz/rest</code>) va <code className="intel-code">HEMIS_API_TOKEN</code>{' '}
            (HEMIS admin panelidagi API token) ni kiriting va xizmatni qayta ishga tushiring. Token xavfsizlik uchun faqat serverda
            saqlanadi.
          </Notice>
        )}

        {/* Holat bir marta yuklangandan KEYINGI xatolar (masalan,
            sinxronlash jarayonini kuzatish uzilib qolgani) ilgari hech
            qayerda ko'rinmasdi: `statusError` faqat `status` umuman
            yo'q bo'lganda chizilardi. Foydalanuvchi esa to'xtab qolgan
            progressga qarab o'tiraverardi. */}
        {statusError && (
          <Notice
            tone="danger"
            className="mt-4"
            title="Holatni yangilab bo'lmadi"
            action={
              <Button size="sm" variant="ghost" onClick={hemis.retryStatus}>
                Qayta urinish
              </Button>
            }
          >
            {statusError}
          </Notice>
        )}

        {testResult && (
          <Notice
            tone={testResult.ok ? 'success' : 'danger'}
            className="mt-4"
            title={testResult.ok ? 'Ulanish ishlayapti' : (testResult.error ?? "Ayrim ro'yxatlarni olib bo'lmadi")}
            action={
              <Button size="sm" variant="ghost" onClick={hemis.clearTestResult}>
                Yopish
              </Button>
            }
          >
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
              {Object.entries(testResult.entities).map(([key, entity]) => (
                <li key={key}>
                  {ENTITY_TEST_LABELS[key] ?? key}:{' '}
                  <CodeText className={entity.ok ? 'font-semibold' : 'font-semibold text-danger'}>
                    {entity.ok ? formatNumber(entity.total ?? 0) : (entity.error ?? 'xato')}
                  </CodeText>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {running && (
          <div className="mt-3 border border-border bg-surface-2 px-3 py-2.5" aria-live="polite">
            <div className="mb-2 flex justify-between gap-3">
              <MicroLabel>{running.stats?.progress?.stage ?? 'Boshlanmoqda'}</MicroLabel>
              {percent !== null && (
                <CodeText className="text-[12px] text-muted">
                  {formatNumber(running.stats?.progress?.done ?? 0)} / {formatNumber(running.stats?.progress?.total ?? 0)} · {percent}%
                </CodeText>
              )}
            </div>
            {percent !== null ? (
              <ProgressBar value={percent} tone="primary" size="md" ariaLabel="Sinxronlash jarayoni" />
            ) : (
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Sinxronlash jarayoni">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            )}
          </div>
        )}
      </IntelPanel>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {connection}

      <IntelPanel
        title="Sinxronlash tarixi"
        code={runs ? `${runs.total} ta` : undefined}
        right={<MicroLabel>Qatorni bosing — natija va izohlar</MicroLabel>}
      >
        <DataTable
          columns={RUN_COLUMNS}
          rows={runs?.items ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenRunId(r.id)}
          selectedKey={openRunId}
          rowTone={(r) => (r.status === 'xato' ? 'danger' : r.status === 'ishlamoqda' ? 'info' : null)}
          loading={hemis.runsLoading && !runs}
          loadingRows={4}
          error={runs ? null : hemis.runsError}
          onRetry={() => void hemis.loadRuns()}
          // HEMIS sozlanmagan bo'lsa (productionda hozir shunday) "Hozir
          // sinxronlash tugmasini bosing" deyish noto'g'ri — o'sha tugma
          // aynan shu sababdan NOFAOL turibdi.
          emptyTitle={status && !status.configured ? "Sinxronlash hali mumkin emas" : "Hali sinxronlash bo'lmagan"}
          emptyDescription={
            status && !status.configured
              ? "HEMIS ulanmagan: yuqoridagi ko'rsatma bo'yicha serverdagi .env fayliga HEMIS_BASE_URL va HEMIS_API_TOKEN ni kiriting. Shundan keyin “Hozir sinxronlash” tugmasi ishlaydi."
              : '“Hozir sinxronlash” tugmasini bosing.'
          }
          ariaLabel="Sinxronlash tarixi"
          maxHeight="none"
          dense
          footer={
            runs
              ? pagerFooter({ page: runs.page, totalPages: runs.totalPages, total: runs.total, pageSize: runs.pageSize, onChange: hemis.setRunsPage })
              : undefined
          }
        />
      </IntelPanel>

      <Drawer
        open={openRun !== null}
        onClose={() => setOpenRunId(null)}
        title="Sinxronlash natijasi"
        subtitle={openRun ? formatDateTime(openRun.startedAt) : undefined}
        size="lg"
      >
        {openRun && <RunDetails run={openRun} />}
      </Drawer>
    </div>
  );
}
