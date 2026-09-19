import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, DoorOpen, KeyRound, Link2, Pencil, PlugZap, Plus, Trash2, Wifi, WifiOff } from 'lucide-react';
import {
  cn,
  focusRing,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  IconButton,
  KeyValue,
  Section,
  StatTile,
  formatNumber,
  useToast,
  type DataTableColumn,
} from '../../ui';
import { Notice } from '../settings/kit';
import { useAuth } from '../../lib/auth';
import {
  DEVICE_STATUS_META,
  DIRECTION_LABELS,
  KIND_LABELS,
  formatDateTime,
  integrationsApi,
  webhookUrl,
  type AccessDevice,
} from '../../lib/integrationsApi';
import ApiKeyDialog from './ApiKeyDialog';
import { copyText } from './clipboard';
import DeviceModal from './DeviceModal';

const REFRESH_MS = 15000;

function deviceAddress(device: AccessDevice): string | null {
  if (device.kind !== 'hikvision' || !device.ip) return null;
  return `${device.ip}${device.port ? `:${device.port}` : ''}`;
}

/** Turniket qurilmalari: holat plitkalari, jadval, tafsilot paneli va
 *  qo'shish/tahrirlash/o'chirish/kalit almashtirish.
 *  `adding`/`onAddingChange` berilsa — "Qurilma qo'shish" sahifa sarlavhasida. */
