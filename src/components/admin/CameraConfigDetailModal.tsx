import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Eye, EyeOff, Gamepad2, Loader2, XCircle } from 'lucide-react';
import Modal from '../Modal';
import Badge from '../Badge';
import LiveVideoPlayer from '../LiveVideoPlayer';
import PtzControls from '../ptz/PtzControls';
import { usePtzAvailability } from '../ptz/usePtzAvailability';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { formatModuleSummary } from '../../lib/cameraModules';
import { usePermissions } from '../../lib/permissions';
import { ptzApi, type PtzProbeResult } from '../../lib/ptzApi';
import { useCameraModuleOptions } from '../../lib/useCameraModuleOptions';
import type { CameraConfig } from '../../types';

const PTZ_PROTOCOL_LABEL = { onvif: 'ONVIF', isapi: 'Hikvision ISAPI' } as const;

const STATUS_TONE: Record<CameraConfig['status'], 'green' | 'slate' | 'amber'> = {
  faol: 'green',
  nofaol: 'slate',
  tamirda: 'amber',
};

const STATUS_LABEL: Record<CameraConfig['status'], string> = {
  faol: 'Faol',
  nofaol: 'Nofaol',
  tamirda: "Ta'mirda",
};

export default function CameraConfigDetailModal({
  camera,
  onClose,
  onEditModules,
}: {
  camera: CameraConfig | null;
  onClose: () => void;
  onEditModules?: () => void;
}) {
  const [showDetections, setShowDetections] = useState(false);
  const { modules } = useCameraModuleOptions();
  const moduleSummary = camera && modules.length > 0 ? formatModuleSummary(modules, camera) : null;
  const { role } = useAuth();
  const { can } = usePermissions();
  // Tekshiruv — backendda manageCameras YOKI controlPtz.
  const canProbePtz = can('manageCameras', role) || can('controlPtz', role);
  const ptzAvailable = usePtzAvailability(
    camera && camera.status === 'faol' ? camera.id : null,
    camera ? Boolean(camera.ptzEnabled && camera.ptzProtocol) : false,
  );
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<PtzProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    setShowDetections(false);
    setProbe(null);
    setProbeError(null);
  }, [camera?.id]);

  async function runProbe(cameraId: string) {
    setProbing(true);
    setProbe(null);
    setProbeError(null);
    try {
      setProbe(await ptzApi.probe(cameraId));
    } catch (err) {
      setProbeError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setProbing(false);
    }
  }

  return (
    <Modal open={!!camera} onClose={onClose} title={camera?.name} maxWidth="max-w-md">
      {camera && (
        <div className="space-y-4">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-slate-900">
            {camera.status === 'faol' && (
              <LiveVideoPlayer
                streamUrl={camera.streamUrl}
                cameraId={camera.id}
                showDetections={showDetections}
              />
            )}
            {camera.status === 'faol' && camera.streamUrl && (
              <button
                type="button"
                onClick={() => setShowDetections((v) => !v)}
                className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[10px] font-semibold text-white hover:bg-black/70"
              >
                {showDetections ? <EyeOff size={12} /> : <Eye size={12} />}
                {showDetections ? 'AI o\'chirish' : 'AI ko\'rsatkich'}
              </button>
            )}
            {!camera.streamUrl && (
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <span className="text-[11px] font-medium">
                  {camera.status === 'faol' ? 'Video oqim ulanmagan' : STATUS_LABEL[camera.status]}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[camera.status]}>{STATUS_LABEL[camera.status]}</Badge>
            {camera.isEntrance && (
              <Badge tone="indigo">Kirish kamerasi</Badge>
            )}
            {camera.isExit && (
              <Badge tone="amber">Chiqish kamerasi</Badge>
            )}
            {camera.ptzEnabled && camera.ptzProtocol && (
              <Badge tone="indigo">PTZ · {PTZ_PROTOCOL_LABEL[camera.ptzProtocol]}</Badge>
            )}
          </div>

          {ptzAvailable && <PtzControls key={camera.id} cameraId={camera.id} defaultOpen={false} className="w-full" />}

          {canProbePtz && (
            <div className="glass-deep space-y-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-slate-400">PTZ boshqaruvi</p>
                  <p className="text-sm font-medium text-slate-800">
                    {camera.ptzEnabled && camera.ptzProtocol
                      ? `Yoqilgan — ${PTZ_PROTOCOL_LABEL[camera.ptzProtocol]}, port ${camera.onvifPort ?? 80}`
                      : "O'chirilgan"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runProbe(camera.id)}
                  disabled={probing}
                  className="btn-glass flex shrink-0 items-center gap-1 text-xs disabled:opacity-60"
                >
                  {probing ? <Loader2 size={14} className="animate-spin" /> : <Gamepad2 size={14} />}
                  PTZ ni tekshirish
                </button>
              </div>
              {probe && (
                <div
                  className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${
                    probe.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}
                >
                  <p className="flex items-center gap-1.5">
                    {probe.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {probe.message}
                  </p>
                  <p className="mt-0.5 font-medium opacity-80">
                    {[
                      probe.reachable ? 'Ulanish bor' : "Ulanib bo'lmadi",
                      probe.reachable ? (probe.authenticated ? 'login/parol to\'g\'ri' : "login/parol rad etildi") : null,
                      probe.success ? (probe.presetsSupported ? `${probe.presetCount ?? 0} ta preset` : "presetlar yo'q") : null,
                      probe.deviceInfo,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {probe.success && !camera.ptzEnabled && (
                    <p className="mt-0.5 font-medium opacity-80">
                      Yoqish uchun kamerani tahrirlab, «PTZ (buriladigan) kamera» belgisini qo&apos;ying.
                    </p>
                  )}
                </div>
              )}
              {probeError && <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-600">{probeError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">IP manzil</p>
              <p className="font-mono font-medium text-slate-800">{camera.ip}</p>
            </div>
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Bino</p>
              <p className="font-medium text-slate-800">{camera.building}</p>
            </div>
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Zona</p>
              <p className="font-medium text-slate-800">{camera.zone}</p>
            </div>
            <div className="glass-deep px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Ruxsat / FPS</p>
              <p className="font-medium text-slate-800">
                {camera.resolution} {camera.fps ? `/ ${camera.fps} fps` : ''}
              </p>
            </div>
          </div>

          <div className="glass-deep flex items-center justify-between gap-3 px-3 py-2.5">
            <div>
              <p className="text-[11px] text-slate-400">AI modullar</p>
              <p className="text-sm font-medium text-slate-800">
                {moduleSummary ?? 'Yuklanmoqda...'}
              </p>
              {(camera.excludedModuleCodes?.length ?? 0) > 0 && (
                <p className="mt-0.5 text-[10px] text-amber-600">
                  Maxsus sozlama — ba&apos;zi kriteriyalar o‘chirilgan
                </p>
              )}
            </div>
            {onEditModules && (
              <button
                type="button"
                onClick={onEditModules}
                className="btn-glass flex shrink-0 items-center gap-1 text-xs"
              >
                <Cpu size={14} />
                Sozlash
              </button>
            )}
          </div>

          {camera.restrictedZonePolygon && camera.restrictedZonePolygon.length > 0 && (
            <p className="text-xs text-red-600">
              Taqiqlangan zona belgilangan ({camera.restrictedZonePolygon.length} nuqta)
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
