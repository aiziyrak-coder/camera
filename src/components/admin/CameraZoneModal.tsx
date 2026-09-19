import { useEffect, useState } from 'react';
import { Ban, RotateCcw, Trash2, VideoOff } from 'lucide-react';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { Notice } from '../settings/kit';
import { Button, Modal } from '../../ui';
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
    <Modal
      open={open && !!camera}
      onClose={onClose}
      title={text.title}
      description={camera?.name}
      size="lg"
      dismissible={!saving}
      footer={
        <>
          {existing && existing.length > 0 && (
            <Button variant="ghost" icon={Ban} onClick={handleClear} disabled={saving} className="mr-auto text-danger hover:bg-danger-soft hover:text-danger">
              {text.clear}
            </Button>
          )}
          <Button onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Saqlash
          </Button>
        </>
      }
    >
      {camera && (
        <div className="flex flex-col gap-4">
          {/* Video maydoni mavzudan qat'i nazar qora — kadr shunday ko'rinadi. */}
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-card bg-black">
            {hasStream ? (
              <LiveVideoPlayer
                streamUrl={camera.streamUrl}
                zoneEditing
                zonePoints={points}
                onZonePointAdd={(p) => setPoints((prev) => [...prev, p])}
              />
            ) : (
              <div className="flex max-w-sm flex-col items-center gap-1.5 px-4 text-center text-subtle">
                <VideoOff size={20} aria-hidden="true" />
                <span className="text-xs font-medium">
                  Video oqim mavjud emas — zona chizish uchun kamera faol va oqim ulangan bo&apos;lishi kerak
                </span>
              </div>
            )}
          </div>

          {hasStream && <p className="text-[13px] text-muted">{text.hint}</p>}

          {error && <Notice tone="danger">{error}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-muted">
              <span className="font-medium tabular-nums text-fg">{points.length}</span> ta nuqta belgilandi
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={RotateCcw} disabled={points.length === 0} onClick={() => setPoints((prev) => prev.slice(0, -1))}>
                Oxirgisini bekor qilish
              </Button>
              <Button size="sm" icon={Trash2} disabled={points.length === 0} onClick={() => setPoints([])}>
                Tozalash
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
