import { useEffect, useState } from 'react';
import { AlarmClock, Clock } from 'lucide-react';
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

const TONE = {
  ok: 'bg-slate-100 text-slate-600',
  soon: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-700',
} as const;

/** Hal qilish muddati (SLA): qolgan vaqt yoki "Muddati o'tgan". Qaror
 *  qilingan hodisada hech narsa ko'rsatilmaydi. */
export default function SlaBadge({ event, className = '' }: { event: Pick<AIEvent, 'status' | 'dueAt'>; className?: string }) {
  const active = !!event.dueAt && isOpenStatus(event.status);
  const now = useNow(active);
  const info = slaInfo(event, now);
  if (info.state === 'none') return null;
  const Icon = info.state === 'overdue' ? AlarmClock : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[info.state]} ${className}`}
      title={event.dueAt ? `Hal qilish muddati: ${event.dueAt.slice(0, 16).replace('T', ' ')}` : undefined}
    >
      <Icon size={11} aria-hidden="true" />
      {info.label}
    </span>
  );
}
