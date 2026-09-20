import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import {
  Button,
  CodeText,
  DataTable,
  FilterBar,
  Input,
  IntelPanel,
  MicroLabel,
  StatusLamp,
  cn,
  focusRing,
  type DataTableColumn,
  type FilterFieldEntry,
} from '../../ui';
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

  /** Sana oralig'i teskari bo'lib qolmasin.
   *
   *  `min`/`max` atributlari faqat KALENDARdan tanlashni cheklaydi —
   *  sanani klaviaturadan yozganda ular hech narsa qilmaydi. Natijada
   *  "01.09 dan 01.08 gacha" kabi oraliq serverga ketib, jadval doim
   *  bo'sh chiqardi va foydalanuvchi "hodisa yo'q" deb o'ylardi. Endi
   *  ikkinchi chegara birinchisiga tortiladi. */
  const setRange = (key: 'from' | 'to', value: string) => {
    const next = { ...filters, [key]: value };
    if (next.from && next.to && next.from > next.to) {
      if (key === 'from') next.to = value;
      else next.from = value;
    }
    onChange(next);
  };
  const fields: FilterFieldEntry[] = [
    { kind: 'search', value: filters.search, onChange: (v) => set('search', v), placeholder: 'Ism, karta yoki xodim raqami' },
    {
      kind: 'select',
      value: filters.deviceId,
      onChange: (v) => set('deviceId', v),
      placeholder: 'Barcha qurilmalar',
      ariaLabel: 'Qurilma',
      options: devices.map((d) => ({ value: d.id, label: d.name })),
    },
    { kind: 'select', value: filters.granted, onChange: (v) => set('granted', v), placeholder: 'Ruxsat: hammasi', ariaLabel: 'Natija', options: GRANTED_OPTIONS },
    { kind: 'select', value: filters.matched, onChange: (v) => set('matched', v), placeholder: 'Odam: hammasi', ariaLabel: 'Odam', options: MATCHED_OPTIONS },
    {
      kind: 'custom',
      active: Boolean(filters.from || filters.to),
      onClear: () => onChange({ ...filters, from: '', to: '' }),
      render: (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setRange('from', e.target.value)}
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
            onChange={(e) => setRange('to', e.target.value)}
            aria-label="Sanagacha"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
          />
        </div>
      ),
    },
  ];
  // Tozalash — bitta yozuvda (har maydon alohida `onChange` chaqirsa,
  // oxirgisi qolgan barchasini bosib ketardi: `filters` — bitta obyekt).
  return <FilterBar fields={fields} onReset={() => onChange(EMPTY_ACCESS_EVENT_FILTERS)} />;
}

function Direction({ value }: { value: string | null }) {
  if (value === 'kirish') {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <ArrowDownLeft size={12} aria-hidden="true" />
        <MicroLabel className="!text-success">Kirish</MicroLabel>
      </span>
    );
  }
  if (value === 'chiqish') {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <ArrowUpRight size={12} aria-hidden="true" />
        <MicroLabel className="!text-warning">Chiqish</MicroLabel>
      </span>
    );
  }
  return <span className="text-subtle">—</span>;
}

const COLUMNS: DataTableColumn<AccessEventItem>[] = [
  {
    key: 'time',
    header: 'Vaqt',
    cell: (e) => <CodeText className="whitespace-nowrap text-[12px]">{formatDateTime(e.occurredAt, true)}</CodeText>,
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
            className={cn('rounded-[2px] text-[13px] font-medium text-fg hover:text-primary hover:underline', focusRing)}
          >
            {e.personName}
          </Link>
          <p className="truncate text-[12px] leading-4 text-muted">
            {e.personType === 'xodim' ? 'Xodim' : 'Talaba'}
            {e.personUnit ? ` · ${e.personUnit}` : ''}
          </p>
        </div>
      ) : (
        <MicroLabel>Aniqlanmagan</MicroLabel>
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
      <CodeText className="text-[11px] text-muted">
        {e.cardNumber ?? '—'}
        {e.employeeNo && <span className="block">№ {e.employeeNo}</span>}
      </CodeText>
    ),
  },
  {
    key: 'granted',
    header: 'Natija',
    cell: (e) => <StatusLamp status={e.granted ? 'ok' : 'alert'} label={e.granted ? 'Ruxsat' : 'Rad etildi'} />,
  },
];

/** Turniket o'tishlari jurnali (server sahifalash). Filtrlar — `AccessEventsToolbar`. */
export default function AccessEventsPanel({
  filters,
  deviceCount = null,
  onAddDevice,
  reference,
}: {
  filters: AccessEventFilters;
  /** Qo'shilgan turniket qurilmalari soni; null — hali noma'lum. */
  deviceCount?: number | null;
  onAddDevice?: () => void;
  /** Sahifaning hujjat raqami — panel sarlavhasining o'ng chetida. */
  reference?: string;
}) {
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
  const filtered = Object.values(filters).some((v) => v.trim() !== '');
  // Qurilma qo'shilmagan bo'lsa jurnal bo'sh bo'lishi TABIIY — "Hodisa
  // topilmadi, qurilma ulanganini tekshiring" emas, aniq sabab aytiladi.
  const noDevices = deviceCount === 0 && !filtered;

  // Rad etilgan o'tishlar SONI neytral ko'rsatiladi: rad etish o'z-o'zidan
  // nosozlik emas (begona karta ham shu yerga tushadi), shuning uchun
  // bu songa svetofor qo'yilmaydi.
  const deniedOnPage = items.filter((e) => !e.granted).length;

  return (
    <IntelPanel
      title="Kirish jurnali"
      code={reference}
      right={
        <MicroLabel>
          {total.toLocaleString('ru-RU')} ta · shu sahifada rad etilgan: {deniedOnPage}
        </MicroLabel>
      }
    >
      <DataTable
      columns={COLUMNS}
      rows={items}
      rowKey={(e) => e.id}
      rowTone={(e) => (e.granted ? null : 'danger')}
      loading={loading && items.length === 0}
      error={error}
      onRetry={reload}
      emptyTitle={noDevices ? "Turniket qurilmasi qo'shilmagan" : 'Hodisa topilmadi'}
      emptyDescription={
        noDevices
          ? "Jurnal turniketlardan to'ladi. Avval «Turniketlar» bo'limida qurilma qo'shing va uni sinab ko'ring."
          : filtered
            ? "Filtrlarni o'zgartiring yoki tozalang."
            : "Qurilma ulanganini tekshiring — o'tishlar shu yerda ko'rinadi."
      }
      emptyAction={
        noDevices && onAddDevice ? (
          <Button variant="primary" icon={Plus} onClick={onAddDevice}>
            Qurilma qo&apos;shish
          </Button>
        ) : undefined
      }
      mobileTitleKey="person"
      ariaLabel="Kirish hodisalari jurnali"
      maxHeight="none"
      dense
      footer={pagerFooter({ page, totalPages, total, pageSize, onChange: setPage })}
      />
    </IntelPanel>
  );
}
