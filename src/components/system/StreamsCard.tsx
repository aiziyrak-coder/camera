import { useState } from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { Badge, Button, Card, CardHeader, ConfirmDialog, formatNumber, useToast } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, Recommendation, ResourceBody, StatusLine } from './parts';
import type { SystemStreamStatus } from './systemTypes';

/** Video oqimlar (MediaMTX): shardlar, ro'yxatdan o'tgan oqimlar, qayta sinxronlash. */
export function StreamsCard({ resource, canResync }: { resource: LiveResource<SystemStreamStatus>; canResync: boolean }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  async function resync() {
    const res = await api.post<{ synced: number; failed: number }>('/api/system/resync-streams', {});
    setConfirm(false);
    toast.success(`${res.synced} ta oqim sinxronlandi${res.failed ? `, ${res.failed} ta xato` : ''}`);
    resource.reload();
  }

  return (
    <Card>
      <CardHeader
        title="Video oqimlar"
        subtitle="MediaMTX shluzi"
        icon={Radio}
        actions={
          canResync ? (
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setConfirm(true)}>
              Qayta sinxronlash
            </Button>
          ) : undefined
        }
      />
      <ResourceBody resource={resource}>
        {(data) => {
          const missing = Math.max(0, data.faolCameras - data.registeredStreams);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Ro'yxatdagi oqimlar"
                  value={`${formatNumber(data.registeredStreams)} / ${formatNumber(data.faolCameras)}`}
                  tone={missing > 0 ? 'warning' : 'success'}
                  hint={missing > 0 ? `${missing} ta kamera oqimsiz` : 'Barcha faol kameralar'}
                />
                <Metric label="Tugunlar" value={data.shardingEnabled ? `${data.shardCount} shard` : '1 tugun'} />
              </div>
              {/* Ro'yxat bo'sh bo'lsa ilgari bo'm-bo'sh ramka qolardi — sabab aytilmasdi. */}
              {data.shards.length === 0 ? (
                <StatusLine tone="danger">MediaMTX tugunlari topilmadi — video oqimlar ishlamaydi, shluz sozlamalarini tekshiring</StatusLine>
              ) : (
                <ul className="divide-y divide-border rounded-control border border-border">
                  {data.shards.map((shard) => (
                    <li key={shard.index} className="px-3 py-2 text-[13px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-fg">Tugun {shard.index + 1}</span>
                        <span className="flex items-center gap-2 tabular-nums text-muted">
                          {formatNumber(shard.pathCount)} oqim · {formatNumber(shard.assignedCameras)} kamera
                          <Badge tone={shard.reachable ? 'success' : 'danger'} dot>
                            {shard.reachable ? 'Ishlayapti' : "Aloqa yo'q"}
                          </Badge>
                        </span>
                      </div>
                      {/* Qizil rozetning sababi faqat `title`da edi — ko'rinmas tushuntirish. */}
                      {shard.error && <p className="mt-0.5 break-words text-xs text-danger">{shard.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <Recommendation>{data.recommendation}</Recommendation>
            </div>
          );
        }}
      </ResourceBody>
      <ConfirmDialog
        open={confirm}
        tone="primary"
        title="Oqimlarni qayta sinxronlash"
        message="Barcha faol kameralar oqimlari MediaMTX'da qayta ro'yxatdan o'tkaziladi. Videodevorda bir necha soniya uzilish bo'lishi mumkin."
        confirmLabel="Sinxronlash"
        onCancel={() => setConfirm(false)}
        onConfirm={resync}
      />
    </Card>
  );
}
