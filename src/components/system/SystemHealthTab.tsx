import { ShieldAlert } from 'lucide-react';
import { api, buildQuery, type Page } from '../../lib/apiClient';
import { branding } from '../../lib/branding';
import type { AIModule, Building, CameraConfig } from '../../types';
import {
  CodeText,
  DocumentFooter,
  DocumentHeader,
  IntelPanel,
  MicroLabel,
  RAG_LABEL,
  formatNumber,
  rag,
  type Rag,
} from '../../ui';
import { useLiveResource } from '../situation/useLiveResource';
import { AiModulesCard } from './AiModulesCard';
import { AiRuntimeCard } from './AiRuntimeCard';
import { CameraNetworkCard } from './CameraNetworkCard';
import { CampusCamerasCard, type CampusCameras } from './CampusCamerasCard';
import { ServerResourcesCard } from './ServerResourcesCard';
import { StreamsCard } from './StreamsCard';
import { Metric, clockTime } from './parts';
import {
  COVERAGE_RAG,
  RESOURCE_RAG,
  systemReference,
  type SystemAiStatus,
  type SystemCameraNetwork,
  type SystemResources,
  type SystemStreamStatus,
} from './systemTypes';

const CAMERA_PAGE_SIZE = 500;
/** Barcha kameralar — bekor qilinadigan sahifalab olish. */
async function fetchCamerasPaged(signal: AbortSignal): Promise<CameraConfig[]> {
  const all: CameraConfig[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await api.get<Page<CameraConfig>>(`/api/cameras${buildQuery({ page, pageSize: CAMERA_PAGE_SIZE })}`, undefined, { signal });
    all.push(...res.items);
    totalPages = res.totalPages;
    page += 1;
    if (signal.aborted) break;
  } while (page <= totalPages);
  return all;
}

/** Eng yomon hukm — umumiy holat shundan chiqadi. */
const RAG_ORDER: Record<Rag, number> = { qizil: 0, sariq: 1, yashil: 2, yoq: 3 };
function worst(verdicts: Rag[]): Rag {
  return verdicts.reduce<Rag>((acc, v) => (RAG_ORDER[v] < RAG_ORDER[acc] ? v : acc), 'yoq');
}

interface Props {
  tick: number;
  canAi: boolean;
  canCameras: boolean;
  canResync: boolean;
}

/**
 * "Holat" tabi — asboblar paneli.
 *
 * Yuqorida hujjat blanki (kim, nima, qaysi raqam ostida, qachon
 * o'lchangan), ostida qisqa o'lchov satri, keyin har biri alohida
 * o'lchov bloki: server, AI, oqimlar, kamera tarmog'i.
 */
