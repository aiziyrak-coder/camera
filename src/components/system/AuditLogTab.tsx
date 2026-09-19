import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { api, buildQuery, type Page } from '../../lib/apiClient';
import { exportRowsAsCsv } from '../../lib/csvExport';
import { useServerPage } from '../../lib/useServerPage';
import type { AuditLogEntry } from '../../types';
import { Badge, Button, DataTable, Select, StatTile, Toolbar, formatNumber, useToast, type DataTableColumn, type Tone } from '../../ui';
import { Pager } from './Pager';
import type { AuditStatus } from './systemTypes';

const STATUS: Record<AuditStatus, { label: string; tone: Tone }> = {
  muvaffaqiyatli: { label: 'Muvaffaqiyatli', tone: 'success' },
  xatolik: { label: 'Xatolik', tone: 'danger' },
  ogohlantirish: { label: 'Ogohlantirish', tone: 'warning' },
};

const MODULES = [
  'Autentifikatsiya',
  'Foydalanuvchilar',
  'Kameralar',
  'AI Modullari',
  'Talabalar',
  'Tashkilot',
  "Ta'lim",
  'Davomat',
  'Hisobotlar',
  'Bildirishnomalar',
  'Integratsiyalar',
  'Maxfiylik',
  'Tizim',
  'Xavfsizlik',
];

const PAGE_SIZE = 20;

const COLUMNS: DataTableColumn<AuditLogEntry>[] = [
  { key: 'timestamp', header: 'Vaqt', width: '11rem', cell: (row) => <span className="whitespace-nowrap font-mono text-xs text-muted">{row.timestamp}</span> },
  { key: 'user', header: 'Foydalanuvchi', cell: (row) => <span className="font-medium text-fg">{row.user}</span> },
  { key: 'action', header: 'Amal', cell: (row) => <span className="text-fg">{row.action}</span> },
  { key: 'module', header: 'Modul' },
  { key: 'status', header: 'Holat', cell: (row) => <Badge tone={STATUS[row.status]?.tone ?? 'neutral'} dot>{STATUS[row.status]?.label ?? row.status}</Badge> },
  { key: 'ip', header: 'IP manzil', hideOnMobile: true, cell: (row) => <span className="font-mono text-xs text-muted">{row.ip}</span> },
];

/** "Jurnal" tabi: kim, qachon, nima qildi (audit). */
export function AuditLogTab({ canExport }: { canExport: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<AuditStatus | ''>('');
  const [module, setModule] = useState('');
  const [counts, setCounts] = useState<Record<AuditStatus, number> | null>(null);
  const [exporting, setExporting] = useState(false);

  const { items, page, setPage, totalPages, total, loading, error, reload } = useServerPage<AuditLogEntry>(
    '/api/audit-log',
    { status: status || undefined, module: module || undefined },
    PAGE_SIZE,
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      (Object.keys(STATUS) as AuditStatus[]).map((s) =>
        api.get<Page<AuditLogEntry>>(`/api/audit-log${buildQuery({ status: s, module: module || undefined, pageSize: 1 })}`, undefined, { signal: controller.signal }),
      ),
    )
      .then(([ok, err, warn]) => setCounts({ muvaffaqiyatli: ok.total, xatolik: err.total, ogohlantirish: warn.total }))
      .catch(() => {
        /* hisoblagichlar ixtiyoriy — jadval o'z xatosini ko'rsatadi */
      });
    return () => controller.abort();
  }, [module]);

  async function handleExport() {
    setExporting(true);
    try {
      const all: AuditLogEntry[] = [];
      let current = 1;
      let pages = 1;
      do {
        const res = await api.get<Page<AuditLogEntry>>(
          `/api/audit-log${buildQuery({ status: status || undefined, module: module || undefined, page: current, pageSize: 500 })}`,
        );
        all.push(...res.items);
        pages = res.totalPages;
        current += 1;
      } while (current <= pages);
      exportRowsAsCsv(
        ['Vaqt', 'Foydalanuvchi', 'Amal', 'Modul', 'Holat', 'IP manzil'],
        all.map((l) => [l.timestamp, l.user, l.action, l.module, STATUS[l.status]?.label ?? l.status, l.ip]),
        `tizim-jurnali-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      toast.error("Jurnalni eksport qilib bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  const toggleStatus = (s: AuditStatus) => setStatus((cur) => (cur === s ? '' : s));
  const activeCount = (status ? 1 : 0) + (module ? 1 : 0);

  return (
    <>
      <section aria-label="Holatlar bo'yicha" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile label="Muvaffaqiyatli" icon={CheckCircle2} tone="success" value={formatNumber(counts?.muvaffaqiyatli)} loading={!counts} onClick={() => toggleStatus('muvaffaqiyatli')} className={status === 'muvaffaqiyatli' ? 'border-success' : undefined} />
        <StatTile label="Xatoliklar" icon={AlertCircle} tone="danger" value={formatNumber(counts?.xatolik)} loading={!counts} onClick={() => toggleStatus('xatolik')} className={status === 'xatolik' ? 'border-danger' : undefined} />
        <StatTile label="Ogohlantirishlar" icon={AlertTriangle} tone="warning" value={formatNumber(counts?.ogohlantirish)} loading={!counts} onClick={() => toggleStatus('ogohlantirish')} className={status === 'ogohlantirish' ? 'border-warning' : undefined} />
      </section>

      <Toolbar
        activeCount={activeCount}
        onReset={() => {
          setStatus('');
          setModule('');
        }}
        end={
          <Button
            variant="secondary"
            icon={Download}
            loading={exporting}
            disabled={!canExport}
            title={canExport ? undefined : "Eksport huquqi yo'q — Foydalanuvchilar bo'limida yoqish mumkin"}
            onClick={handleExport}
          >
            CSV
          </Button>
        }
      >
        <Select
          value={status}
          onChange={(v) => setStatus(v as AuditStatus | '')}
          placeholder="Barcha holatlar"
          ariaLabel="Holat"
          highlightActive
          options={(Object.keys(STATUS) as AuditStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))}
        />
        <Select value={module} onChange={setModule} placeholder="Barcha modullar" ariaLabel="Modul" highlightActive options={MODULES.map((m) => ({ value: m, label: m }))} />
      </Toolbar>

      <DataTable
        ariaLabel="Tizim jurnali"
        columns={COLUMNS}
        rows={items}
        rowKey={(row) => row.id}
        rowTone={(row) => (row.status === 'xatolik' ? 'danger' : row.status === 'ogohlantirish' ? 'warning' : null)}
        loading={loading && items.length === 0}
        error={error}
        onRetry={reload}
        manualSort
        dense
        emptyTitle="Yozuv topilmadi"
        emptyDescription={activeCount > 0 ? "Filtrlarni o'zgartirib ko'ring." : "Tizimda hali qayd etilgan amal yo'q."}
        footer={<Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}
      />
    </>
  );
}
