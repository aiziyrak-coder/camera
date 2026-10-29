import { useEffect, useState } from 'react';
import { Cpu, Eye, EyeOff, VideoOff } from 'lucide-react';
import LiveVideoPlayer from '../LiveVideoPlayer';
import { Badge, Button, Drawer, KeyValue, Section, type Tone } from '../../ui';
import { formatModuleSummary } from '../../lib/cameraModules';
import { ROOM_TYPE_LABELS } from '../../lib/cameraRoles';
import { useCameraModuleOptions } from '../../lib/useCameraModuleOptions';
import type { CameraConfig } from '../../types';

const STATUS_TONE: Record<CameraConfig['status'], Tone> = {
  faol: 'success',
  nofaol: 'neutral',
  tamirda: 'warning',
};

const STATUS_LABEL: Record<CameraConfig['status'], string> = {
  faol: 'Faol',
  nofaol: 'Nofaol',
  tamirda: "Ta'mirda",
};

/** Kamera tafsiloti — o'ngdan chiquvchi panel (Drawer): jonli video,
 *  holat, joylashuv va AI modullar. Nomi tarixiy (ilgari Modal edi),
 *  import qiluvchilar uchun o'zgartirilmadi. */
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

  useEffect(() => {
    setShowDetections(false);
  }, [camera?.id]);

  const customModules = (camera?.excludedModuleCodes?.length ?? 0) > 0;
  const doorPoints = camera?.faceRoi?.length ?? 0;

  return (
    <Drawer
      open={!!camera}
      onClose={onClose}
      title={camera?.name}
      subtitle={camera ? [camera.building, camera.zone].filter(Boolean).join(' · ') : undefined}
      size="lg"
    >
      {camera && (
        <div className="flex flex-col gap-6">
          {/* Video maydoni mavzudan qat'i nazar qora — kadr shunday ko'rinadi. */}
          <div className="relative flex aspect-video items-center justify-center overflow-hidden border border-border-strong bg-black">
            {camera.status === 'faol' && (
              /* `priority`: yakka pleyer umumiy HLS navbatini (streamLoadQueue,
                 MAX 8) chetlab o'tadi. Busiz, boshqa ekranda ochiq turgan
                 kartalar navbatni to'ldirgan bo'lsa, admin kamerani ochganda
                 25 soniyagacha "Navbatda..." holatida qotib turardi. */
              <LiveVideoPlayer streamUrl={camera.streamUrl} cameraId={camera.id} showDetections={showDetections} priority />
            )}
            {camera.status === 'faol' && camera.streamUrl && (
              <Button
                size="sm"
                icon={showDetections ? EyeOff : Eye}
                onClick={() => setShowDetections((v) => !v)}
                className="absolute bottom-2 left-2"
                aria-pressed={showDetections}
              >
                {showDetections ? "AI o'chirish" : "AI ko'rsatkich"}
              </Button>
            )}
            {!camera.streamUrl && (
              <div className="flex flex-col items-center gap-1.5 text-subtle">
                <VideoOff size={20} aria-hidden="true" />
                <span className="text-xs font-medium">
                  {camera.status === 'faol' ? 'Video oqim ulanmagan' : STATUS_LABEL[camera.status]}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[camera.status]} dot>
              {STATUS_LABEL[camera.status]}
            </Badge>
            {camera.status === 'faol' && camera.isReachable !== undefined && (
              <Badge tone={camera.isReachable ? 'success' : 'danger'}>{camera.isReachable ? 'Ulangan' : "Javob yo'q"}</Badge>
            )}
            {camera.isEntrance && <Badge tone="primary">Kirish kamerasi</Badge>}
            {camera.isExit && <Badge tone="warning">Chiqish kamerasi</Badge>}
            {camera.isPerimeter && <Badge tone="info">Perimetr kamerasi</Badge>}
          </div>

          <Section title="Ma'lumotlar">
            <KeyValue
              items={[
                { label: 'IP manzil', value: <span className="font-mono text-[13px]">{camera.ip}</span> },
                { label: 'Bino', value: camera.building || '—' },
                {
                  label: 'Qavat',
                  value:
                    camera.floor === null || camera.floor === undefined ? (
                      <span className="text-warning">belgilanmagan</span>
                    ) : (
                      <span className="tabular-nums">{camera.floor}-qavat</span>
                    ),
                },
                { label: 'Zona', value: camera.zone || '—' },
                {
                  label: 'Xona turi',
                  value: camera.effectiveRoomType ? (
                    <>
                      {ROOM_TYPE_LABELS[camera.effectiveRoomType]}
                      {camera.roomCode ? ` · ${camera.roomCode}` : ''}
                    </>
                  ) : (
                    <span className="text-warning">belgilanmagan</span>
                  ),
                },
                {
                  label: 'Ruxsat / FPS',
                  value: (
                    <span className="tabular-nums">
                      {camera.resolution} {camera.fps ? `/ ${camera.fps} fps` : ''}
                    </span>
                  ),
                },
                ...(doorPoints > 0 ? [{ label: 'Eshik hududi', value: <span className="text-success">{doorPoints} nuqta</span> }] : []),
              ]}
            />
          </Section>

          <Section
            title="AI modullar"
            actions={
              onEditModules ? (
                <Button size="sm" icon={Cpu} onClick={onEditModules}>
                  Sozlash
                </Button>
              ) : undefined
            }
          >
            <p className="text-sm text-fg">{moduleSummary ?? 'Yuklanmoqda…'}</p>
            {customModules && <p className="mt-1 text-xs font-medium text-warning">Maxsus sozlama — ba&apos;zi kriteriyalar o&apos;chirilgan</p>}
          </Section>

        </div>
      )}
    </Drawer>
  );
}
