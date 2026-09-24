import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, PlugZap, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  Button,
  CodeText,
  ConfirmDialog,
  DataTable,
  DatePicker,
  FilterBar,
  IconButton,
  IntelPanel,
  MicroLabel,
  Page,
  Readout,
  StatusLamp,
  useToast,
  type DataTableColumn,
} from '../../ui';
import { pagerFooter } from '../../components/settings/kit';
import DeviceModal from '../../components/access/DeviceModal';
import ApiKeyDialog from '../../components/access/ApiKeyDialog';
import { usePageVisible } from '../../components/videowall/usePageVisible';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useServerPage } from '../../lib/useServerPage';
import { todayInTashkent } from '../../lib/uzDate';
import {
  DEVICE_STATUS_META,
  DIRECTION_LABELS,
  KIND_LABELS,
  integrationsApi,
  type AccessDevice,
  type AccessEventItem,
  type AccessSummary,
} from '../../lib/integrationsApi';
import {
  DEVICE_LAMP,
  PASS_DIRECTION_OPTIONS,
  deviceLastContact,
  isLiveDay,
  onlineSummary,
  passDirectionLabel,
  passPerson,
  passQuery,
  passResult,
  passTime,
  sortDevices,
  type PassFilters,
} from '../../lib/accessPage';

/** Jonli oqim: bugungi o'tishlar shu oraliqda yangilanadi (varaq ko'rinib
 * turganda). Hikvision'ni server ham shunga yaqin oraliqda so'raydi. */
const LIVE_REFRESH_MS = 15_000;

/** Turniketlar: qurilmalar holati va o'tishlar jurnali. Hamma amal
 * backenddagi manageIntegrations huquqi bilan (app/routers/access_control.py). */
