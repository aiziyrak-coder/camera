import { ChevronDown, Cpu } from 'lucide-react';
import { Badge, Card, CardHeader, cn, formatNumber, type Tone } from '../../ui';
import { formatDuration } from '../../lib/integrationsApi';
import type { LiveResource } from '../situation/useLiveResource';
import { Metric, Recommendation, ResourceBody, StatusLine, formatServerTime } from './parts';
import { sweepLabel, type SweepStatus, type SystemAiStatus } from './systemTypes';

function sweepState(sweep: SweepStatus): { label: string; tone: Tone } {
  if (sweep.lastError) return { label: 'Xato', tone: 'danger' };
  if (sweep.lagging) return { label: 'Kechikmoqda', tone: 'warning' };
  if (sweep.paused) return { label: 'Pauzada', tone: 'info' };
  if (sweep.running) return { label: 'Ishlamoqda', tone: 'primary' };
  return { label: 'Normal', tone: 'success' };
}

const seconds = (value: number) => `${formatNumber(value, 1)} s`;

/** AI infratuzilma: GPU, rejalashtiruvchi, parallel slotlar va fon vazifalari. */
export function AiRuntimeCard({ resource }: { resource: LiveResource<SystemAiStatus> }) {
  return (
    <Card>
      <CardHeader title="AI infratuzilma" subtitle="GPU, rejalashtiruvchi va fon vazifalari" icon={Cpu} />
      <ResourceBody resource={resource} lines={6}>
        {(ai) => {
          const sweeps = ai.sweeps ?? [];
          const entrance = sweeps.find((s) => s.name === 'entrance_exit_attendance');
          const lagging = sweeps.filter((s) => s.lagging);
          const failing = sweeps.filter((s) => s.lastError);
          const paused = sweeps.filter((s) => s.paused);
          const gpuActive = ai.gpu.faceGpuActive || ai.gpu.objectGpuActive;
          // Rozet yashil bo'lib, yozuvda "CPU ishlatilmoqda" turishi mumkin edi: rang
          // face||object bo'yicha, yozuv esa faqat face bo'yicha hisoblanardi.
          const gpuParts = [ai.gpu.faceGpuActive ? 'yuz' : null, ai.gpu.objectGpuActive ? 'obyekt' : null].filter(Boolean);
          const gpuLabel = !ai.gpu.cudaAvailable
            ? "yo'q, CPU'da"
            : gpuActive
              ? `CUDA faol (${gpuParts.join(', ')})`
              : 'mavjud, CPU ishlatilmoqda';
          const tickAt = formatServerTime(ai.lastTick.finishedAt);
          const pollSeconds = ai.schedulerPollSeconds ?? 0;
          const gate = ai.faceInferenceGate;
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={gpuActive ? 'success' : 'neutral'} dot>
                  GPU: {gpuLabel}
                </Badge>
                <Badge tone="primary">Rejalashtiruvchi: {ai.schedulerEnabled ? 'parallel' : 'ketma-ket'}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric
                  label={pollSeconds > 0 ? `Oxirgi siklda (har ${formatDuration(pollSeconds)})` : 'Oxirgi siklda'}
                  value={`${formatNumber(ai.lastTick.modulesRan)} modul`}
                  hint={`${formatNumber(ai.lastTick.criticalRan)} kritik · ${formatNumber(ai.lastTick.standardRan)} standart${tickAt ? ` · ${tickAt}` : ''}`}
                />
                <Metric
                  label="Parallel slotlar"
                  value={`${ai.sweepSlots.inUse} / ${ai.sweepSlots.max}`}
                  // max = 0 bo'lsa 0 >= 0 rost bo'lib, bo'sh navbat sariq ko'rinardi.
                  tone={ai.sweepSlots.max > 0 && ai.sweepSlots.inUse >= ai.sweepSlots.max ? 'warning' : undefined}
                  hint="Band / jami"
                />
                <Metric
                  label="Yuz tanish navbati"
                  value={`${gate.inUse} / ${gate.max}`}
                  tone={gate.waiting > 0 ? 'warning' : undefined}
                  hint={gate.waiting > 0 ? `${gate.waiting} ta kutmoqda` : "Navbat yo'q"}
                />
              </div>

              <div className="space-y-1.5">
                {(ai.entranceWatchers ?? 0) > 0 ? (
                  <StatusLine tone="success">
                    Kirish/chiqish davomati: {ai.entranceWatchers} ta kamera doimiy kuzatuvda — har yangi kadr tahlil qilinadi
                  </StatusLine>
                ) : (
                  entrance && (
                    <StatusLine tone="success">
                      Kirish/chiqish davomati: har {formatDuration(entrance.intervalSeconds)}, oxirgisi {seconds(entrance.lastDurationSeconds)} davom etdi ({formatNumber(entrance.runs)} marta)
                    </StatusLine>
                  )
                )}
                {ai.lastTick.modulesRan > 0 && (
                  <StatusLine tone={ai.lastTick.skippedOverlap ? 'warning' : 'neutral'}>
                    Eng uzun modul {seconds(ai.lastTick.durationSeconds)} ishladi{ai.lastTick.skippedOverlap ? ' — ustma-ust tushgani uchun bir sikl o\'tkazib yuborildi' : ''}
                  </StatusLine>
                )}
                {paused.length > 0 && <StatusLine tone="info">Tirband soat — davomat ustuvor, pauzada: {paused.map((s) => sweepLabel(s.name)).join(', ')}</StatusLine>}
                {lagging.length > 0 && <StatusLine tone="warning">Kechikayotgan: {lagging.map((s) => sweepLabel(s.name)).join(', ')}</StatusLine>}
                {failing.length > 0 && <StatusLine tone="danger">Xato bergan: {failing.map((s) => sweepLabel(s.name)).join(', ')}</StatusLine>}
              </div>

              {sweeps.length > 0 && (
                <details className="group rounded-control border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium text-fg [&::-webkit-details-marker]:hidden">
                    Fon vazifalari ({sweeps.length})
                    <ChevronDown size={16} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="divide-y divide-border border-t border-border">
                    {sweeps.map((sweep) => {
                      const state = sweepState(sweep);
                      return (
                        <li key={sweep.name} className="flex items-center gap-3 px-3 py-2" title={sweep.lastError ?? undefined}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-fg">{sweepLabel(sweep.name)}</p>
                            <p className="truncate text-xs tabular-nums text-muted">
                              {sweep.tier === 'critical' ? 'Kritik' : 'Standart'} · har {formatDuration(sweep.intervalSeconds)} · oxirgisi {seconds(sweep.lastDurationSeconds)} ·{' '}
                              {formatNumber(sweep.runs)} marta
                              {sweep.failures > 0 ? ` · ${formatNumber(sweep.failures)} xato` : ''}
                              {formatServerTime(sweep.lastFinishedAt) ? ` · ${formatServerTime(sweep.lastFinishedAt)}` : ''}
                            </p>
                            {/* Xato matni faqat `title`da edi — sichqonchasiz va klaviaturada ko'rinmasdi. */}
                            {sweep.lastError && <p className="mt-0.5 break-words text-xs text-danger">Xato: {sweep.lastError}</p>}
                          </div>
                          <Badge tone={state.tone} dot className={cn('shrink-0')}>
                            {state.label}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}

              <Recommendation>{ai.gpu.recommendation}</Recommendation>
            </div>
          );
        }}
      </ResourceBody>
    </Card>
  );
}
