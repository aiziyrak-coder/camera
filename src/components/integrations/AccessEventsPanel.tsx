import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge, DataTable, Input, SearchInput, Select, Toolbar, cn, focusRing, type DataTableColumn } from '../../ui';
import { pagerFooter } from '../settings/kit';
import { useServerPage } from '../../lib/useServerPage';
import { formatDateTime, peopleSearchLink, type AccessDevice, type AccessEventItem } from '../../lib/integrationsApi';

export interface AccessEventFilters {
  search: string;
  deviceId: string;
  granted: string;
  matched: string;
  from: string;
  to: string;
}

const EMPTY_ACCESS_EVENT_FILTERS: AccessEventFilters = { search: '', deviceId: '', granted: '', matched: '', from: '', to: '' };

const GRANTED_OPTIONS = [
  { value: 'true', label: 'Ruxsat berilgan' },
  { value: 'false', label: 'Rad etilgan' },
];
const MATCHED_OPTIONS = [
  { value: 'true', label: 'Aniqlangan' },
  { value: 'false', label: 'Aniqlanmagan' },
];

function activeCount(filters: AccessEventFilters): number {
  return Object.values(filters).filter((value) => value.trim() !== '').length;
}

/** Kirish hodisalari filtrlari — sahifaning `toolbar` joyida. */
export function AccessEventsToolbar({
  filters,
  onChange,
  devices,
}: {
  filters: AccessEventFilters;
  onChange: (next: AccessEventFilters) => void;
  devices: AccessDevice[];
}) {
  const set = <K extends keyof AccessEventFilters>(key: K, value: AccessEventFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <Toolbar activeCount={activeCount(filters)} onReset={() => onChange(EMPTY_ACCESS_EVENT_FILTERS)}>
      <SearchInput value={filters.search} onChange={(v) => set('search', v)} placeholder="Ism, karta yoki xodim raqami" />
      <Select
        value={filters.deviceId}
        onChange={(v) => set('deviceId', v)}
        placeholder="Barcha qurilmalar"
        ariaLabel="Qurilma"
        highlightActive
        options={devices.map((d) => ({ value: d.id, label: d.name }))}
      />
      <Select value={filters.granted} onChange={(v) => set('granted', v)} placeholder="Ruxsat: hammasi" ariaLabel="Natija" highlightActive options={GRANTED_OPTIONS} />
      <Select value={filters.matched} onChange={(v) => set('matched', v)} placeholder="Odam: hammasi" ariaLabel="Odam" highlightActive options={MATCHED_OPTIONS} />
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => set('from', e.target.value)}
          aria-label="Sanadan"
          className="min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
        <span className="text-muted" aria-hidden="true">
          –
        </span>
        <Input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => set('to', e.target.value)}
          aria-label="Sanagacha"
          className="min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
      </div>
    </Toolbar>
  );
}

function Direction({ value }: { value: string | null }) {
  if (value === 'kirish') {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-success">
        <ArrowDownLeft size={13} aria-hidden="true" />
        Kirish
      </span>
    );
  }
  if (value === 'chiqish') {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-warning">
        <ArrowUpRight size={13} aria-hidden="true" />
        Chiqish
      </span>
    );
  }
  return <span className="text-subtle">—</span>;
}

const COLUMNS: DataTableColumn<AccessEventItem>[] = [
  {
    key: 'time',
    header: 'Vaqt',
    cell: (e) => <span className="whitespace-nowrap text-[13px] tabular-nums">{formatDateTime(e.occurredAt, true)}</span>,
  },
  {
    key: 'person',
    header: 'Odam',
    cell: (e) =>
      e.personName ? (
        <div className="min-w-0">
          <Link
            to={peopleSearchLink(e.personName)}
            onClick={(event) => event.stopPropagation()}
            className={cn('rounded font-medium text-fg hover:text-primary hover:underline', focusRing)}
          >
            {e.personName}
          </Link>
          <p className="truncate text-xs text-muted">
            {e.personType === 'xodim' ? 'Xodim' : 'Talaba'}
            {e.personUnit ? ` · ${e.personUnit}` : ''}
          </p>
        </div>
      ) : (
        <span className="text-[13px] text-muted">Aniqlanmagan</span>
      ),
  },
  {
    key: 'device',
    header: 'Qurilma',
    cell: (e) => <span className="text-[13px]">{e.deviceName ?? "O'chirilgan qurilma"}</span>,
  },
  { key: 'direction', header: "Yo'nalish", cell: (e) => <Direction value={e.direction} /> },
  {
    key: 'card',
    header: 'Karta / raqam',
    hideOnMobile: true,
    cell: (e) => (
      <span className="font-mono text-xs text-muted">
        {e.cardNumber ?? '—'}
        {e.employeeNo && <span className="block">№ {e.employeeNo}</span>}
      </span>
    ),
  },
  {
    key: 'granted',
    header: 'Natija',
    cell: (e) =>
      e.granted ? (
        <Badge tone="success" dot>
          Ruxsat
        </Badge>
      ) : (
        <Badge tone="danger" dot>
          Rad etildi
        </Badge>
      ),
  },
];

/** Turniket o'tishlari jurnali (server sahifalash). Filtrlar — `AccessEventsToolbar`. */
export default function AccessEventsPanel({ filters }: { filters: AccessEventFilters }) {
  const { items, page, setPage, totalPages, total, pageSize, loading, error, reload } = useServerPage<AccessEventItem>(
    '/api/access/events',
    {
      deviceId: filters.deviceId || undefined,
      granted: filters.granted || undefined,
      matched: filters.matched || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: filters.search.trim() || undefined,
    },
    25,
  );
  const filtered = activeCount(filters) > 0;

  return (
    <DataTable
      columns={COLUMNS}
      rows={items}
      rowKey={(e) => e.id}
      rowTone={(e) => (e.granted ? null : 'danger')}
      loading={loading && items.length === 0}
      error={error}
      onRetry={reload}
      emptyTitle="Hodisa topilmadi"
      emptyDescription={filtered ? "Filtrlarni o'zgartiring yoki tozalang." : "Qurilma ulanganini tekshiring — o'tishlar shu yerda ko'rinadi."}
      mobileTitleKey="person"
      ariaLabel="Kirish hodisalari jurnali"
      maxHeight="none"
      footer={pagerFooter({ page, totalPages, total, pageSize, onChange: setPage })}
    />
  );
}
