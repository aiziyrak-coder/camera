import { Server } from 'lucide-react';
import { Card, CardHeader, ProgressRing, TONE_TEXT, cn, formatNumber } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, ResourceBody, StatusLine } from './parts';
import {
  RESOURCE_DANGER_AT,
  RESOURCE_TONE_LABEL as TONE_LABEL,
  RESOURCE_TONE_NOTE as TONE_NOTE,
  RESOURCE_WARN_AT,
  resourceTone,
  type SystemResources,
} from './systemTypes';

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
          // Chegara resourceTone bilan bir xil bo'lishi shart — avval bu yerda 80 qo'lda yozilgandi.
          const hot = GAUGES.filter((g) => resourceTone(data[g.key]) === 'danger');
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {GAUGES.map((gauge) => {
                  const value = data[gauge.key];
                  const tone = resourceTone(value);
                  return (
                    <div key={gauge.key} className="flex flex-col items-center gap-1.5 rounded-control bg-surface-2/70 px-2 py-3" title={TONE_NOTE[tone]}>
                      <ProgressRing value={value} tone={tone} size={68} ariaLabel={`${gauge.label}: ${value}% — ${TONE_NOTE[tone]}`} />
                      <p className="text-xs font-medium text-fg">{gauge.label}</p>
                      {/* Rang yolg'iz qolmasin: sariq/qizil halqa nimani anglatishi yozib qo'yiladi. */}
                      <p className={cn('text-[11px] font-medium leading-tight', TONE_TEXT[tone])}>{TONE_LABEL[tone]}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-subtle">Me'yor — {RESOURCE_WARN_AT}% gacha, diqqat — {RESOURCE_WARN_AT}–{RESOURCE_DANGER_AT}%, yuqori yuklama — {RESOURCE_DANGER_AT}% dan ortiq.</p>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="ffmpeg jarayonlari" value={formatNumber(data.ffmpegProcessCount)} hint="Video kodlash jarayonlari" />
                <Metric label="Oqim o'quvchilari" value={formatNumber(data.streamReaderCount)} hint="AI tahlil qilayotgan oqimlar" />
              </div>
              {alerts.length > 0 ? (
                <div className="space-y-1.5">
                  {alerts.map((alert) => (
                    <StatusLine key={`${alert.metric}-${alert.message}`} tone={alert.level === 'critical' ? 'danger' : 'warning'}>
                      {alert.message}
                    </StatusLine>
                  ))}
                </div>
              ) : hot.length > 0 ? (
                <StatusLine tone="danger">
                  Yuqori yuklama: {hot.map((g) => g.label.toLowerCase()).join(', ')} — {RESOURCE_DANGER_AT}% dan oshdi
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
