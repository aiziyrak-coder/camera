import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { api, buildQuery, type Page } from '../../lib/apiClient';
import { exportRowsAsCsv } from '../../lib/csvExport';
import { useServerPage } from '../../lib/useServerPage';
import type { AuditLogEntry } from '../../types';
import { Badge, Button, DataTable, FilterBar, StatTile, filterActiveCount, formatNumber, useToast, type DataTableColumn, type FilterFieldEntry, type Tone } from '../../ui';
import { Pager } from './Pager';
import { formatServerTime } from './parts';
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
const MAX_EXPORT_ROWS = 20_000;

const TILES: Array<{ id: AuditStatus; label: string; icon: typeof CheckCircle2; tone: Tone }> = [
  { id: 'muvaffaqiyatli', label: 'Muvaffaqiyatli', icon: CheckCircle2, tone: 'success' },
  { id: 'xatolik', label: 'Xatoliklar', icon: AlertCircle, tone: 'danger' },
  { id: 'ogohlantirish', label: 'Ogohlantirishlar', icon: AlertTriangle, tone: 'warning' },
];

const TILE_BORDER: Record<AuditStatus, string> = {
  muvaffaqiyatli: 'border-success',
  xatolik: 'border-danger',
  ogohlantirish: 'border-warning',
};

const COLUMNS: DataTableColumn<AuditLogEntry>[] = [
  { key: 'timestamp', header: 'Vaqt', width: '11rem', cell: (row) => <span className="whitespace-nowrap font-mono text-xs text-muted">{formatServerTime(row.timestamp, true) ?? '—'}</span> },
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
  // Hisoblagichlar so'rovi xato bersa `counts` null qolib, plitkalar cheksiz
  // "yuklanmoqda" skeletonida turardi. Endi urinish tugagani alohida belgilanadi.
  const [countsDone, setCountsDone] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { items, page, setPage, totalPages, total, loading, error, reload } = useServerPage<AuditLogEntry>(
    '/api/audit-log',
    { status: status || undefined, module: module || undefined },
    PAGE_SIZE,
  );

  useEffect(() => {
    const controller = new AbortController();
    setCountsDone(false);
    void (async () => {
      try {
        const [ok, err, warn] = await Promise.all(
          (Object.keys(STATUS) as AuditStatus[]).map((s) =>
            api.get<Page<AuditLogEntry>>(`/api/audit-log${buildQuery({ status: s, module: module || undefined, pageSize: 1 })}`, undefined, { signal: controller.signal }),
          ),
        );
        if (!controller.signal.aborted) setCounts({ muvaffaqiyatli: ok.total, xatolik: err.total, ogohlantirish: warn.total });
      } catch {
        /* hisoblagichlar ixtiyoriy — jadval o'z xatosini ko'rsatadi */
      } finally {
        // Urinish tugadi: muvaffaqiyatsiz bo'lsa ham plitkalar skeletondan chiqadi.
        if (!controller.signal.aborted) setCountsDone(true);
      }
    })();
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
      } while (current <= pages && all.length < MAX_EXPORT_ROWS);
      // Jurnal yuz minglab yozuvdan iborat bo'lishi mumkin — chegarasiz yig'ish
      // brauzerni muzlatardi. Kesilgani foydalanuvchidan yashirilmaydi.
      const truncated = all.length > MAX_EXPORT_ROWS || (current <= pages && all.length >= MAX_EXPORT_ROWS);
      if (all.length > MAX_EXPORT_ROWS) all.length = MAX_EXPORT_ROWS;
      // Bo'sh fayl yuklab berish — "ishladi" degan taassurot qoldirib,
      // amalda hech nima bermaydi. Sababi aytiladi.
      if (all.length === 0) {
        toast.info(
          activeCount > 0
            ? "Tanlangan filtrlarga mos yozuv yo'q — eksport qilinmadi"
            : "Jurnalda hali yozuv yo'q — eksport qilinmadi",
        );
        return;
      }
      exportRowsAsCsv(
        ['Vaqt', 'Foydalanuvchi', 'Amal', 'Modul', 'Holat', 'IP manzil'],
        all.map((l) => [l.timestamp, l.user, l.action, l.module, STATUS[l.status]?.label ?? l.status, l.ip]),
        `tizim-jurnali-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      if (truncated) toast.info(`Eksport ${formatNumber(MAX_EXPORT_ROWS)} ta yozuv bilan cheklandi — davrni filtrlab qayta yuklang`);
    } catch {
      toast.error("Jurnalni eksport qilib bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  const toggleStatus = (s: AuditStatus) => setStatus((cur) => (cur === s ? '' : s));
  const filterFields: FilterFieldEntry[] = [
    {
      kind: 'select',
      value: status,
      onChange: (v) => setStatus(v as AuditStatus | ''),
      placeholder: 'Barcha holatlar',
      ariaLabel: 'Holat',
      options: (Object.keys(STATUS) as AuditStatus[]).map((s) => ({ value: s, label: STATUS[s].label })),
    },
    {
      kind: 'select',
      value: module,
      onChange: setModule,
      placeholder: 'Barcha modullar',
      ariaLabel: 'Modul',
      options: MODULES.map((m) => ({ value: m, label: m })),
    },
  ];
  const activeCount = filterActiveCount(filterFields);

  return (
    <>
      <section aria-label="Holatlar bo'yicha" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {TILES.map((tile) => {
          const on = status === tile.id;
          return (
            <StatTile
              key={tile.id}
              // Tanlanganlik faqat ramka rangi bilan ko'rsatilardi — rangni
              // ajratolmaydigan foydalanuvchi filtr yoqiqligini bilmasdi.
              label={on ? `${tile.label} · filtr yoqilgan` : tile.label}
              icon={tile.icon}
              tone={tile.tone}
              value={formatNumber(counts?.[tile.id])}
              loading={!counts && !countsDone}
              hint={on ? 'Bekor qilish uchun bosing' : 'Faqat shu holatni ko’rish uchun bosing'}
              onClick={() => toggleStatus(tile.id)}
              className={on ? TILE_BORDER[tile.id] : undefined}
            />
          );
        })}
      </section>

      <FilterBar
        fields={filterFields}
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
      />

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
