import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, DataTable, Drawer, KeyValue, SearchInput, Section, Select, Toolbar, type DataTableColumn, type Tone } from '../../ui';
import { Notice, pagerFooter } from '../settings/kit';
import { useServerPage } from '../../lib/useServerPage';
import {
  CHANNEL_LABELS,
  KIND_OPTIONS,
  STATUS_LABELS,
  formatLogTime,
  kindLabel,
  type NotificationLogEntry,
  type NotificationLogStatus,
} from '../../lib/notificationsApi';

const STATUS_TONE: Record<NotificationLogStatus, Tone> = {
  yuborildi: 'success',
  xato: 'danger',
  otkazildi: 'neutral',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as NotificationLogStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }));
const CHANNEL_OPTIONS = [
  { value: 'telegram', label: CHANNEL_LABELS.telegram },
  { value: 'sms', label: CHANNEL_LABELS.sms },
];
const KIND_FILTER_OPTIONS = [
  ...KIND_OPTIONS.map((k) => ({ value: k.value, label: k.label })),
  { value: 'parent_arrival', label: kindLabel('parent_arrival') },
  { value: 'parent_absence', label: kindLabel('parent_absence') },
];

export interface LogFilters {
  search: string;
  status: string;
  channel: string;
  kind: string;
}

const EMPTY_LOG_FILTERS: LogFilters = { search: '', status: '', channel: '', kind: '' };

function activeCount(filters: LogFilters): number {
  return Object.values(filters).filter((v) => v.trim() !== '').length;
}

/** Jurnal filtrlari — sahifaning `toolbar` joyida (Jurnal tabi). */
export function NotificationLogToolbar({
  filters,
  onChange,
  onRefresh,
}: {
  filters: LogFilters;
  onChange: (next: LogFilters) => void;
  onRefresh: () => void;
}) {
  const set = <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <Toolbar
      activeCount={activeCount(filters)}
      onReset={() => onChange(EMPTY_LOG_FILTERS)}
      end={
        <Button variant="ghost" icon={RefreshCw} onClick={onRefresh}>
          Yangilash
        </Button>
      }
    >
      <SearchInput value={filters.search} onChange={(v) => set('search', v)} placeholder="Qabul qiluvchi, matn yoki xato" ariaLabel="Jurnaldan qidirish" />
      <Select value={filters.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} placeholder="Barcha holatlar" ariaLabel="Holat" highlightActive />
      <Select value={filters.channel} onChange={(v) => set('channel', v)} options={CHANNEL_OPTIONS} placeholder="Barcha kanallar" ariaLabel="Kanal" highlightActive />
      <Select value={filters.kind} onChange={(v) => set('kind', v)} options={KIND_FILTER_OPTIONS} placeholder="Barcha turlar" ariaLabel="Turi" highlightActive />
    </Toolbar>
  );
}

const COLUMNS: DataTableColumn<NotificationLogEntry>[] = [
  {
    key: 'time',
    header: 'Vaqt',
    cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{formatLogTime(r.createdAt)}</span>,
  },
  { key: 'kind', header: 'Turi', cell: (r) => <span className="whitespace-nowrap text-[13px]">{kindLabel(r.kind)}</span> },
  { key: 'channel', header: 'Kanal', hideOnMobile: true, cell: (r) => <span className="text-[13px]">{CHANNEL_LABELS[r.channel] ?? r.channel}</span> },
  {
    key: 'recipient',
    header: 'Qabul qiluvchi',
    cell: (r) => <span className="whitespace-nowrap font-mono text-xs text-fg">{r.recipient}</span>,
  },
  {
    key: 'text',
    header: 'Xabar',
    hideOnMobile: true,
    width: '36%',
    cell: (r) => (
      <div className="min-w-0 max-w-md">
        <p className="line-clamp-2 whitespace-pre-line text-[13px] text-muted" title={r.text}>
          {r.text}
        </p>
        {r.error && <p className="mt-0.5 line-clamp-1 text-xs font-medium text-danger">{r.error}</p>}
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Holat',
    cell: (r) => (
      <Badge tone={STATUS_TONE[r.status]} dot>
        {STATUS_LABELS[r.status]}
      </Badge>
    ),
  },
];

/** Yetkazish jurnali — "nega xabar kelmadi?" savoliga javob. `refreshKey`
 *  o'zgarsa (masalan sinov xabari yuborilgach) qayta yuklanadi. Qatorni
 *  bosish — to'liq matn va xato panelda. */
export default function NotificationLogTable({ refreshKey, filters = EMPTY_LOG_FILTERS }: { refreshKey: number; filters?: LogFilters }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { items, page, setPage, totalPages, total, pageSize, loading, error, reload } = useServerPage<NotificationLogEntry>(
    '/api/notifications/log',
    {
      status: filters.status || undefined,
      channel: filters.channel || undefined,
      kind: filters.kind || undefined,
      search: filters.search || undefined,
    },
    20,
  );

  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey, reload]);

  const open = items.find((r) => r.id === openId) ?? null;
  const filtered = activeCount(filters) > 0;

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={items}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        selectedKey={openId}
        rowTone={(r) => (r.status === 'xato' ? 'danger' : null)}
        loading={loading && items.length === 0}
        error={error}
        onRetry={reload}
        emptyTitle={filtered ? 'Filtrlarga mos yozuv topilmadi' : 'Hali hech qanday xabar yuborilmagan'}
        emptyDescription={filtered ? "Filtrlarni o'zgartiring yoki tozalang." : 'Qoida ishlaganda yoki sinov xabari yuborilganda yozuvlar shu yerda ko\'rinadi.'}
        mobileTitleKey="recipient"
        ariaLabel="Yetkazish jurnali"
        maxHeight="none"
        footer={pagerFooter({ page, totalPages, total, pageSize, onChange: setPage })}
      />

      <Drawer open={open !== null} onClose={() => setOpenId(null)} title="Xabar tafsiloti" subtitle={open ? formatLogTime(open.createdAt) : undefined}>
        {open && (
          <div className="flex flex-col gap-5">
            <KeyValue
              items={[
                { label: 'Holat', value: <Badge tone={STATUS_TONE[open.status]} dot>{STATUS_LABELS[open.status]}</Badge> },
                { label: 'Turi', value: kindLabel(open.kind) },
                { label: 'Kanal', value: CHANNEL_LABELS[open.channel] ?? open.channel },
                { label: 'Qabul qiluvchi', value: <span className="font-mono text-xs">{open.recipient}</span> },
                { label: 'Vaqt', value: <span className="tabular-nums">{formatLogTime(open.createdAt)}</span> },
              ]}
            />
            {open.error && (
              <Notice tone="danger" title="Xato sababi">
                {open.error}
              </Notice>
            )}
            <Section title="Xabar matni">
              <p className="whitespace-pre-line break-words rounded-control border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-fg">{open.text}</p>
            </Section>
          </div>
        )}
      </Drawer>
    </>
  );
}
