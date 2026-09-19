import { useEffect, useState, type FormEvent } from 'react';
import { ImageUp } from 'lucide-react';
import { Button, Field, Input, Modal } from '../../ui';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import {
  PLAN_ACCEPT,
  updateFloorPlan,
  uploadFloorPlan,
  validatePlanFile,
  type FloorPlan,
} from '../../lib/floorPlansApi';

/** Yangi reja yuklash yoki mavjudini (nom/rasm) o'zgartirish. */
export default function FloorPlanUploadModal({
  open,
  onClose,
  building,
  floor,
  plan,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  building: { id: string; name: string; floors?: number | null };
  floor: number;
  /** Berilsa — tahrir (PATCH), aks holda yangi reja (POST). */
  plan: FloorPlan | null;
  onSaved: (plan: FloorPlan) => void;
}) {
  const { token } = useAuth();
  const [floorValue, setFloorValue] = useState(String(floor));
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFloorValue(String(plan?.floor ?? floor));
    setName(plan?.name ?? '');
    setFile(null);
    setError(null);
    setSaving(false);
  }, [open, plan, floor]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | null) {
    setError(null);
    if (next) {
      const problem = validatePlanFile(next);
      if (problem) {
        setError(problem);
        setFile(null);
        return;
      }
    }
    setFile(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const floorNumber = Number(floorValue);
    if (!plan) {
      if (!Number.isInteger(floorNumber) || floorNumber < -10 || floorNumber > 200) {
        setError("Qavat raqami butun son bo'lishi kerak (-10 dan 200 gacha)");
        return;
      }
      if (building.floors && floorNumber > building.floors) {
        setError(`${building.name} ${building.floors} qavatli`);
        return;
      }
      if (!file) {
        setError('Reja rasmini tanlang');
        return;
      }
    } else if (!file && name.trim() === plan.name) {
      onClose();
      return;
    } else if (!name.trim()) {
      setError("Reja nomi bo'sh bo'lmasligi kerak");
      return;
    }

    setSaving(true);
    try {
      const saved = plan
        ? await updateFloorPlan(token, plan.id, { name: name.trim(), file })
        : await uploadFloorPlan(token, { buildingId: building.id, floor: floorNumber, name, file: file! });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — rejani saqlab bo'lmadi");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      dismissible={!saving}
      title={plan ? 'Qavat rejasini tahrirlash' : 'Qavat rejasini yuklash'}
      description={`${building.name}${plan ? `, ${plan.floor}-qavat` : ''}. Chizma PNG, JPEG yoki WebP (15 MB gacha). Kameralar joylashuvi nisbiy saqlanadi — rasm almashtirilsa ham o'z joyida qoladi.`}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button type="submit" form="floorplan-upload-form" variant="primary" loading={saving}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </Button>
        </>
      }
    >
      <form id="floorplan-upload-form" onSubmit={handleSubmit} className="space-y-4 pb-1">
        {!plan && (
          <Field label="Qavat" required>
            <Input type="number" min={-10} max={building.floors || 200} value={floorValue} onChange={(e) => setFloorValue(e.target.value)} required />
          </Field>
        )}
        <Field label={plan ? 'Nomi' : 'Nomi (ixtiyoriy)'}>
          <Input
            type="text"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${building.name}, ${floorValue || '?'}-qavat`}
          />
        </Field>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-[13px] text-muted transition-colors hover:border-primary/50 hover:bg-primary-soft focus-within:ring-[3px] focus-within:ring-primary/40">
          {preview ? (
            <img src={preview} alt="Tanlangan reja" className="max-h-48 rounded-control object-contain shadow-card" />
          ) : (
            <ImageUp size={26} aria-hidden="true" className="text-subtle" />
          )}
          <span className="font-medium text-fg">{file ? file.name : plan ? 'Rasmni almashtirish (ixtiyoriy)' : 'Rasm tanlang'}</span>
          <input type="file" accept={PLAN_ACCEPT} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
