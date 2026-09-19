import { ShieldAlert, ShieldCheck, Video } from 'lucide-react';
import { useState } from 'react';
import type { WallHighEvent } from '../../lib/wallApi';
import { cn, EVENT_STATUS, TONE_TEXT, type EventStatusKey } from '../../ui';
import { WallPanel, WallRing } from './primitives';

function Snapshot({ url }: { url?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="h-[3.4em] w-[5em] shrink-0 overflow-hidden rounded-[0.5em] bg-surface-3">
      {url && !broken ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <Video className="h-[1.3em] w-[1.3em] opacity-60" />
        </div>
      )}
    </div>
  );
}

export function SecurityPanel({
  events,
  camerasOnline,
  camerasTotal,
  freshIds,
}: {
  events: WallHighEvent[];
  camerasOnline: number;
  camerasTotal: number;
  freshIds: ReadonlySet<string>;
}) {
  const camPct = camerasTotal > 0 ? (camerasOnline / camerasTotal) * 100 : null;
  return (
    <WallPanel area="E" title="Xavfsizlik" icon={<ShieldAlert />}>
      <div className="mb-[0.9em] flex shrink-0 items-center gap-[1em]">
        <WallRing value={camPct} size={5} label={`${camerasOnline}`} sublabel={`/ ${camerasTotal}`} />
        <div className="min-w-0">
          <div className="text-[1.05em] font-medium text-fg">Kameralar tarmoqda</div>
          <div className="text-[0.8em] text-muted">
            {camerasTotal - camerasOnline > 0 ? `${camerasTotal - camerasOnline} tasi javob bermayapti` : "Hammasi ishlayapti"}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={cn('text-[2em] font-semibold leading-none tabular-nums', events.length ? 'text-danger' : 'text-success')}>
            {events.length}
          </div>
          <div className="mt-[0.3em] text-[0.7em] text-muted">ochiq, yuqori</div>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[0.8em] bg-success-soft text-center text-success">
          <ShieldCheck className="mb-[0.4em] h-[2.2em] w-[2.2em]" />
          <div className="text-[0.95em] font-medium">Yuqori xavfli ochiq hodisa yo'q</div>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-[0.5em] overflow-hidden">
          {events.map((e) => {
            const st = EVENT_STATUS[e.status as EventStatusKey] ?? EVENT_STATUS.yangi;
            return (
              <li
                key={e.id}
                className={cn(
                  'flex shrink-0 items-center gap-[0.7em] rounded-[0.8em] border-l-[0.25em] border-danger bg-surface-2 p-[0.45em]',
                  freshIds.has(e.id) && 'wall-arrive wall-alert',
                )}
              >
                <Snapshot url={e.snapshotUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.95em] font-semibold text-fg">{e.moduleName}</div>
                  <div className="truncate text-[0.75em] text-muted">
                    {e.cameraName}
                    {e.building ? ` · ${e.building}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[1em] font-semibold tabular-nums text-fg">{e.time}</div>
                  <div className={cn('text-[0.7em]', TONE_TEXT[st.tone])}>{st.label}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WallPanel>
  );
}
