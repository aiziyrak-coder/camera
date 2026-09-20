import { useState } from 'react';
import { PlugZap, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Drawer,
  ErrorState,
  KeyValue,
  ProgressBar,
  Section,
  SkeletonCard,
  formatNumber,
  type DataTableColumn,
} from '../../ui';
import { Notice, pagerFooter } from '../settings/kit';
import {
  RUN_STATUS_META,
  formatDateTime,
  formatDuration,
  statsRows,
  statsSummary,
  type SyncRun,
} from '../../lib/integrationsApi';
import type { HemisSync } from './useHemisSync';

const ENTITY_TEST_LABELS: Record<string, string> = {
  students: 'Talabalar',
  employees: 'Xodimlar',
  groups: 'Guruhlar',
  departments: "Bo'linmalar",
};

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
    cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(r.startedAt)}</span>,
  },
  {
    key: 'status',
    header: 'Holat',
    cell: (r) => (
      <Badge tone={RUN_STATUS_META[r.status].tone} dot>
        {RUN_STATUS_META[r.status].label}
      </Badge>
    ),
  },
  {
    key: 'duration',
    header: 'Davomiyligi',
    cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{formatDuration(r.durationSeconds)}</span>,
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
  const meta = RUN_STATUS_META[run.status];
  return (
    <div className="flex flex-col gap-5">
      <KeyValue
        items={[
          { label: 'Holat', value: <Badge tone={meta.tone} dot>{meta.label}</Badge> },
          { label: 'Boshlandi', value: <span className="tabular-nums">{formatDateTime(run.startedAt)}</span> },
          { label: 'Tugadi', value: <span className="tabular-nums">{formatDateTime(run.finishedAt)}</span> },
          { label: 'Davomiyligi', value: formatDuration(run.durationSeconds) },
          { label: 'Kim ishga tushirdi', value: run.triggeredBy },
        ]}
      />
      {run.status === 'xato' && run.error && <Notice tone="danger" title="Xato">{run.error}</Notice>}
      <Section title="Bo'limlar bo'yicha">
        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted">
                    Bo'lim
                  </th>
                  {NUM_COLUMNS.map((c) => (
                    <th key={c.key} scope="col" className="border-b border-border bg-surface-2 px-3 py-2 text-right text-xs font-semibold text-muted">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="border-b border-border px-3 py-2 font-medium text-fg">{row.label}</td>
                    {NUM_COLUMNS.map((c) => (
                      <td key={c.key} className={`border-b border-border px-3 py-2 text-right ${row[c.key] ? c.className || 'text-fg' : 'text-subtle'}`}>
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
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto rounded-control border border-border bg-surface-2 py-2 pl-7 pr-3 text-[13px] text-fg">
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
export default function HemisPanel({ hemis }: { hemis: HemisSync }) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const { status, statusError, running, percent, testResult, runs } = hemis;
  const openRun = runs?.items.find((r) => r.id === openRunId) ?? null;

  let connection;
  if (statusError && !status) {
    connection = (
      <Card>
        <ErrorState variant="block" message={statusError} onRetry={() => void hemis.loadStatus()} />
      </Card>
    );
  } else if (!status) {
    connection = <SkeletonCard lines={3} />;
  } else {
    connection = (
      <Card>
        <CardHeader
          icon={PlugZap}
          title={
            <span className="flex flex-wrap items-center gap-2">
              HEMIS ulanishi
              {status.configured ? (
                <Badge tone="success" dot>
                  Sozlangan
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Sozlanmagan
                </Badge>
              )}
            </span>
          }
          subtitle={<span className="break-all font-mono text-xs">{status.baseUrl ?? 'Manzil kiritilmagan'}</span>}
        />
        <KeyValue
          layout="stacked"
          columns={3}
          items={[
            {
              label: 'Avtomatik sinxronlash',
              value: status.syncIntervalHours > 0 ? `Har ${status.syncIntervalHours} soatda` : "O'chiq (faqat qo'lda)",
            },
            { label: "HEMIS'da yo'qlarni faolsizlantirish", value: status.deactivateMissing ? 'Yoqilgan' : "O'chiq" },
            { label: 'Oxirgi muvaffaqiyatli sinxronlash', value: <span className="tabular-nums">{formatDateTime(status.lastSuccessAt)}</span> },
          ]}
        />

        {!status.configured && (
          <Notice tone="warning" className="mt-4" title="HEMIS sozlanmagan">
            Serverdagi <code className="font-mono">.env</code> faylida <code className="font-mono">HEMIS_BASE_URL</code> (masalan{' '}
            <code className="font-mono">https://student.universitet.uz/rest</code>) va <code className="font-mono">HEMIS_API_TOKEN</code>{' '}
            (HEMIS admin panelidagi API token) ni kiriting va xizmatni qayta ishga tushiring. Token xavfsizlik uchun faqat serverda
            saqlanadi.
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
                  <span className={entity.ok ? 'font-semibold tabular-nums' : 'font-semibold text-danger'}>
                    {entity.ok ? formatNumber(entity.total ?? 0) : (entity.error ?? 'xato')}
                  </span>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {running && (
          <div className="mt-4 rounded-control border border-border bg-surface-2 px-3 py-3" aria-live="polite">
            <div className="mb-2 flex justify-between gap-3 text-xs">
              <span className="font-medium text-fg">{running.stats?.progress?.stage ?? 'Boshlanmoqda'}</span>
              {percent !== null && (
                <span className="tabular-nums text-muted">
                  {formatNumber(running.stats?.progress?.done ?? 0)} / {formatNumber(running.stats?.progress?.total ?? 0)} · {percent}%
                </span>
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
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {connection}

      <Section title="Sinxronlash tarixi" description="Qatorni bosing — bo'limlar bo'yicha natija va izohlar.">
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
          footer={
            runs
              ? pagerFooter({ page: runs.page, totalPages: runs.totalPages, total: runs.total, pageSize: runs.pageSize, onChange: hemis.setRunsPage })
              : undefined
          }
        />
      </Section>

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
