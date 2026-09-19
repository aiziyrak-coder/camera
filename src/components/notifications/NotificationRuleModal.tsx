import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import Modal from '../Modal';
import { TextField, SelectField } from '../FormField';
import RecipientChipsInput from './RecipientChipsInput';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useAiModules } from '../../lib/useAiModules';
import { useBuildings } from '../../lib/useBuildings';
import {
  KIND_OPTIONS,
  SEVERITY_OPTIONS,
  notificationsApi,
  validateRecipient,
  type NotificationChannel,
  type NotificationKind,
  type NotificationRule,
  type NotificationRuleInput,
} from '../../lib/notificationsApi';
import type { EventSeverity } from '../../types';

interface FormState {
  name: string;
  enabled: boolean;
  channel: NotificationChannel;
  recipients: string[];
  kinds: NotificationKind[];
  moduleCodes: number[];
  buildingIds: string[];
  minSeverity: EventSeverity | '';
}

const EMPTY: FormState = {
  name: '',
  enabled: true,
  channel: 'telegram',
  recipients: [],
  kinds: ['event'],
  moduleCodes: [],
  buildingIds: [],
  minSeverity: '',
};

function toForm(rule: NotificationRule | null): FormState {
  if (!rule) return EMPTY;
  return {
    name: rule.name,
    enabled: rule.enabled,
    channel: rule.channel,
    recipients: rule.recipients,
    kinds: rule.kinds,
    moduleCodes: rule.moduleCodes ?? [],
    buildingIds: rule.buildingIds ?? [],
    minSeverity: rule.minSeverity ?? '',
  };
}

type Errors = Partial<Record<'name' | 'recipients' | 'kinds' | 'form', string>>;

/** Qoida yaratish/tahrirlash. `rule` = null — yangi qoida. */
export default function NotificationRuleModal({
  open,
  rule,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: NotificationRule | null;
  onClose: () => void;
  onSaved: (rule: NotificationRule) => void;
}) {
  const { token } = useAuth();
  const { modules } = useAiModules();
  const { buildings } = useBuildings();
  const [form, setForm] = useState<FormState>(toForm(rule));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toForm(rule));
      setErrors({});
    }
  }, [open, rule]);

  const sortedModules = useMemo(() => [...modules].sort((a, b) => a.code - b.code), [modules]);
  const eventKindsSelected = form.kinds.includes('event') || form.kinds.includes('event_overdue');
  const buildingFilterApplies = eventKindsSelected || form.kinds.some((k) => k === 'camera_offline' || k === 'camera_online');

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function changeChannel(channel: NotificationChannel) {
    // Boshqa kanal qoidasiga mos kelmaydigan qabul qiluvchilar olib tashlanadi.
    setForm((f) => ({
      ...f,
      channel,
      recipients: f.recipients.filter((r) => validateRecipient(channel, r)[1] === null),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {
      name: form.name.trim().length < 2 ? 'Qoida nomini kiriting' : undefined,
      recipients: form.recipients.length === 0 ? 'Kamida bitta qabul qiluvchi kiriting' : undefined,
      kinds: form.kinds.length === 0 ? 'Kamida bitta signal turini tanlang' : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const body: NotificationRuleInput = {
      name: form.name.trim(),
      enabled: form.enabled,
      channel: form.channel,
      recipients: form.recipients,
      kinds: form.kinds,
      moduleCodes: eventKindsSelected && form.moduleCodes.length ? form.moduleCodes : null,
      buildingIds: buildingFilterApplies && form.buildingIds.length ? form.buildingIds : null,
      minSeverity: eventKindsSelected && form.minSeverity ? form.minSeverity : null,
    };
    setSaving(true);
    try {
      const saved = rule
        ? await notificationsApi.updateRule(rule.id, body, token)
        : await notificationsApi.createRule(body, token);
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={rule ? 'Qoidani tahrirlash' : 'Yangi bildirishnoma qoidasi'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {errors.form && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{errors.form}</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <TextField
            label="Qoida nomi"
            placeholder="Masalan: Navbatchi operatorlar"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            maxLength={120}
          />
          <label className="flex items-center gap-2.5 self-end rounded-xl bg-white/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-slate-700">Yoqilgan</span>
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">Kanal</p>
          <div className="inline-flex rounded-xl bg-white/50 p-1" role="radiogroup" aria-label="Kanal">
            {(
              [
                { value: 'telegram', label: 'Telegram', icon: Send },
                { value: 'sms', label: 'SMS', icon: MessageSquare },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.channel === value}
                onClick={() => changeChannel(value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  form.channel === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <RecipientChipsInput
          channel={form.channel}
          value={form.recipients}
          onChange={(next) => set('recipients', next)}
          error={errors.recipients}
        />

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-600">Signal turlari</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {KIND_OPTIONS.map((kind) => (
              <label key={kind.value} className="flex items-start gap-2.5 rounded-xl bg-white/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.kinds.includes(kind.value)}
                  onChange={() => set('kinds', toggle(form.kinds, kind.value))}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-semibold text-slate-700">{kind.label}</span>
                  <span className="block text-[11px] text-slate-400">{kind.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.kinds && <p className="mt-1 text-xs font-medium text-red-500">{errors.kinds}</p>}
        </fieldset>

        {eventKindsSelected && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Eng kam og'irlik darajasi"
              value={form.minSeverity}
              onChange={(e) => set('minSeverity', e.target.value as EventSeverity | '')}
              options={SEVERITY_OPTIONS}
              placeholder="Cheklov yo'q"
            />
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">
                AI modullari{' '}
                <span className="font-normal text-slate-400">
                  ({form.moduleCodes.length ? `${form.moduleCodes.length} ta tanlangan` : 'hammasi'})
                </span>
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl bg-white/40 p-2">
                {sortedModules.length === 0 && <p className="px-1 text-xs text-slate-400">Modullar yuklanmoqda...</p>}
                {sortedModules.map((m) => (
                  <label key={m.code} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-white/60">
                    <input
                      type="checkbox"
                      checked={form.moduleCodes.includes(m.code)}
                      onChange={() => set('moduleCodes', toggle(form.moduleCodes, m.code))}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-mono text-[10px] text-slate-400">#{m.code}</span>
                    <span className="truncate text-slate-700">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {buildingFilterApplies && buildings.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">
              Binolar{' '}
              <span className="font-normal text-slate-400">
                ({form.buildingIds.length ? `${form.buildingIds.length} ta tanlangan` : 'hammasi'})
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {buildings.map((b) => {
                const active = form.buildingIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set('buildingIds', toggle(form.buildingIds, b.id))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      active ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-600 hover:bg-white'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
