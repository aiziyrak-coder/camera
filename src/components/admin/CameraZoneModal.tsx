import { useEffect, useState } from 'react';
import { Ban, RotateCcw, Trash2, VideoOff } from 'lucide-react';
import Modal from '../Modal';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { CameraConfig } from '../../types';

/** Taqiqlangan zona chizish oynasi (TT kriteriya 2) — jonli video ustiga
 * bosib ko'pburchak nuqtalarini belgilaydi, xuddi
 * FaceDetectionOverlay/computeBoxes'dagi object-cover koordinata
 * matematikasidan foydalanib (bu safar teskari yo'nalishda,
 * ZoneOverlay.tsx'ga qarang). Kamida 3 ta nuqta kerak — kamroq bo'lsa
 * backend (app/routers/cameras.py) 422 bilan rad etadi.
 *
 * `mode="faceRoi"` — xuddi shu oyna kirish kamerasining ESHIK HUDUDINI
 * chizadi (Camera.faceRoi): AI yuzni faqat shu hududda, to'liq sifatda
 * qidiradi — kadrning qolgan qismi tahlil qilinmaydi. */
type ZoneMode = 'restricted' | 'faceRoi';

const MODE_TEXT: Record<ZoneMode, { title: string; endpoint: string; hint: string; clear: string }> = {
  restricted: {
    title: 'Taqiqlangan zona',
    endpoint: 'zone-polygon',
    hint: "Video ustiga bosib ko'pburchak nuqtalarini belgilang (kamida 3 ta). Nuqtalar oq nuqta bilan ko'rsatiladi, zona qizil rangda to'ldiriladi.",
    clear: 'Zonani olib tashlash',
  },
  faceRoi: {
    title: 'Eshik hududi (yuz qidiriladigan joy)',
    endpoint: 'face-roi',
    hint: "Odamlar yuzi aniq ko'rinadigan joyni — eshik yoki turniket atrofini — belgilang (kamida 3 ta nuqta). AI yuzni faqat shu hududda, to'liq sifatda qidiradi: yuzlar kattaroq ko'rinadi, CPU kamroq sarflanadi.",
    clear: 'Hududni olib tashlash',
  },
};

export default function CameraZoneModal({
  open,
  camera,
  onClose,
  onSave,
  mode = 'restricted',
}: {
  open: boolean;
  camera: CameraConfig | null;
  onClose: () => void;
  onSave: (camera: CameraConfig) => void;
  mode?: ZoneMode;
}) {
  const text = MODE_TEXT[mode];
  const existing = mode === 'faceRoi' ? camera?.faceRoi : camera?.restrictedZonePolygon;
  const { token } = useAuth();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPoints((mode === 'faceRoi' ? camera?.faceRoi : camera?.restrictedZonePolygon) ?? []);
      setError(null);
    }
  }, [open, camera, mode]);

  async function handleSave() {
    if (!camera) return;
    if (points.length > 0 && points.length < 3) {
      setError("Zona kamida 3 ta nuqtadan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<CameraConfig>(
        `/api/cameras/${camera.id}/${text.endpoint}`,
        { polygon: points.length > 0 ? points : null },
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

  async function handleClear() {
    if (!camera) return;
    setSaving(true);
    setError(null);
    try {
      const cleared = await api.patch<CameraConfig>(
        `/api/cameras/${camera.id}/${text.endpoint}`,
        { polygon: null },
        token,
      );
      setPoints([]);
      onSave(cleared);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  const hasStream = !!camera?.streamUrl && camera.status === 'faol';

  return (
    <Modal open={open} onClose={onClose} title={camera ? `${text.title} — ${camera.name}` : ''} maxWidth="max-w-lg">
      {camera && (
        <div className="space-y-4">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-slate-900">
            {hasStream ? (
              <LiveVideoPlayer
                streamUrl={camera.streamUrl}
                zoneEditing
                zonePoints={points}
                onZonePointAdd={(p) => setPoints((prev) => [...prev, p])}
              />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <VideoOff size={20} />
                <span className="text-[11px] font-medium">
                  Video oqim mavjud emas — zona chizish uchun kamera faol va oqim ulangan bo'lishi kerak
                </span>
              </div>
            )}
          </div>

          {hasStream && (
            <p className="text-xs text-slate-500">{text.hint}</p>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{points.length} ta nuqta belgilandi</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={points.length === 0}
                onClick={() => setPoints((prev) => prev.slice(0, -1))}
                className="btn-glass flex items-center gap-1 !px-2.5 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Oxirgisini bekor qilish
              </button>
              <button
                type="button"
                disabled={points.length === 0}
                onClick={() => setPoints([])}
                className="btn-glass flex items-center gap-1 !px-2.5 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={12} />
                Tozalash
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {existing && existing.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="btn-glass flex items-center gap-1.5 !text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ban size={14} />
                {text.clear}
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-glass">
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