export function SystemHealthTab({ tick, canAi, canCameras, canResync }: Props) {
  const resources = useLiveResource('resources', (signal) => api.get<SystemResources>('/api/system/resources', undefined, { signal }), tick);
  const ai = useLiveResource('ai', (signal) => api.get<SystemAiStatus>('/api/system/ai-status', undefined, { signal }), tick);
  const streams = useLiveResource('streams', (signal) => api.get<SystemStreamStatus>('/api/system/stream-status', undefined, { signal }), tick);
  const network = useLiveResource('network', (signal) => api.get<SystemCameraNetwork>('/api/system/camera-network', undefined, { signal }), tick);
  const modules = useLiveResource(canAi ? 'modules' : null, (signal) => api.get<AIModule[]>('/api/ai-modules', undefined, { signal }), tick);
  const campus = useLiveResource<CampusCameras>(
    canCameras ? 'campus' : null,
    async (signal) => {
      // fetchAllPages signal qabul qilmaydi: sahifadan chiqilganda ham
      // qolgan sahifalarni so'rab yotardi va 30 s lik yangilanishlar
      // ustma-ust tushib, kechikkan javob yangisini bosib ketardi.
      // Shu sabab sahifalab olish shu yerda, bekor qilinadigan qilib yozilgan.
      const [buildings, cameras] = await Promise.all([
        api.get<Building[]>('/api/buildings', undefined, { signal }),
        fetchCamerasPaged(signal),
      ]);
      return { buildings, cameras };
    },
    tick,
  );

  // Ma'lumot kelmasa plitkada shunchaki "—" turardi: yuklanmayaptimi, huquq
  // yo'qmi yoki haqiqatan nol — farqlanmasdi. Endi sababi izohda ko'rinadi.
  const failHint = (res: { data: unknown; error: string | null }) => (res.data || !res.error ? undefined : res.error);
  const r = resources.data;
  const security = r?.alerts.filter((a) => a.metric === 'security') ?? [];
  const net = network.data;
  const st = streams.data;

  const online = net && net.faolCameras > 0 ? (net.reachableCameras / net.faolCameras) * 100 : null;
  const streamCover = st && st.faolCameras > 0 ? (st.registeredStreams / st.faolCameras) * 100 : null;
  // Tugun umuman bo'lmasa `some()` false qaytarib, buzuq holat yashil ko'rinardi.
  const shardsBroken = st ? st.shards.length === 0 || st.shards.some((s) => !s.reachable) : false;

  const overall = worst([
    rag(r?.cpu ?? null, RESOURCE_RAG),
    rag(r?.ram ?? null, RESOURCE_RAG),
    rag(r?.disk ?? null, RESOURCE_RAG),
    rag(online, COVERAGE_RAG),
    shardsBroken ? 'qizil' : rag(streamCover, COVERAGE_RAG),
  ]);

  // O'lchov vaqti — eng so'nggi muvaffaqiyatli javob vaqti, render vaqti emas.
  const measuredAt = clockTime(
    Math.max(resources.updatedAt ?? 0, network.updatedAt ?? 0, streams.updatedAt ?? 0, ai.updatedAt ?? 0) || null,
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DocumentHeader
        org={branding.orgFullName}
        title="Tizim holati bayonnomasi"
        reference={systemReference('holat', net?.faolCameras ?? null)}
        generatedAt={measuredAt ?? undefined}
        readouts={[
          { label: 'Qamrov', value: branding.orgName, title: 'Butun kampus uskunalari' },
          {
            label: 'Kuzatuvda',
            value: net ? `${formatNumber(net.faolCameras)} kamera` : '—',
            title: 'Faol holatdagi kameralar soni',
          },
          { label: "O'lchov davri", value: 'har 30 s', title: "Holat har 30 soniyada qayta o'lchanadi" },
          { label: 'Umumiy holat', value: RAG_LABEL[overall], title: "Eng yomon ko'rsatkich bo'yicha" },
        ]}
      />

      {security.map((alert) => (
        <div key={alert.message} role="alert" className="flex items-start gap-3 border border-danger/40 bg-danger-soft px-3 py-2">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <MicroLabel className="!text-danger">Xavfsizlik ogohlantirishi</MicroLabel>
            <p className="text-[13px] text-fg">{alert.message}</p>
          </div>
        </div>
      ))}

      {/* Qisqa o'lchov satri: chegarasi bor ko'rsatkichlar svetofor bilan,
          chegarasiz sanoqlar betaraf. */}
      <IntelPanel title="Qisqa holat" code="SYS-000" bodyClassName="grid grid-cols-2 gap-px bg-border lg:grid-cols-5">
        <Metric
          label="Protsessor"
          value={r ? formatNumber(r.cpu, 1) : '—'}
          unit="%"
          verdict={rag(r?.cpu ?? null, RESOURCE_RAG)}
          hint={failHint(resources) ?? 'Joriy yuklama'}
        />
        <Metric
          label="Xotira"
          value={r ? formatNumber(r.ram, 1) : '—'}
          unit="%"
          verdict={rag(r?.ram ?? null, RESOURCE_RAG)}
          hint={failHint(resources) ?? 'Joriy yuklama'}
        />
        <Metric
          label="Disk"
          value={r ? formatNumber(r.disk, 1) : '—'}
          unit="%"
          verdict={rag(r?.disk ?? null, RESOURCE_RAG)}
          hint={failHint(resources) ?? "Band bo'lgan joy"}
        />
        <Metric
          label="Kameralar onlayn"
          value={net ? `${formatNumber(net.reachableCameras)} / ${formatNumber(net.faolCameras)}` : '—'}
          unit={online === null ? 'ta' : `${formatNumber(online, 0)}%`}
          verdict={rag(online, COVERAGE_RAG)}
          hint={net ? (net.offlineCameras > 0 ? `${net.offlineCameras} ta aloqada emas` : 'Hammasi aloqada') : failHint(network)}
        />
        <Metric
          label="Video oqimlar"
          value={st ? `${formatNumber(st.registeredStreams)} / ${formatNumber(st.faolCameras)}` : '—'}
          unit={streamCover === null ? 'ta' : `${formatNumber(streamCover, 0)}%`}
          verdict={shardsBroken ? 'qizil' : rag(streamCover, COVERAGE_RAG)}
          hint={st ? (st.shards.length === 0 ? 'Tugun topilmadi' : `${st.shards.filter((s) => s.reachable).length}/${st.shards.length} tugun ishlayapti`) : failHint(streams)}
        />
      </IntelPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <ServerResourcesCard resource={resources} />
        <AiRuntimeCard resource={ai} />
        <StreamsCard resource={streams} canResync={canResync} />
        <CameraNetworkCard resource={network} />
      </div>

      {(canCameras || canAi) && (
        <div className={canCameras && canAi ? 'grid gap-3 xl:grid-cols-3' : 'grid gap-3'}>
          {canCameras && (
            <div className={canAi ? 'min-w-0 xl:col-span-2' : 'min-w-0'}>
              <CampusCamerasCard resource={campus} />
            </div>
          )}
          {canAi && <AiModulesCard resource={modules} />}
        </div>
      )}

      <DocumentFooter
        note={
          <>
            Hujjat raqami <CodeText>{systemReference('holat', net?.faolCameras ?? null)}</CodeText>. Ko'rsatkichlar{' '}
            <CodeText>{measuredAt ?? '—'}</CodeText> holatiga. Svetofor: Y — talab bajarilgan, S — chegarada, Q — chora kerak.
            Chegarasi yo'q sanoqlar (jarayonlar, tugunlar) hukmsiz beriladi.
          </>
        }
      />
    </div>
  );
}
