import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import Modal from '../Modal';
import { SelectField, TextField } from '../FormField';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useBuildings } from '../../lib/useBuildings';
import { useCameraZones } from '../../lib/useCameraZones';
import type { CameraConfig, Department } from '../../types';

/** Oynaga kerak bo'ladigan minimal ma'lumot.
 *
 * Admin ro'yxatidagi `CameraConfig` ham, monitoring devoridagi
 * `CameraFeed` ham shu shaklga to'g'ri keladi — shuning uchun bitta oyna
 * ikkala joydan ham ochiladi va qoidalar bir joyda qoladi. */
export interface CameraLocationTarget {
  id: string;
  name: string;
  building: string;
  zone: string;
  floor?: number | null;
  /** Kafedra nomi; biriktirilmagan bo'lsa bo'sh. */
  department?: string;
}

/** Kameraning JOYLASHUVINI to'g'rilash: nomi, binosi, qavati, zonasi, kafedrasi.
 *
 * Nega alohida oyna: to'liq tahrirlash formasi IP, port, RTSP yo'li va
 * login/parolni ham yuboradi — bitta noto'g'ri yuborilgan maydon
 * kameraning ulanishini yo'qotadi. Bu yerda ulanish maydonlari umuman
 * yo'q va so'rovda ham yuborilmaydi (PATCH /api/cameras/{id}/location),
 * ya'ni ularga tasodifan tegib bo'lmaydi. */
export default function CameraLocationEditModal({
  camera,
  onClose,
  onSave,
}: {
  camera: CameraLocationTarget | null;
  onClose: () => void;
  onSave: (camera: CameraConfig) => void;
}) {
  const { token } = useAuth();
  const { buildings } = useBuildings();
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { zones } = useCameraZones(building || undefined);

  useEffect(() => {
    if (!camera) return;
    setName(camera.name);
    setBuilding(camera.building);
    setFloor(camera.floor === null || camera.floor === undefined ? '' : String(camera.floor));
    setZone(camera.zone);
    setDepartment(camera.department ?? '');
    setError(null);
  }, [camera]);

  useEffect(() => {
    if (!camera || !token) return;
    let cancelled = false;
    api
      .get<Department[]>('/api/departments', token)
      .then((rows) => {
        if (!cancelled) setDepartments(rows);
      })
      .catch(() => {
        /* ro'yxat kelmasa kafedra tanlovi bo'sh qoladi — joylashuv baribir saqlanadi */
      });
    return () => {
      cancelled = true;
    };
  }, [camera, token]);

  // Kafedra jismonan bitta binoda: tanlangan binoniki ko'rsatiladi, hozir
  // biriktirilgani esa (boshqa binoda bo'lsa ham) ro'yxatdan tushib qolmaydi.
  const departmentOptions = departments
    .filter((item) => !building || item.buildingName === building || item.name === department)
    .map((item) => ({ value: item.name, label: item.name }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!camera) return;
    if (name.trim().length < 2) {
      setError('Kamera nomi kamida 2 belgi bo‘lishi kerak');
      return;
    }
    if (!zone.trim()) {
      setError('Zona (xona) nomini kiriting');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<CameraConfig>(
        `/api/cameras/${camera.id}/location`,
        {
          name: name.trim(),
          building: building || undefined,
          // Bo'sh maydon "qavat belgilanmagan" degani; buni None'dan
          // ("tegmaslik") ajratish uchun alohida bayroq bor.
          floor: floor.trim() === '' ? null : Number(floor),
          clearFloor: floor.trim() === '',
          zone: zone.trim(),
          department: department || undefined,
          clearDepartment: department === '',
        },
        token,
      );
      onSave(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!camera} onClose={onClose} title="Kamera ma'lumotini to'g'rilash">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="glass-deep p-3 text-xs leading-relaxed text-slate-500">
          Bu yerda faqat kameraning joylashuvi o&apos;zgaradi. Ulanish sozlamalari (IP,
          port, RTSP, login/parol) o&apos;z holicha qoladi — ular bu so&apos;rovda umuman
          yuborilmaydi.
        </p>

        <TextField
          label="Kamera nomi"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Masalan: 2-qavat kirish"
        />

        <SelectField
          label="Bino"
          placeholder="Tanlang"
          value={building}
          onChange={(event) => setBuilding(event.target.value)}
          options={buildings.map((item) => ({ value: item.name, label: item.name }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Qavat"
            type="number"
            min={-5}
            max={50}
            placeholder="Belgilanmagan"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
          />
          <div>
            <TextField
              label="Zona (xona)"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              placeholder="Masalan: 205-xona"
              list="camera-location-zones"
            />
            <datalist id="camera-location-zones">
              {zones.map((item) => (
                <option key={item.zone} value={item.zone}>
                  {item.cameraCount} ta kamera
                </option>
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <SelectField
            label="Kafedra"
            placeholder="Kafedrasiz"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            options={departmentOptions}
          />
          {departmentOptions.length === 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              Bu binoda kafedra yo&apos;q — &quot;Tashkiliy tuzilma&quot; sahifasida qo&apos;shiladi.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
            Saqlash
          </button>
        </div>
      </form>
    </Modal>
  );
}
