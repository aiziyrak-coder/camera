import { useEffect, useState, type FormEvent } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import Modal from '../Modal';
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
    <Modal open={open} onClose={saving ? () => {} : onClose} title={plan ? 'Qavat rejasini tahrirlash' : 'Qavat rejasini yuklash'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          {building.name}
          {plan ? `, ${plan.floor}-qavat` : ''}. Chizma PNG, JPEG yoki WebP (15 MB gacha). Kameralar joylashuvi
          nisbiy saqlanadi — rasm almashtirilsa ham o'z joyida qoladi.
        </p>
        {!plan && (
          <label className="block text-xs font-semibold text-slate-600">
            Qavat
            <input
              type="number"
              min={-10}
              max={building.floors || 200}
              value={floorValue}
              onChange={(e) => setFloorValue(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              required
            />
          </label>
        )}
        <label className="block text-xs font-semibold text-slate-600">
          Nomi {!plan && <span className="font-normal text-slate-400">(ixtiyoriy)</span>}
          <input
            type="text"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${building.name}, ${floorValue || '?'}-qavat`}
            className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/50 px-4 py-6 text-center text-xs text-slate-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
          {preview ? (
            <img src={preview} alt="Tanlangan reja" className="max-h-48 rounded-lg object-contain shadow-sm" />
          ) : (
            <ImageUp size={26} className="text-slate-400" />
          )}
          <span className="font-semibold text-slate-700">
            {file ? file.name : plan ? 'Rasmni almashtirish (ixtiyoriy)' : 'Rasm tanlang'}
          </span>
          <input
            type="file"
            accept={PLAN_ACCEPT}
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:opacity-70"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
