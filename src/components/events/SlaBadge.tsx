import { useMemo } from 'react';
import { AlarmClock, Clock } from 'lucide-react';
import { Badge, type Tone } from '../../ui';
import { isOpenStatus, slaInfo } from '../../lib/eventWorkflow';
import { useSharedNow } from '../../lib/sharedClock';
import type { AIEvent } from '../../types';

const TONE: Record<'ok' | 'soon' | 'overdue', Tone> = {
  ok: 'neutral',
  soon: 'warning',
  overdue: 'danger',
};

/** Hal qilish muddati (SLA): qolgan vaqt yoki "Muddati o'tgan". Qaror
 *  qilingan hodisada hech narsa ko'rsatilmaydi. */
export default function SlaBadge({ event, className = '' }: { event: Pick<AIEvent, 'status' | 'dueAt'>; className?: string }) {
  const active = !!event.dueAt && isOpenStatus(event.status);
  // Umumiy soat: ro'yxatdagi har bir yorliq o'z taymerini ochmaydi.
  const nowMs = useSharedNow(active);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
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
