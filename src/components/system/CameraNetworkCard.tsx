import { Network } from 'lucide-react';
import { Card, CardHeader, ProgressBar, formatNumber } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, Recommendation, ResourceBody, StatusLine, formatServerTime } from './parts';
import type { SystemCameraNetwork } from './systemTypes';

/** Kamera tarmog'i: nechta faol kamera haqiqatan aloqada, oxirgi tekshiruv. */
export function CameraNetworkCard({ resource }: { resource: LiveResource<SystemCameraNetwork> }) {
  return (
    <Card>
      <CardHeader title="Kamera tarmog'i" subtitle="Faol kameralarning aloqa holati" icon={Network} />
      <ResourceBody resource={resource}>
        {(net) => {
          const sweptAt = formatServerTime(net.lastSweep.finishedAt);
          return (
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
              <Metric label="Aloqada emas" value={formatNumber(net.offlineCameras)} tone={net.offlineCameras > 0 ? 'danger' : 'success'} hint="Hozir javob bermayapti" />
              <Metric
                label="Uzoq vaqt offline"
                value={formatNumber(net.chronicOfflineCount)}
                tone={net.chronicOfflineCount > 0 ? 'danger' : undefined}
                // Qizil raqam nimani anglatishini aytmasa, operator nima qilishni bilmaydi.
                hint={net.offlineAlertMinutes ? `${net.offlineAlertMinutes} daqiqadan ortiq` : 'Uzluksiz offline'}
              />
              {/* "24 s" emas — ko'rsatkich oxirgi 24 SOATdagi ogohlantirishlar soni. */}
              <Metric
                label="Ogohlantirish (24 soat)"
                value={formatNumber(net.recentOfflineAlerts24h)}
                tone={net.recentOfflineAlerts24h > 0 ? 'warning' : undefined}
                hint="Offline haqida yuborilgan"
              />
            </div>
            <div className="space-y-1.5">
              <StatusLine tone={net.lastSweep.skippedOverlap ? 'warning' : 'neutral'}>
                {/* Tekshiruv sahifa yangilanishidan mustaqil ishlaydi — qachon bo'lgani aytilmasa,
                    eski natija jonli holat kabi o'qiladi. */}
                Oxirgi tekshiruv{sweptAt ? ` (${sweptAt})` : ''}: {formatNumber(net.lastSweep.reachable)}/{formatNumber(net.lastSweep.faolChecked)} javob berdi,{' '}
                {formatNumber(net.lastSweep.durationSeconds, 1)} s
                {net.lastSweep.skippedOverlap ? ' (ustma-ust tushib o\'tkazildi)' : ''}
                {net.healthIntervalSeconds ? ` · har ${net.healthIntervalSeconds} s da takrorlanadi` : ''}
              </StatusLine>
              {net.linkLocalIpCount > 0 && (
                <StatusLine tone="warning">{net.linkLocalIpCount} ta kamerada 169.254.x.x manzil — DHCP ishlamagan, IP sozlang</StatusLine>
              )}
            </div>
            <Recommendation>{net.recommendation}</Recommendation>
          </div>
          );
        }}
      </ResourceBody>
    </Card>
  );
}
