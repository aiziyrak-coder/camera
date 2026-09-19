import { Network } from 'lucide-react';
import { Card, CardHeader, ProgressBar, formatNumber } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, Recommendation, ResourceBody, StatusLine } from './parts';
import type { SystemCameraNetwork } from './systemTypes';

/** Kamera tarmog'i: nechta faol kamera haqiqatan aloqada, oxirgi tekshiruv. */
export function CameraNetworkCard({ resource }: { resource: LiveResource<SystemCameraNetwork> }) {
  return (
    <Card>
      <CardHeader title="Kamera tarmog'i" subtitle="Faol kameralarning aloqa holati" icon={Network} />
      <ResourceBody resource={resource}>
        {(net) => (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                <span className="text-muted">Onlayn</span>
                <span className="font-semibold tabular-nums text-fg">
                  {formatNumber(net.reachableCameras)} / {formatNumber(net.faolCameras)}
                </span>
              </div>
              <ProgressBar
                size="md"
                segments={[
                  { value: net.reachableCameras, tone: 'success', label: 'Onlayn' },
                  { value: net.offlineCameras, tone: 'danger', label: 'Aloqada emas' },
                ]}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Aloqada emas" value={net.offlineCameras} tone={net.offlineCameras > 0 ? 'danger' : 'success'} />
              <Metric label="Uzoq vaqt offline" value={net.chronicOfflineCount} tone={net.chronicOfflineCount > 0 ? 'danger' : undefined} />
              <Metric label="Ogohlantirish (24 s)" value={net.recentOfflineAlerts24h} tone={net.recentOfflineAlerts24h > 0 ? 'warning' : undefined} />
            </div>
            <div className="space-y-1.5">
              <StatusLine tone={net.lastSweep.skippedOverlap ? 'warning' : 'neutral'}>
                Oxirgi tekshiruv: {net.lastSweep.reachable}/{net.lastSweep.faolChecked} javob berdi, {formatNumber(net.lastSweep.durationSeconds, 1)} s
                {net.lastSweep.skippedOverlap ? ' (ustma-ust tushib o\'tkazildi)' : ''}
              </StatusLine>
              {net.linkLocalIpCount > 0 && (
                <StatusLine tone="warning">{net.linkLocalIpCount} ta kamerada 169.254.x.x manzil — DHCP ishlamagan, IP sozlang</StatusLine>
              )}
            </div>
            <Recommendation>{net.recommendation}</Recommendation>
          </div>
        )}
      </ResourceBody>
    </Card>
  );
}
