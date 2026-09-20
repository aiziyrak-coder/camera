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
  highOpen,
  freshIds,
}: {
  events: WallHighEvent[];
  camerasOnline: number;
  /** Faol kameralar (maxraj) — ataylab o'chirilganlari kirmaydi. */
  camerasTotal: number;
  /** Ochiq "yuqori" hodisalarning to'liq soni; ro'yxat 5 ta bilan cheklangan. */
  highOpen?: number;
  freshIds: ReadonlySet<string>;
}) {
  const camPct = camerasTotal > 0 ? (camerasOnline / camerasTotal) * 100 : null;
  // Server ba'zan aloqadagi kameralarni faol ro'yxatdan ko'proq beradi
  // (kamera o'chirilgan, lekin oqim hali tirik): manfiy son chiqmasin.
  const camerasOffline = Math.max(0, camerasTotal - camerasOnline);
  // Ro'yxat 5 ta bilan cheklangan: sonni ro'yxat uzunligidan olish
  // 12 ta ochiq hodisani ekranda "5" qilib ko'rsatardi.
  const openCount = Math.max(highOpen ?? 0, events.length);
  return (
    <WallPanel area="E" title="Xavfsizlik" icon={<ShieldAlert />}>
      <div className="mb-[0.9em] flex shrink-0 items-center gap-[1em]">
        <WallRing value={camPct} size={5} label={`${camerasOnline}`} sublabel={`/ ${camerasTotal}`} />
        <div className="min-w-0">
          <div className="text-[1.05em] font-medium text-fg">Kameralar tarmoqda</div>
          <div className="text-[0.8em] text-muted">
            {camerasTotal === 0
              ? "Faol kamera yo'q"
              : camerasOffline > 0
                ? `${camerasTotal} ta faol kameradan ${camerasOffline} tasi javob bermayapti`
                : `${camerasTotal} ta faol kameraning hammasi ishlayapti`}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={cn('text-[2em] font-semibold leading-none tabular-nums', openCount ? 'text-danger' : 'text-success')}>
            {openCount}
          </div>
          {/* "ochiq, yuqori" nimaning soni ekani tushunarsiz edi. */}
          <div className="mt-[0.3em] text-[0.7em] text-muted">ochiq yuqori xavfli hodisa</div>
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
          {openCount > events.length && (
            <li className="shrink-0 text-center text-[0.75em] text-muted">
              yana {openCount - events.length} ta ochiq hodisa — ro'yxatda so'nggi {events.length} tasi
            </li>
          )}
        </ul>
      )}
    </WallPanel>
  );
}