export default function DevicesPanel({
  onDevicesChange,
  adding,
  onAddingChange,
}: {
  onDevicesChange?: (devices: AccessDevice[]) => void;
  adding?: boolean;
  onAddingChange?: (value: boolean) => void;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const [devices, setDevices] = useState<AccessDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalAdding, setInternalAdding] = useState(false);
  const [editing, setEditing] = useState<AccessDevice | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AccessDevice | null>(null);
  const [rotating, setRotating] = useState<AccessDevice | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState<{ name: string; apiKey: string; path: string } | null>(null);

  const isAdding = adding ?? internalAdding;
  const setAdding = useCallback(
    (value: boolean) => {
      if (onAddingChange) onAddingChange(value);
      else setInternalAdding(value);
    },
    [onAddingChange],
  );

  const load = useCallback(async () => {
    try {
      const list = await integrationsApi.devices(token);
      setDevices(list);
      setError(null);
      onDevicesChange?.(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qurilmalarni yuklab bo'lmadi");
    }
  }, [token, onDevicesChange]);

  useEffect(() => {
    void load();
    // Holat (onlayn/oxirgi hodisa) fonda yangilanib turadi.
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const selected = devices?.find((d) => d.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const list = devices ?? [];
    return {
      total: list.length,
      online: list.filter((d) => d.status === 'onlayn').length,
      offline: list.filter((d) => d.status === 'oflayn' || d.status === 'kutilmoqda').length,
      error: list.filter((d) => d.status === 'xato').length,
    };
  }, [devices]);

  function openEdit(device: AccessDevice) {
    setEditing(device);
  }

  function closeModal() {
    setEditing(null);
    setAdding(false);
  }

  async function handleSubmit(body: Record<string, unknown>) {
    if (editing) {
      await integrationsApi.updateDevice(editing.id, body, token);
      toast.success('Qurilma saqlandi');
    } else {
      const created = await integrationsApi.createDevice(body, token);
      toast.success("Qurilma qo'shildi");
      if (created.apiKey && created.webhookPath) {
        setShownKey({ name: created.name, apiKey: created.apiKey, path: created.webhookPath });
      }
    }
    closeModal();
    void load();
  }

  async function handleTest(device: AccessDevice) {
    setTestingId(device.id);
    try {
      const result = await integrationsApi.testDevice(device.id, token);
      if (result.ok) toast.success(`${device.name}: ${result.message}`);
      else toast.error(`${device.name}: ${result.message}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tekshirib bo'lmadi");
    } finally {
      setTestingId(null);
    }
  }

  async function copyWebhook(device: AccessDevice) {
    if (device.webhookPath && (await copyText(webhookUrl(device.webhookPath)))) toast.info('Webhook manzili nusxalandi');
  }

  const columns: DataTableColumn<AccessDevice>[] = [
    {
      key: 'name',
      header: 'Qurilma',
      sortValue: (d) => d.name,
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{d.name}</p>
          <p className="truncate text-xs text-muted">
            {d.buildingName ?? "Bino ko'rsatilmagan"}
            {!d.marksAttendance && ' · faqat jurnal'}
            {!d.enabled && " · o'chirilgan"}
          </p>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Turi / manzil',
      mobileLabel: 'Turi',
      sortValue: (d) => KIND_LABELS[d.kind],
      cell: (d) => (
        <div className="min-w-0">
          <p className="text-[13px] text-fg">{KIND_LABELS[d.kind]}</p>
          {deviceAddress(d) ? (
            <p className="font-mono text-xs text-muted">{deviceAddress(d)}</p>
          ) : (
            d.webhookPath && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyWebhook(d);
                }}
                className={cn('inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline', focusRing)}
              >
                <Link2 size={12} aria-hidden="true" /> Webhook manzili
              </button>
            )
          )}
        </div>
      ),
    },
    {
      key: 'direction',
      header: "Yo'nalish",
      hideOnMobile: true,
      sortValue: (d) => DIRECTION_LABELS[d.direction],
      cell: (d) => <span className="text-[13px]">{DIRECTION_LABELS[d.direction]}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      sortValue: (d) => DEVICE_STATUS_META[d.status].label,
      cell: (d) => {
        const meta = DEVICE_STATUS_META[d.status];
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
            {d.lastError && (
              <p className="hidden max-w-[16rem] truncate text-xs text-danger md:block" title={d.lastError}>
                {d.lastError}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'lastEvent',
      header: 'Oxirgi hodisa',
      sortValue: (d) => d.lastEventAt,
      sortFirst: 'desc',
      cell: (d) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{formatDateTime(d.lastEventAt, true)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      hideOnMobile: true,
      cell: (d) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
          <IconButton icon={PlugZap} label="Tekshirish" size="sm" loading={testingId === d.id} onClick={() => void handleTest(d)} />
          {d.kind !== 'hikvision' && <IconButton icon={KeyRound} label="Kalitni almashtirish" size="sm" onClick={() => setRotating(d)} />}
          <IconButton icon={Pencil} label="Tahrirlash" size="sm" onClick={() => openEdit(d)} />
          <IconButton icon={Trash2} label="O'chirish" size="sm" variant="danger" onClick={() => setDeleting(d)} />
        </div>
      ),
    },
  ];

  const loading = devices === null && !error;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Qurilmalar" value={formatNumber(counts.total)} icon={DoorOpen} tone="primary" loading={loading} />
        <StatTile label="Onlayn" value={formatNumber(counts.online)} icon={Wifi} tone="success" loading={loading} />
        <StatTile label="Oflayn / kutilmoqda" value={formatNumber(counts.offline)} icon={WifiOff} tone="warning" loading={loading} />
        <StatTile label="Xato" value={formatNumber(counts.error)} icon={AlertTriangle} tone={counts.error ? 'danger' : 'neutral'} loading={loading} />
      </div>

      <Section
        title="Turniket qurilmalari"
        description="Hikvision qurilmalari har bir necha soniyada so'raladi; webhook/ZKTeco qurilmalari hodisani o'zi yuboradi."
        actions={onAddingChange ? undefined : <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Qurilma qo'shish</Button>}
      >
        <DataTable
          columns={columns}
          rows={devices ?? []}
          rowKey={(d) => d.id}
          onRowClick={(d) => setSelectedId(d.id)}
          selectedKey={selectedId}
          rowTone={(d) => (d.status === 'xato' ? 'danger' : d.status === 'oflayn' ? 'warning' : null)}
          loading={loading}
          loadingRows={3}
          error={devices === null ? error : null}
          onRetry={() => void load()}
          emptyTitle="Qurilma qo'shilmagan"
          emptyDescription="Turniket yoki yuz terminalini qo'shing — o'tishlar davomatga avtomatik yoziladi."
          emptyAction={
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Qurilma qo'shish
            </Button>
          }
          ariaLabel="Turniket qurilmalari"
          maxHeight="none"
        />
      </Section>

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.name}
        subtitle={selected ? KIND_LABELS[selected.kind] : undefined}
        footer={
          selected && (
            <>
              <Button variant="danger" icon={Trash2} onClick={() => setDeleting(selected)} className="mr-auto">
                O'chirish
              </Button>
              {selected.kind !== 'hikvision' && (
                <Button icon={KeyRound} onClick={() => setRotating(selected)}>
                  Kalitni almashtirish
                </Button>
              )}
              <Button icon={PlugZap} loading={testingId === selected.id} onClick={() => void handleTest(selected)}>
                Tekshirish
              </Button>
              <Button variant="primary" icon={Pencil} onClick={() => openEdit(selected)}>
                Tahrirlash
              </Button>
            </>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={DEVICE_STATUS_META[selected.status].tone} dot size="md">
                {DEVICE_STATUS_META[selected.status].label}
              </Badge>
              {!selected.enabled && <Badge>O'chirilgan</Badge>}
              {!selected.marksAttendance && <Badge tone="info">Faqat jurnal</Badge>}
            </div>
            {selected.lastError && <Notice tone="danger" title="Oxirgi xato">{selected.lastError}</Notice>}
            <KeyValue
              items={[
                { label: 'Turi', value: KIND_LABELS[selected.kind] },
                ...(selected.kind === 'hikvision'
                  ? [
                      { label: 'Manzil', value: <span className="font-mono text-xs">{deviceAddress(selected) ?? '—'}</span> },
                      { label: 'Login', value: selected.username ?? '—' },
                      { label: 'Parol', value: selected.hasPassword ? 'Saqlangan' : 'Kiritilmagan' },
                    ]
                  : [{ label: 'API kalit', value: selected.hasApiKey ? 'Berilgan' : "Yo'q" }]),
                { label: "Yo'nalish", value: DIRECTION_LABELS[selected.direction] },
                { label: 'Bino', value: selected.buildingName ?? "Ko'rsatilmagan" },
                { label: 'Davomatga yoziladi', value: selected.marksAttendance ? 'Ha' : "Yo'q (faqat jurnal)" },
                { label: 'Oxirgi hodisa', value: <span className="tabular-nums">{formatDateTime(selected.lastEventAt, true)}</span> },
                ...(selected.kind === 'hikvision'
                  ? [{ label: "Oxirgi so'rov", value: <span className="tabular-nums">{formatDateTime(selected.lastPollAt, true)}</span> }]
                  : []),
                { label: "Qo'shilgan", value: <span className="tabular-nums">{formatDateTime(selected.createdAt)}</span> },
              ]}
            />
            {selected.webhookPath && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[13px] font-medium text-fg">Webhook manzili (POST)</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg">
                    {webhookUrl(selected.webhookPath)}
                  </code>
                  <IconButton icon={Copy} label="Webhook manzilini nusxalash" variant="secondary" onClick={() => void copyWebhook(selected)} />
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <DeviceModal open={isAdding || editing !== null} device={editing} onClose={closeModal} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={deleting !== null}
        title="Qurilmani o'chirish"
        message={`"${deleting?.name ?? ''}" o'chiriladi. Uning hodisalar jurnali va yozilgan davomat saqlanib qoladi.`}
        confirmLabel="O'chirish"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await integrationsApi.deleteDevice(deleting.id, token);
          if (selectedId === deleting.id) setSelectedId(null);
          setDeleting(null);
          toast.success("Qurilma o'chirildi");
          void load();
        }}
      />
      <ConfirmDialog
        open={rotating !== null}
        title="API kalitni almashtirish"
        message={`"${rotating?.name ?? ''}" uchun yangi kalit yaratiladi. Eski kalit darhol ishlamay qoladi — qurilma sozlamasini yangilash kerak bo'ladi.`}
        confirmLabel="Almashtirish"
        onCancel={() => setRotating(null)}
        onConfirm={async () => {
          if (!rotating) return;
          const result = await integrationsApi.rotateKey(rotating.id, token);
          setShownKey({ name: rotating.name, apiKey: result.apiKey, path: result.webhookPath });
          setRotating(null);
        }}
      />
      {shownKey && (
        <ApiKeyDialog open deviceName={shownKey.name} apiKey={shownKey.apiKey} webhookPath={shownKey.path} onClose={() => setShownKey(null)} />
      )}
    </div>
  );
}
