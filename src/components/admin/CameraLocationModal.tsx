import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import Modal from '../Modal';
import { SelectField, TextField } from '../FormField';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useBuildings } from '../../lib/useBuildings';

/** Belgilangan kameralarga bino/qavat/zonani birdan qo'yish.
 *
 * Nega kerak: monitoring markazi kesimi kameraning qavatini bilishi
 * kerak, 107 ta kameraga esa uni bittalab kiritish real ish emas.
 * Bo'sh qoldirilgan maydon O'ZGARTIRILMAYDI — masalan faqat qavatni
 * qo'yish uchun binoni qayta tanlash shart emas. */
export default function CameraLocationModal({
  open,
  cameraIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  cameraIds: string[];
  onClose: () => void;
  onSaved: (updated: number) => void;
}) {
  const { token } = useAuth();
  const { buildings } = useBuildings();
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState('');
  const [clearFloor, setClearFloor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBuilding('');
    setFloor('');
    setZone('');
    setClearFloor(false);
    setError(null);
  }, [open]);

  const nothingToDo = !building && !zone && !clearFloor && floor.trim() === '';

  async function handleSave() {
    if (nothingToDo) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ updated: number; notFound: string[] }>(
        '/api/cameras/bulk-location',
        {
          cameraIds,
          building: building || null,
          floor: clearFloor || floor.trim() === '' ? null : Number(floor),
          clearFloor,
          zone: zone.trim() || null,
        },
        token,
      );
      onSaved(res.updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Joylashuvni belgilash — ${cameraIds.length} ta kamera`}>
      <div className="space-y-4">
        <p className="glass-deep p-3 text-xs leading-relaxed text-slate-500">
          Bo&apos;sh qoldirilgan maydon o&apos;zgarmaydi. Qavat monitoring markazidagi bino
          kesimi uchun ishlatiladi: qavati belgilanmagan kameralar &laquo;Qavat
          belgilanmagan&raquo; guruhida to&apos;planadi.
        </p>

        <SelectField
          label="Bino"
          placeholder="O'zgartirilmasin"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          options={buildings.map((b) => ({ value: b.name, label: b.name }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Qavat"
            type="number"
            min={-5}
            max={50}
            placeholder="O'zgartirilmasin"
            value={floor}
            onChange={(e) => {
              setFloor(e.target.value);
              if (e.target.value) setClearFloor(false);
            }}
            disabled={clearFloor}
          />
          <TextField
            label="Zona (xona nomi)"
            placeholder="O'zgartirilmasin"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={clearFloor}
            onChange={(e) => {
              setClearFloor(e.target.checked);
              if (e.target.checked) setFloor('');
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Qavat belgisini olib tashlash
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || nothingToDo}
            className="btn-glass flex items-center gap-1.5 !bg-indigo-600 !text-white hover:!bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
            Saqlash
          </button>
        </div>
      </div>
    </Modal>
  );
}
