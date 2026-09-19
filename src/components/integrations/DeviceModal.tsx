import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { SelectField, TextField } from '../FormField';
import { useBuildings } from '../../lib/useBuildings';
import {
  DIRECTION_LABELS,
  EMPTY_DEVICE_FORM,
  KIND_LABELS,
  buildDevicePayload,
  deviceToForm,
  validateDeviceForm,
  type AccessDevice,
  type DeviceDirection,
  type DeviceForm,
  type DeviceKind,
} from '../../lib/integrationsApi';

const KIND_HELP: Record<DeviceKind, string> = {
  hikvision:
    "Server qurilmadan hodisalarni o'zi so'rab oladi (ISAPI, HTTP Digest). Qurilma server bilan bir tarmoqda bo'lishi kerak.",
  zkteco:
    "Qurilma yoki oraliq dastur hodisalarni webhook manzilga yuboradi (JSON yoki ADMS ATTLOG matni). Saqlagandan keyin API kalit bir marta ko'rsatiladi.",
  webhook:
    "Istalgan tizim hodisalarni webhook manzilga JSON bilan yuboradi: {events: [{id, time, cardNo, employeeNo, direction, granted}]}.",
};

export default function DeviceModal({
  open,
  device,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null — yangi qurilma. */
  device: AccessDevice | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const isEdit = device !== null;
  const { buildings } = useBuildings();
  const [form, setForm] = useState<DeviceForm>(EMPTY_DEVICE_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof DeviceForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(device ? deviceToForm(device) : EMPTY_DEVICE_FORM);
    setErrors({});
    setSubmitError(null);
  }, [open, device]);

  function set<K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateDeviceForm(form, isEdit);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(buildDevicePayload(form, isEdit));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  const isHikvision = form.kind === 'hikvision';

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Qurilmani tahrirlash' : "Yangi qurilma qo'shish"} maxWidth="max-w-xl">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <TextField label="Nomi" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name}
          placeholder="Masalan: 1-bino asosiy kirish" maxLength={100} />
        <SelectField
          label="Turi"
          value={form.kind}
          disabled={isEdit}
          onChange={(e) => set('kind', e.target.value as DeviceKind)}
          options={(Object.keys(KIND_LABELS) as DeviceKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
        />
        <p className="-mt-1 text-xs text-slate-500">{KIND_HELP[form.kind]}</p>

        {isHikvision && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <TextField label="IP manzil" value={form.ip} onChange={(e) => set('ip', e.target.value)} error={errors.ip}
                  placeholder="192.168.1.50" />
              </div>
              <TextField label="Port" value={form.port} onChange={(e) => set('port', e.target.value)} error={errors.port}
                inputMode="numeric" placeholder="80" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Login" value={form.username} onChange={(e) => set('username', e.target.value)}
                error={errors.username} autoComplete="off" />
              <TextField
                label={isEdit ? 'Parol (o\'zgartirish uchun)' : 'Parol'}
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                error={errors.password}
                autoComplete="new-password"
                placeholder={isEdit && device?.hasPassword ? '•••••• (saqlangan)' : ''}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Yo'nalish"
            value={form.direction}
            onChange={(e) => set('direction', e.target.value as DeviceDirection)}
            options={(Object.keys(DIRECTION_LABELS) as DeviceDirection[]).map((d) => ({ value: d, label: DIRECTION_LABELS[d] }))}
          />
          <SelectField
            label="Bino"
            value={form.buildingId}
            onChange={(e) => set('buildingId', e.target.value)}
            placeholder="— Ko'rsatilmagan —"
            options={buildings.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <p className="-mt-1 text-xs text-slate-500">
          “Ikkalasi” — bitta qurilma kirish va chiqishni qayd etsa: kunning birinchi o'tishi kelish, keyingilari ketish
          hisoblanadi (hodisaning o'z yo'nalishi bo'lsa, u ustun).
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.marksAttendance} onChange={(e) => set('marksAttendance', e.target.checked)} />
          Davomatga yozilsin
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Yoqilgan
        </label>

        {submitError && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{submitError}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button type="submit" disabled={saving}
            className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700 disabled:opacity-60">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Saqlash
          </button>
        </div>
      </form>
    </Modal>
  );
}
