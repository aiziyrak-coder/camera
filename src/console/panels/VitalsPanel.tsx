import type { ReactNode } from 'react';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { isBackendConfigured } from '../../lib/config';
import { usePermissions } from '../../lib/permissions';
import { useLiveResource, useRefreshTicker } from '../../components/situation/useLiveResource';
import { MeasuredAt } from '../../components/system/parts';
import { SystemHealthTab } from '../../components/system/SystemHealthTab';
import { RESOURCE_RAG, type SystemResources } from '../../components/system/systemTypes';
import { RAG_LETTER, RAG_SOLID, RAG_TEXT, SkeletonText, cn, formatNumber, rag, type Rag } from '../../ui';
import type { LiveResource } from '../../components/situation/useLiveResource';
import Panel from '../Panel';

/**
 * TIZIM paneli.
 *
 * Yig'ilganda uchta o'lchov — protsessor, xotira, disk — har biri
 * svetofor hukmi bilan (chegara HAQIQATAN bor: 60% / 80%, systemTypes.ts)
 * va o'lchangan vaqt bilan. Yoyilganda — tizim sahifasidagi o'sha
 * kartalar (server, AI, oqimlar, kamera tarmog'i), qayta yozilmasdan.
 *
 * Eskirgan ma'lumot ogohlantirishi saqlanadi (yig'ilganda bir qator,
 * yoyilganda `ResourceBody`ning o'zi): fon yangilanishi xato bersa,
 * raqamlar jonli bo'lib ko'rinib qolmaydi.
 */

const GAUGES = [
  { key: 'cpu', label: 'Protsessor' },
  { key: 'ram', label: 'Xotira' },
  { key: 'disk', label: 'Disk' },
] as const;

/** Uchta o'lchovning eng yomoni — panel yorlig'idagi harf. */
function worstOf(data: SystemResources | null): Rag {
  if (!data) return 'yoq';
  const order: Rag[] = ['yashil', 'sariq', 'qizil'];
  return GAUGES.reduce<Rag>((worst, gauge) => {
    const verdict = rag(data[gauge.key], RESOURCE_RAG);
    return order.indexOf(verdict) > order.indexOf(worst) ? verdict : worst;
  }, 'yashil');
}

export default function VitalsPanel({
  expanded,
  onExpand,
  area,
}: {
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}) {
  const { role } = useAuth();
  const { can } = usePermissions();
  const allowed = can('systemSettings', role);
  const enabled = allowed && isBackendConfigured;

  // Ko'rinmayotgan oynada taymer yurmaydi (useRefreshTicker ichida).
  const { tick } = useRefreshTicker(30_000, enabled);
  const resources = useLiveResource<SystemResources>(
    enabled ? 'console-resources' : null,
    (signal) => api.get<SystemResources>('/api/system/resources', undefined, { signal }),
    tick,
  );

  const verdict = worstOf(resources.data);

  return (
    <Panel
      id="vitals"
      title="Tizim"
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={
        resources.data ? (
          <span className={cn('intel-code text-[11px] font-bold', RAG_TEXT[verdict])}>{RAG_LETTER[verdict]}</span>
        ) : null
      }
      full={enabled ? <SystemFull tick={tick} canResync={allowed} /> : undefined}
    >
      {!allowed ? (
        <p className="px-3 py-6 text-center text-[12px] text-subtle">Huquq yo‘q</p>
      ) : !isBackendConfigured ? (
        <p className="px-3 py-6 text-center text-[12px] text-subtle">Server ulanmagan</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <CompactBody resource={resources}>
            {(data) => (
              <ul className="px-3 py-1.5">
                {GAUGES.map((gauge) => {
                  const value = data[gauge.key];
                  const tone = rag(value, RESOURCE_RAG);
                  return (
                    <li key={gauge.key} className="flex items-center gap-2 py-1">
                      <span className="intel-micro w-[74px] shrink-0">{gauge.label}</span>
                      <span className="relative h-1.5 min-w-0 flex-1 rounded-[1px] bg-white/70" aria-hidden="true">
                        <span
                          className={cn('absolute inset-y-0 start-0 rounded-[1px]', RAG_SOLID[tone])}
                          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                        />
                      </span>
                      <span className={cn('intel-code w-12 shrink-0 text-end text-[12.5px] font-semibold', RAG_TEXT[tone])}>
                        {formatNumber(value, 1)}
                      </span>
                      <span className="intel-micro !text-subtle">%</span>
                      <span className={cn('intel-code w-3 text-end text-[11px] font-bold', RAG_TEXT[tone])} title={gauge.label}>
                        {RAG_LETTER[tone]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CompactBody>
          <span className="mt-auto px-3 pb-1.5">
            <MeasuredAt resource={resources} />
          </span>
        </div>
      )}
    </Panel>
  );
}

/**
 * Yig'ilgan paneldagi tana.
 *
 * `ResourceBody` o'rniga — u to'liq kartaga mo'ljallangan (katta xato
 * bloki, tugma) va yig'ilgan panelga sig'maydi. Xulqi esa bir xil:
 * ma'lumot bo'lsa ko'rsatiladi, fon yangilanishi xato bersa ESKIRGANI
 * aytiladi, ma'lumot umuman bo'lmasa — sabab, bitta qator.
 */
function CompactBody({ resource, children }: { resource: LiveResource<SystemResources>; children: (data: SystemResources) => ReactNode }) {
  if (resource.data) {
    return (
      <>
        {resource.error && (
          <p role="status" className="truncate px-3 pt-1.5 text-[11px] text-warning" title={resource.error}>
            Yangilanmadi — eski o‘lchov
          </p>
        )}
        {children(resource.data)}
      </>
    );
  }
  if (resource.error) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-[12px] text-subtle">Ma’lumot olinmadi</p>
        <button type="button" onClick={resource.reload} className="intel-micro mt-1 underline hover:!text-fg">
          Qayta urinish
        </button>
      </div>
    );
  }
  return (
    <div className="px-3 py-3">
      <SkeletonText lines={3} />
    </div>
  );
}

/** Yoyilgan tana — tizim sahifasidagi kartalar, siljiydigan qutida. */
function SystemFull({ tick, canResync }: { tick: number; canResync: boolean }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
      <SystemHealthTab tick={tick} canResync={canResync} />
    </div>
  );
}
