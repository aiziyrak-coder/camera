import { Server } from 'lucide-react';
import { Card, CardHeader, ProgressRing } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, ResourceBody, StatusLine } from './parts';
import { resourceTone, type SystemResources } from './systemTypes';

const GAUGES = [
  { key: 'cpu', label: 'Protsessor' },
  { key: 'ram', label: 'Xotira' },
  { key: 'disk', label: 'Disk' },
] as const;

/** Server resurslari: CPU / RAM / disk, video jarayonlar va ogohlantirishlar. */
export function ServerResourcesCard({ resource }: { resource: LiveResource<SystemResources> }) {
  return (
    <Card>
      <CardHeader title="Server resurslari" subtitle="Joriy yuklama" icon={Server} />
      <ResourceBody resource={resource}>
        {(data) => {
          const alerts = data.alerts.filter((a) => a.metric !== 'security');
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {GAUGES.map((gauge) => (
                  <div key={gauge.key} className="flex flex-col items-center gap-1.5 rounded-control bg-surface-2/70 px-2 py-3">
                    <ProgressRing value={data[gauge.key]} tone={resourceTone(data[gauge.key])} size={68} ariaLabel={`${gauge.label}: ${data[gauge.key]}%`} />
                    <p className="text-xs font-medium text-fg">{gauge.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="ffmpeg jarayonlari" value={data.ffmpegProcessCount} />
                <Metric label="Oqim o'quvchilari" value={data.streamReaderCount} />
              </div>
              {alerts.length > 0 ? (
                <div className="space-y-1.5">
                  {alerts.map((alert) => (
                    <StatusLine key={`${alert.metric}-${alert.message}`} tone={alert.level === 'critical' ? 'danger' : 'warning'}>
                      {alert.message}
                    </StatusLine>
                  ))}
                </div>
              ) : GAUGES.some((g) => data[g.key] > 80) ? (
                <StatusLine tone="warning">
                  Yuqori yuklama: {GAUGES.filter((g) => data[g.key] > 80).map((g) => g.label.toLowerCase()).join(', ')}
                </StatusLine>
              ) : (
                <StatusLine tone="success">Resurslar me'yorida</StatusLine>
              )}
            </div>
          );
        }}
      </ResourceBody>
    </Card>
  );
}
