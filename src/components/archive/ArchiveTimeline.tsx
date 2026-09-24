import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ArchiveMarker, ArchiveRange } from '../../lib/archiveApi';
import { cn } from '../../ui';
import { clockLabel, fromFraction, hourTicks, toFraction, visibleRanges, type ViewWindow } from './timeline';

/**
 * Arxiv timeline'i — Milestone/Genetec uslubida: yozilgan oraliqlar
 * (ko'k), hodisa belgilari (og'irlik rangida), ko'rsatkich (hozir
 * ko'rilayotgan lahza). Bosish — o'sha lahzaga o'tish; ←/→ — 10 s.
 */

const SEVERITY_TONE: Record<ArchiveMarker['severity'], string> = {
  yuqori: 'bg-danger',
  "o'rta": 'bg-warning',
  past: 'bg-info',
};

export interface ArchiveTimelineProps {
  view: ViewWindow;
  ranges: readonly ArchiveRange[];
  events: readonly ArchiveMarker[];
  cursor: number | null;
  onSeek: (ms: number) => void;
  onEvent?: (marker: ArchiveMarker) => void;
}

export default function ArchiveTimeline({ view, ranges, events, cursor, onSeek, onEvent }: ArchiveTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const msAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return fromFraction((clientX - rect.left) / rect.width, view);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (cursor == null) return;
    if (event.key === 'ArrowLeft') onSeek(cursor - 10_000);
    else if (event.key === 'ArrowRight') onSeek(cursor + 10_000);
    else return;
    event.preventDefault();
  };

  const bars = visibleRanges(ranges, view);
  const ticks = hourTicks(view);
  const cursorPct = cursor != null ? toFraction(cursor, view) * 100 : null;

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Arxiv vaqt chizig'i"
        aria-valuemin={view.start}
        aria-valuemax={view.end}
        aria-valuenow={cursor ?? undefined}
        aria-valuetext={cursor != null ? clockLabel(cursor) : 'tanlanmagan'}
        onKeyDown={onKey}
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => setHover(msAt(event.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          const ms = msAt(event.clientX);
          if (ms != null) onSeek(ms);
        }}
        className="relative h-14 cursor-pointer overflow-hidden rounded-control border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      >
        {ticks.map((tick) => (
          <span
            key={tick.ms}
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${toFraction(tick.ms, view) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {bars.map((bar, index) => (
          <span
            key={index}
            className="absolute top-3 h-5 rounded-[3px] bg-primary/35"
            style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 0.2)}%` }}
            aria-hidden="true"
          />
        ))}
        {events.map((marker) => {
          const pct = toFraction(Date.parse(marker.at), view) * 100;
          if (pct < 0 || pct > 100) return null;
          return (
            <button
              key={marker.id}
              type="button"
              title={`${clockLabel(Date.parse(marker.at))} · ${marker.moduleName}${marker.personName ? ` · ${marker.personName}` : ''}`}
              aria-label={`${marker.moduleName}, ${clockLabel(Date.parse(marker.at))}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => (onEvent ? onEvent(marker) : onSeek(Date.parse(marker.at) - 10_000))}
              className={cn('absolute bottom-1 h-4 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-surface', SEVERITY_TONE[marker.severity])}
              style={{ left: `${pct}%` }}
            />
          );
        })}
        {cursorPct != null && cursorPct >= 0 && cursorPct <= 100 && (
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${cursorPct}%` }} aria-hidden="true">
            <span className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-fg" />
          </span>
        )}
        {hover != null && (
          <span
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-fg px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-surface"
            style={{ left: `${toFraction(hover, view) * 100}%` }}
          >
            {clockLabel(hover)}
          </span>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] tabular-nums text-muted" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.ms} className="absolute -translate-x-1/2" style={{ left: `${toFraction(tick.ms, view) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