export default function AccessPage() {
  const { token } = useAuth();
  const toast = useToast();
  const visible = usePageVisible();
  const today = todayInTashkent();

  const [devices, setDevices] = useState<AccessDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccessDevice | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<AccessDevice | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ name: string; apiKey: string; webhookPath: string } | null>(null);

  const [filters, setFilters] = useState<PassFilters>({ deviceId: '', direction: '', date: today });
  const [summary, setSummary] = useState<AccessSummary | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await integrationsApi.devices(token));
      setDevicesError(null);
    } catch (err) {
      setDevicesError(err instanceof ApiError ? err.message : "Qurilmalarni yuklab bo'lmadi");
    } finally {
      setDevicesLoading(false);
    }
  }, [token]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await integrationsApi.summary(filters.date, filters.deviceId || undefined, token));
    } catch {
      setSummary(null);
    }
  }, [filters.date, filters.deviceId, token]);

  const events = useServerPage<AccessEventItem>('/api/access/events', passQuery(filters), 25, { debounceMs: 0 });
  const { reload: reloadEvents, page: eventsPage } = events;

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const live = isLiveDay(filters.date, today) && visible;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      // Birinchi sahifada — yangi o'tishlar tepada paydo bo'ladi; orqa
      // sahifani varaqlayotgan operator ostidan ro'yxat siljimasin.
      if (eventsPage === 1) reloadEvents();
      void loadSummary();
      void loadDevices();
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, eventsPage, reloadEvents, loadSummary, loadDevices]);

  function refreshAll() {
    reloadEvents();
    void loadSummary();
    void loadDevices();
  }

  async function saveDevice(body: Record<string, unknown>) {
    if (editing) {
      const saved = await integrationsApi.updateDevice(editing.id, body, token);
      setDevices((list) => list.map((d) => (d.id === saved.id ? saved : d)));
      toast.success('Qurilma saqlandi');
    } else {
      const created = await integrationsApi.createDevice(body, token);
      setDevices((list) => [...list, created]);
      toast.success("Qurilma qo'shildi");
      if (created.apiKey && created.webhookPath) {
        setNewKey({ name: created.name, apiKey: created.apiKey, webhookPath: created.webhookPath });
      }
    }
    setModalOpen(false);
  }

  async function testDevice(device: AccessDevice) {
    setTestingId(device.id);
    try {
      const result = await integrationsApi.testDevice(device.id, token);
      if (result.ok) toast.success(result.message || 'Ulanish bor');
      else toast.error(result.message || "Ulanib bo'lmadi");
      void loadDevices();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tekshirib bo'lmadi");
    } finally {
      setTestingId(null);
    }
  }

  async function rotateKey(device: AccessDevice) {
    try {
      const result = await integrationsApi.rotateKey(device.id, token);
      setNewKey({ name: device.name, apiKey: result.apiKey, webhookPath: result.webhookPath });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Kalitni almashtirib bo'lmadi");
    }
  }

  async function deleteDevice() {
    if (!deleting) return;
    await integrationsApi.deleteDevice(deleting.id, token);
    setDevices((list) => list.filter((d) => d.id !== deleting.id));
    if (filters.deviceId === deleting.id) setFilters((f) => ({ ...f, deviceId: '' }));
    setDeleting(null);
    toast.success("Qurilma o'chirildi");
  }

  const sortedDevices = useMemo(() => sortDevices(devices), [devices]);
  const deviceOptions = useMemo(
    () => [...devices].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ value: d.id, label: d.name })),
    [devices],
  );

  const deviceColumns: DataTableColumn<AccessDevice>[] = [
    {
      key: 'name',
      header: 'Qurilma',
      cell: (d) => (
        <div className="min-w-0">
          <p className={`truncate text-[13px] font-medium ${d.enabled ? 'text-fg' : 'text-muted'}`}>{d.name}</p>
          <p className="truncate text-[12px] text-subtle">
            {KIND_LABELS[d.kind]}
            {d.ip ? ` · ${d.ip}` : ''}
            {d.buildingName ? ` · ${d.buildingName}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (d) => (
        <span title={d.lastError ?? undefined}>
          <StatusLamp status={DEVICE_LAMP[d.status]} label={DEVICE_STATUS_META[d.status].label} pulse={d.status === 'onlayn'} />
        </span>
      ),
    },
    { key: 'direction', header: "Yo'nalish", hideOnMobile: true, cell: (d) => <MicroLabel>{DIRECTION_LABELS[d.direction]}</MicroLabel> },
    {
      key: 'last',
      header: 'Oxirgi aloqa',
      cell: (d) => {
        const last = deviceLastContact(d);
        return (
          <span className="whitespace-nowrap text-[12px] text-muted">
            {last.label}: <CodeText className="text-[12px] text-fg">{last.value}</CodeText>
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      mobileLabel: 'Amallar',
      cell: (d) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
          {d.kind === 'hikvision' ? (
            <IconButton icon={PlugZap} label={`${d.name}: ulanishni tekshirish`} size="sm" disabled={testingId === d.id} onClick={() => void testDevice(d)} />
          ) : (
            <IconButton icon={KeyRound} label={`${d.name}: kalitni almashtirish`} size="sm" onClick={() => void rotateKey(d)} />
          )}
          <IconButton
            icon={Pencil}
            label={`${d.name}: tahrirlash`}
            size="sm"
            onClick={() => {
              setEditing(d);
              setModalOpen(true);
            }}
          />
          <IconButton icon={Trash2} label={`${d.name}: o'chirish`} size="sm" variant="danger" onClick={() => setDeleting(d)} />
        </div>
      ),
    },
  ];

  const eventColumns: DataTableColumn<AccessEventItem>[] = [
    { key: 'time', header: 'Vaqt', cell: (e) => <CodeText className="whitespace-nowrap text-[12px] text-fg">{passTime(e.occurredAt)}</CodeText> },
    {
      key: 'person',
      header: 'Shaxs',
      cell: (e) => {
        const person = passPerson(e);
        return (
          <div className="min-w-0">
            <p className={`truncate text-[13px] ${person.known ? 'font-medium text-fg' : 'text-muted'}`}>{person.label}</p>
            {e.personUnit && <p className="truncate text-[12px] text-subtle">{e.personUnit}</p>}
          </div>
        );
      },
    },
    { key: 'direction', header: "Yo'nalish", cell: (e) => <MicroLabel>{passDirectionLabel(e.direction)}</MicroLabel> },
    { key: 'device', header: 'Qurilma', hideOnMobile: true, cell: (e) => <span className="text-[13px] text-muted">{e.deviceName ?? '—'}</span> },
    {
      key: 'result',
      header: 'Natija',
      cell: (e) => {
        const result = passResult(e.granted);
        return <StatusLamp status={result.status} label={result.label} />;
      },
    },
  ];

  return (
    <Page
      title="Turniketlar"
      actions={
        <>
          <Button variant="ghost" icon={RefreshCw} onClick={refreshAll}>
            Yangilash
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Qurilma
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <IntelPanel title="Qurilmalar" right={<MicroLabel>{devicesLoading ? '—' : onlineSummary(devices)}</MicroLabel>}>
          <DataTable
            columns={deviceColumns}
            rows={sortedDevices}
            rowKey={(d) => d.id}
            rowTone={(d) => (d.status === 'xato' ? 'danger' : d.enabled ? null : 'neutral')}
            loading={devicesLoading && devices.length === 0}
            loadingRows={2}
            error={devicesError}
            onRetry={() => void loadDevices()}
            emptyTitle="Qurilma yo'q"
            ariaLabel="Turniket qurilmalari"
            maxHeight="none"
            dense
          />
        </IntelPanel>

        <FilterBar
          onReset={() => setFilters({ deviceId: '', direction: '', date: today })}
          end={live ? <StatusLamp status="ok" label="Jonli" pulse /> : undefined}
          fields={[
            {
              kind: 'custom',
              active: filters.date !== today,
              onClear: () => setFilters((f) => ({ ...f, date: today })),
              render: (
                <DatePicker
                  value={filters.date}
                  onChange={(date) => setFilters((f) => ({ ...f, date }))}
                  quick
                  stepper
                  ariaLabel="Sana"
                />
              ),
            },
            {
              kind: 'select',
              value: filters.deviceId,
              onChange: (deviceId: string) => setFilters((f) => ({ ...f, deviceId })),
              options: deviceOptions,
              placeholder: 'Barcha qurilmalar',
              ariaLabel: 'Qurilma',
            },
            {
              kind: 'select',
              value: filters.direction,
              onChange: (direction: string) => setFilters((f) => ({ ...f, direction: direction as PassFilters['direction'] })),
              options: PASS_DIRECTION_OPTIONS,
              placeholder: "Ikkala yo'nalish",
              ariaLabel: "Yo'nalish",
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-surface px-3 py-2">
          <Readout label="Kirish" value={summary ? String(summary.entries) : '—'} />
          <Readout label="Chiqish" value={summary ? String(summary.exits) : '—'} />
          <Readout label="Odamlar" value={summary ? String(summary.people) : '—'} />
          <Readout label="Rad etildi" value={summary ? String(summary.denied) : '—'} />
          <Readout label="Noma'lum" value={summary ? String(summary.unmatched) : '—'} />
        </div>

        <IntelPanel title="O'tishlar" right={<MicroLabel>{events.loading && events.items.length === 0 ? '—' : `${events.total} ta`}</MicroLabel>}>
          <DataTable
            columns={eventColumns}
            rows={events.items}
            rowKey={(e) => e.id}
            rowTone={(e) => (e.granted ? null : 'danger')}
            loading={events.loading && events.items.length === 0}
            error={events.error}
            onRetry={reloadEvents}
            emptyTitle="O'tish yo'q"
            mobileTitleKey="person"
            ariaLabel="O'tishlar jurnali"
            maxHeight="none"
            dense
            footer={pagerFooter({
              page: events.page,
              totalPages: events.totalPages,
              total: events.total,
              pageSize: events.pageSize,
              onChange: events.setPage,
            })}
          />
        </IntelPanel>
      </div>

      <DeviceModal open={modalOpen} device={editing} onClose={() => setModalOpen(false)} onSubmit={saveDevice} />
      <ApiKeyDialog
        open={newKey !== null}
        deviceName={newKey?.name ?? ''}
        apiKey={newKey?.apiKey ?? ''}
        webhookPath={newKey?.webhookPath ?? ''}
        onClose={() => setNewKey(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Qurilmani o'chirish"
        message={`"${deleting?.name ?? ''}" o'chiriladi. O'tishlar jurnali saqlanadi.`}
        confirmLabel="O'chirish"
        onCancel={() => setDeleting(null)}
        onConfirm={deleteDevice}
      />
    </Page>
  );
}
