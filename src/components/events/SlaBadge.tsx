import { useEffect, useState } from 'react';
import { AlarmClock, Clock } from 'lucide-react';
import { Badge, type Tone } from '../../ui';
import { isOpenStatus, slaInfo } from '../../lib/eventWorkflow';
import type { AIEvent } from '../../types';

const TICK_MS = 30_000;

/** Joriy vaqt — har 30 soniyada yangilanadi (qolgan vaqt sanog'i uchun). */
function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

const TONE: Record<'ok' | 'soon' | 'overdue', Tone> = {
  ok: 'neutral',
  soon: 'warning',
  overdue: 'danger',
};

/** Hal qilish muddati (SLA): qolgan vaqt yoki "Muddati o'tgan". Qaror
 *  qilingan hodisada hech narsa ko'rsatilmaydi. */
export default function SlaBadge({ event, className = '' }: { event: Pick<AIEvent, 'status' | 'dueAt'>; className?: string }) {
  const active = !!event.dueAt && isOpenStatus(event.status);
  const now = useNow(active);
  const info = slaInfo(event, now);
  if (info.state === 'none') return null;
  const Icon = info.state === 'overdue' ? AlarmClock : Clock;
  return (
    <Badge
      tone={TONE[info.state]}
      icon={Icon}
      className={className}
      title={event.dueAt ? `Hal qilish muddati: ${event.dueAt.slice(0, 16).replace('T', ' ')}` : undefined}
    >
      {info.label}
    </Badge>
  );
}
