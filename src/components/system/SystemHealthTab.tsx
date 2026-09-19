import { Camera, Cpu, HardDrive, MemoryStick, Radio, ShieldAlert } from 'lucide-react';
import { api, fetchAllPages } from '../../lib/apiClient';
import type { AIModule, Building, CameraConfig } from '../../types';
import { StatTile, formatNumber } from '../../ui';
import { useLiveResource } from '../situation/useLiveResource';
import { AiModulesCard } from './AiModulesCard';
import { AiRuntimeCard } from './AiRuntimeCard';
import { CameraNetworkCard } from './CameraNetworkCard';
import { CampusCamerasCard, type CampusCameras } from './CampusCamerasCard';
import { ServerResourcesCard } from './ServerResourcesCard';
import { StreamsCard } from './StreamsCard';
import { resourceTone, type SystemAiStatus, type SystemCameraNetwork, type SystemResources, type SystemStreamStatus } from './systemTypes';

interface Props {
  tick: number;
  canAi: boolean;
  canCameras: boolean;
  canResync: boolean;
}

/** "Holat" tabi: server, AI, oqimlar va kamera tarmog'i. */
export function SystemHealthTab({ tick, canAi, canCameras, canResync }: Props) {
  const resources = useLiveResource('resources', (signal) => api.get<SystemResources>('/api/system/resources', undefined, { signal }), tick);
  const ai = useLiveResource('ai', (signal) => api.get<SystemAiStatus>('/api/system/ai-status', undefined, { signal }), tick);
  const streams = useLiveResource('streams', (signal) => api.get<SystemStreamStatus>('/api/system/stream-status', undefined, { signal }), tick);
  const network = useLiveResource('network', (signal) => api.get<SystemCameraNetwork>('/api/system/camera-network', undefined, { signal }), tick);
  const modules = useLiveResource(canAi ? 'modules' : null, (signal) => api.get<AIModule[]>('/api/ai-modules', undefined, { signal }), tick);
  const campus = useLiveResource<CampusCameras>(
    canCameras ? 'campus' : null,
    async (signal) => {
      const [buildings, cameras] = await Promise.all([
        api.get<Building[]>('/api/buildings', undefined, { signal }),
        fetchAllPages<CameraConfig>('/api/cameras', undefined),
      ]);
      return { buildings, cameras };
    },
    tick,
  );

  const r = resources.data;
  const security = r?.alerts.filter((a) => a.metric === 'security') ?? [];
  const net = network.data;
  const st = streams.data;

  return (
    <>
      {security.map((alert) => (
        <div key={alert.message} role="alert" className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-fg">Xavfsizlik ogohlantirishi</p>
            <p className="text-[13px] text-fg/80">{alert.message}</p>
          </div>
        </div>
      ))}

      <section aria-label="Qisqa holat" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Protsessor" icon={Cpu} value={r ? r.cpu : '—'} unit="%" tone={r ? resourceTone(r.cpu) : 'neutral'} progress={r?.cpu} loading={resources.loading} />
        <StatTile label="Xotira" icon={MemoryStick} value={r ? r.ram : '—'} unit="%" tone={r ? resourceTone(r.ram) : 'neutral'} progress={r?.ram} loading={resources.loading} />
        <StatTile label="Disk" icon={HardDrive} value={r ? r.disk : '—'} unit="%" tone={r ? resourceTone(r.disk) : 'neutral'} progress={r?.disk} loading={resources.loading} />
        <StatTile
          label="Kameralar onlayn"
          icon={Camera}
          value={net ? formatNumber(net.reachableCameras) : '—'}
          unit={net ? `/ ${formatNumber(net.faolCameras)}` : undefined}
          tone={net ? (net.offlineCameras > 0 ? 'warning' : 'success') : 'neutral'}
          hint={net && net.offlineCameras > 0 ? `${net.offlineCameras} ta aloqada emas` : undefined}
          loading={network.loading}
        />
        <StatTile
          className="col-span-2 lg:col-span-1"
          label="Video oqimlar"
          icon={Radio}
          value={st ? formatNumber(st.registeredStreams) : '—'}
          unit={st ? `/ ${formatNumber(st.faolCameras)}` : undefined}
          tone={st ? (st.shards.some((s) => !s.reachable) ? 'danger' : st.registeredStreams < st.faolCameras ? 'warning' : 'success') : 'neutral'}
          hint={st ? `${st.shards.filter((s) => s.reachable).length}/${st.shards.length} tugun ishlayapti` : undefined}
          loading={streams.loading}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ServerResourcesCard resource={resources} />
        <AiRuntimeCard resource={ai} />
        <StreamsCard resource={streams} canResync={canResync} />
        <CameraNetworkCard resource={network} />
      </div>

      {(canCameras || canAi) && (
        <div className={canCameras && canAi ? 'grid gap-5 xl:grid-cols-3' : 'grid gap-5'}>
          {canCameras && (
            <div className={canAi ? 'min-w-0 xl:col-span-2' : 'min-w-0'}>
              <CampusCamerasCard resource={campus} />
            </div>
          )}
          {canAi && <AiModulesCard resource={modules} />}
        </div>
      )}
    </>
  );
}
