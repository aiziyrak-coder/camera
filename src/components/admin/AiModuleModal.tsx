import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Select } from '../../ui';
import { Checkbox, Notice } from '../settings/kit';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { AIModule } from '../../types';

interface FormState {
  threshold: string;
  sensitivity: AIModule['sensitivity'];
  active: boolean;
}

function toForm(m: AIModule): FormState {
  return {
    threshold: String(m.threshold),
    sensitivity: m.sensitivity,
    active: m.active,
  };
}

const SENSITIVITY_OPTIONS = [
  { value: 'past', label: 'Past' },
  { value: "o'rta", label: "O'rta" },
  { value: 'yuqori', label: 'Yuqori' },
];

export default function AiModuleModal({
  open,
  onClose,
  module,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  module: AIModule | null;
  onSave: (module: AIModule) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<FormState | null>(module ? toForm(module) : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && module) {
      setForm(toForm(module));
      setError(null);
    }
  }, [open, module]);

  // O'zgarish bor-yo'qligi: (1) tegilmagan formani saqlash serverda bekorga
  // audit yozuvi qoldiradi ("AI modulni sozladi"), (2) o'zgarish bo'lsa fonni
  // tasodifan bosish kiritilganni yo'qotmasligi kerak.
  const initial = module ? toForm(module) : null;
  const dirty =
    !!form && !!initial && (form.threshold !== initial.threshold || form.sensitivity !== initial.sensitivity || form.active !== initial.active);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    // Qiymat o'zgardi — eski xato xabari endi shu qiymatga tegishli emas.
    if (error) setError(null);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!module || !form) return;

    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<AIModule>(
        `/api/ai-modules/${module.id}`,
        { threshold: Number(form.threshold), sensitivity: form.sensitivity, active: form.active },
        token,
      );
      onSave(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tarmoq xatosi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open && !!module}
      onClose={onClose}
      title="Modulni sozlash"
      description={module ? `№${module.code} — ${module.name}` : undefined}
      size="md"
      dismissible={!saving && !dirty}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {dirty ? 'Bekor qilish' : 'Yopish'}
          </Button>
          <Button type="submit" form="ai-module-form" variant="primary" loading={saving} disabled={!dirty}>
            Saqlash
          </Button>
        </>
      }
    >
      {form && module && (
        <form id="ai-module-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="rounded-control border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-[13px] leading-5 text-fg">{module.description}</p>
            {module.method && <p className="mt-1 text-xs text-muted">{module.method}</p>}
          </div>

          <Field
            label={
              <span className="inline-flex items-center gap-2">
                Ishonch chegarasi (threshold)
                <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-xs text-primary">{form.threshold}%</span>
              </span>
            }
            hint="Bundan past signallar e'tiborsiz qoladi"
          >
            <input
              type="range"
              min={0}
              max={100}
              value={form.threshold}
              onChange={(e) => set('threshold', e.target.value)}
              className="h-2 w-full cursor-pointer accent-primary"
            />
          </Field>

          <Field label="Sezgirlik">
            <Select
              value={form.sensitivity}
              onChange={(v) => set('sensitivity', v as AIModule['sensitivity'])}
              options={SENSITIVITY_OPTIONS}
              className="sm:w-full"
            />
          </Field>

          <Checkbox
            label="Modul faol"
            description={
              module.hasDetector
                ? 'O‘chirilgan modul hech bir kamerada hisoblanmaydi.'
                : "Bu modul uchun hali aniqlash logikasi yozilmagan — faollashtirib bo'lmaydi."
            }
            checked={form.active}
            disabled={!module.hasDetector}
            onChange={(e) => set('active', e.target.checked)}
          />

          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      )}
    </Modal>
  );
}
