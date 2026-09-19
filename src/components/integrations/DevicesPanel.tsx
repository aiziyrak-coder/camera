import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Link2, Loader2, Pencil, PlugZap, Plus, Trash2 } from 'lucide-react';
import Badge from '../Badge';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useToast } from '../ui/Toast';
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
import ApiKeyDialog, { copyText } from './ApiKeyDialog';
import DeviceModal from './DeviceModal';

const REFRESH_MS = 15000;

export default function DevicesPanel({ onDevicesChange }: { onDevicesChange?: (devices: AccessDevice[]) => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [devices, setDevices] = useState<AccessDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccessDevice | null>(null);
  const [deleting, setDeleting] = useState<AccessDevice | null>(null);
  const [rotating, setRotating] = useState<AccessDevice | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState<{ name: string; apiKey: string; path: string } | null>(null);

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
    setModalOpen(false);
    setEditing(null);
    void load();
  }

  async function handleTest(device: AccessDevice) {
    setTestingId(device.id);
    try {
      const result = await integrationsApi.testDevice(device.id, token);
      if (result.ok) toast.success(`${device.name}: ${result.message}`);
      else toast.error(`${device.name}: ${result.message}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Tekshirib bo\'lmadi');
    } finally {
      setTestingId(null);
    }
  }

  if (error && !devices) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <section className="glass-deep p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Turniket qurilmalari</h3>
          <p className="text-xs text-slate-500">
            Hikvision qurilmalari har bir necha soniyada so'raladi; webhook/ZKTeco qurilmalari hodisani o'zi yuboradi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700"
        >
          <Plus size={14} />
          Qurilma qo'shish
        </button>
      </div>

      {devices === null ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState compact title="Qurilma qo'shilmagan" description="Turniket yoki yuz terminalini qo'shing — o'tishlar davomatga avtomatik yoziladi." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Qurilma</th>
                <th className="px-3 py-3">Turi / manzil</th>
                <th className="px-3 py-3">Yo'nalish</th>
                <th className="px-3 py-3">Holat</th>
                <th className="px-3 py-3">Oxirgi hodisa</th>
                <th className="px-3 py-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const meta = DEVICE_STATUS_META[device.status];
                return (
                  <tr key={device.id} className="border-t border-white/60 align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{device.name}</p>
                      <p className="text-xs text-slate-500">
                        {device.buildingName ?? 'Bino ko\'rsatilmagan'}
                        {!device.marksAttendance && ' · faqat jurnal'}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">{KIND_LABELS[device.kind]}</p>
                      {device.kind === 'hikvision' ? (
                        <p className="font-mono">
                          {device.ip}
                          {device.port ? `:${device.port}` : ''}
                        </p>
                      ) : (
                        device.webhookPath && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (await copyText(webhookUrl(device.webhookPath!))) toast.info('Webhook manzili nusxalandi');
                            }}
                            className="flex items-center gap-1 text-indigo-600 hover:underline"
                          >
                            <Link2 size={12} /> Webhook manzili
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{DIRECTION_LABELS[device.direction]}</td>
                    <td className="px-3 py-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {device.lastError && (
                        <p className="mt-1 max-w-[16rem] text-xs text-red-600" title={device.lastError}>
                          {device.lastError}
                        </p>
                      )}
                      {device.kind === 'hikvision' && device.lastPollAt && (
                        <p className="mt-1 text-[11px] text-slate-400">So'rov: {formatDateTime(device.lastPollAt, true)}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                      {formatDateTime(device.lastEventAt, true)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconButton label="Tekshirish" onClick={() => void handleTest(device)} busy={testingId === device.id}>
                          <PlugZap size={14} />
                        </IconButton>
                        {device.kind !== 'hikvision' && (
                          <IconButton label="Kalitni almashtirish" onClick={() => setRotating(device)}>
                            <KeyRound size={14} />
                          </IconButton>
                        )}
                        <IconButton
                          label="Tahrirlash"
                          onClick={() => {
                            setEditing(device);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label="O'chirish" danger onClick={() => setDeleting(device)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DeviceModal
        open={modalOpen}
        device={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Qurilmani o'chirish"
        message={`"${deleting?.name ?? ''}" o'chiriladi. Uning hodisalar jurnali va yozilgan davomat saqlanib qoladi.`}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await integrationsApi.deleteDevice(deleting.id, token);
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
        <ApiKeyDialog
          open
          deviceName={shownKey.name}
          apiKey={shownKey.apiKey}
          webhookPath={shownKey.path}
          onClose={() => setShownKey(null)}
        />
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger = false,
  busy = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
        danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-white/80 hover:text-indigo-600'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}
