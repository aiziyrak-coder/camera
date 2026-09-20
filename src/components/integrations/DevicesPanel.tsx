import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, KeyRound, Link2, Pencil, PlugZap, Plus, Trash2 } from 'lucide-react';
import {
  cn,
  focusRing,
  Button,
  CodeText,
  ConfirmDialog,
  DataTable,
  Drawer,
  IconButton,
  IntelPanel,
  KeyValue,
  MicroLabel,
  Readout,
  StatusLamp,
  formatNumber,
  useToast,
  type DataTableColumn,
  type IntelStatus,
} from '../../ui';
import { RAG_LABEL, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { RagChip } from '../hisobot/board';
import { Notice } from '../settings/kit';
import { useAuth } from '../../lib/auth';
import { isAbortError } from '../../lib/apiClient';
import { useVisibleInterval } from '../../lib/useVisibleInterval';
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

/** Qurilma holati — chiroq + SO'Z. Rang yolg'iz ma'no tashimaydi. */
const DEVICE_LAMP: Record<string, IntelStatus> = {
  onlayn: 'ok',
  oflayn: 'warn',
  xato: 'alert',
  kutilmoqda: 'idle',
  ochirilgan: 'idle',
};

function DeviceLamp({ status }: { status: AccessDevice['status'] }) {
  return <StatusLamp status={DEVICE_LAMP[status] ?? 'idle'} label={DEVICE_STATUS_META[status].label} pulse={status === 'kutilmoqda'} />;
}

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
  reference,
}: {
  onDevicesChange?: (devices: AccessDevice[]) => void;
  adding?: boolean;
  onAddingChange?: (value: boolean) => void;
  /** Sahifaning hujjat raqami — panel sarlavhasining o'ng chetida. */
  reference?: string;
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

  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const list = await integrationsApi.devices(token, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setDevices(list);
      setError(null);
      onDevicesChange?.(list);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Qurilmalarni yuklab bo'lmadi");
    }
  }, [token, onDevicesChange]);

  useEffect(() => {
    void load();
    return () => abort.current?.abort();
  }, [load]);

  // Holat (onlayn/oxirgi hodisa) fonda yangilanib turadi — lekin yorliq
  // ko'rinib turganda: yopilmagan yorliq har 15 soniyada so'rov yubormasin.
  useVisibleInterval(load, REFRESH_MS);

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
    if (!device.webhookPath) return;
    const url = webhookUrl(device.webhookPath);
    // Ilgari nusxalash muvaffaqiyatsiz bo'lsa (HTTP yoki brauzer ruxsati
    // yo'q) tugma bosilgani BILINMASDI ham — endi manzil xabar ichida
    // ko'rsatiladi, qo'lda ko'chirish mumkin.
    if (await copyText(url)) toast.info('Webhook manzili nusxalandi');
    else toast.error(`Nusxalab bo'lmadi — manzilni qo'lda ko'chiring: ${url}`);
  }

  const columns: DataTableColumn<AccessDevice>[] = [
    {
      key: 'name',
      header: 'Qurilma',
      sortValue: (d) => d.name,
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{d.name}</p>
          <p className="truncate text-[12px] leading-4 text-muted">
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
            <CodeText className="block text-[11px] text-muted">{deviceAddress(d)}</CodeText>
          ) : (
            d.webhookPath && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyWebhook(d);
                }}
                className={cn('intel-micro inline-flex items-center gap-1 !text-primary hover:underline', focusRing)}
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
      cell: (d) => <MicroLabel>{DIRECTION_LABELS[d.direction]}</MicroLabel>,
    },
    {
      key: 'status',
      header: 'Holat',
      sortValue: (d) => DEVICE_STATUS_META[d.status].label,
      cell: (d) => (
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <DeviceLamp status={d.status} />
          {d.lastError && (
            <p className="hidden max-w-[16rem] truncate text-[12px] text-danger md:block" title={d.lastError}>
              {d.lastError}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'lastEvent',
      header: 'Oxirgi hodisa',
      sortValue: (d) => d.lastEventAt,
      sortFirst: 'desc',
      cell: (d) => <CodeText className="whitespace-nowrap text-[12px] text-muted">{formatDateTime(d.lastEventAt, true)}</CodeText>,
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

  // Onlayn ULUSHI — "yaxshi/yomon" hukmini tashiydi, shuning uchun
  // svetofor bilan. Xom sonlar (jami, oflayn, xato) neytral qoladi:
  // 3 ta xato ko'p yoki kamligi qurilmalar soniga bog'liq.
  const onlineRate = counts.total > 0 ? (counts.online / counts.total) * 100 : null;
  const onlineTone = rag(onlineRate, RATE_RAG);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <IntelPanel
        title="Qurilmalar holati"
        code={reference}
        right={
          <span className="flex items-center gap-1.5">
            <RagChip tone={onlineTone} />
            <MicroLabel>{RAG_LABEL[onlineTone]}</MicroLabel>
          </span>
        }
        bodyClassName="grid grid-cols-2 gap-x-6 gap-y-3 px-3 py-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        <Readout label="Qurilmalar" value={loading ? '—' : formatNumber(counts.total)} title="Xom son — svetofor qo'yilmaydi" />
        <Readout label="Onlayn" value={loading ? '—' : formatNumber(counts.online)} />
        <Readout label="Oflayn / kutilmoqda" value={loading ? '—' : formatNumber(counts.offline)} />
        <Readout label="Xato" value={loading ? '—' : formatNumber(counts.error)} />
        <Readout
          label="Onlayn ulushi"
          value={
            <span className={`flex items-center gap-1.5 ${RAG_TEXT[onlineTone]}`}>
              {onlineRate === null ? '—' : `${Math.round(onlineRate)}%`}
              <RagChip tone={onlineTone} />
            </span>
          }
          title={`${counts.online} / ${counts.total} onlayn — ${RAG_LABEL[onlineTone]}`}
        />
      </IntelPanel>

      <IntelPanel
        title="Turniket qurilmalari"
        code={`${counts.total} ta`}
        right={
          onAddingChange ? (
            <MicroLabel>Hikvision — so&apos;rov; webhook/ZKTeco — o&apos;zi yuboradi</MicroLabel>
          ) : (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Qurilma qo&apos;shish
            </Button>
          )
        }
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
          dense
        />
      </IntelPanel>

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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pb-2">
              <DeviceLamp status={selected.status} />
              {!selected.enabled && <StatusLamp status="idle" label="O'chirilgan" />}
              {!selected.marksAttendance && <StatusLamp status="idle" label="Faqat jurnal" />}
            </div>
            {selected.lastError && <Notice tone="danger" title="Oxirgi xato">{selected.lastError}</Notice>}
            <KeyValue
              items={[
                { label: 'Turi', value: KIND_LABELS[selected.kind] },
                ...(selected.kind === 'hikvision'
                  ? [
                      { label: 'Manzil', value: <CodeText className="text-xs">{deviceAddress(selected) ?? '—'}</CodeText> },
                      { label: 'Login', value: selected.username ?? '—' },
                      { label: 'Parol', value: selected.hasPassword ? 'Saqlangan' : 'Kiritilmagan' },
                    ]
                  : [{ label: 'API kalit', value: selected.hasApiKey ? 'Berilgan' : "Yo'q" }]),
                { label: "Yo'nalish", value: <MicroLabel>{DIRECTION_LABELS[selected.direction]}</MicroLabel> },
                { label: 'Bino', value: selected.buildingName ?? "Ko'rsatilmagan" },
                {
                  label: 'Davomatga yoziladi',
                  value: (
                    <StatusLamp status={selected.marksAttendance ? 'ok' : 'idle'} label={selected.marksAttendance ? 'Ha' : "Yo'q (faqat jurnal)"} />
                  ),
                },
                { label: 'Oxirgi hodisa', value: <CodeText>{formatDateTime(selected.lastEventAt, true)}</CodeText> },
                ...(selected.kind === 'hikvision'
                  ? [{ label: "Oxirgi so'rov", value: <CodeText>{formatDateTime(selected.lastPollAt, true)}</CodeText> }]
                  : []),
                { label: "Qo'shilgan", value: <CodeText>{formatDateTime(selected.createdAt)}</CodeText> },
              ]}
            />
            {selected.webhookPath && (
              <div className="flex flex-col gap-1.5">
                <MicroLabel>Webhook manzili (POST)</MicroLabel>
                <div className="flex items-center gap-2">
                  <code className="intel-code min-w-0 flex-1 break-all border border-border bg-surface-2 px-3 py-2 text-xs text-fg">
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
