import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { branding } from '../../lib/branding';
import { cn } from '../../ui';

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function WallHeader({ online, updatedAt }: { online: boolean; updatedAt: Date | null }) {
  const now = useNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const upd = updatedAt
    ? `${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`
    : '—';
  return (
    <header className="flex shrink-0 items-center gap-[1.2em] px-[0.4em]">
      <img src="/favicon.svg" alt="" className="h-[2.8em] w-[2.8em] shrink-0" />
      <div className="min-w-0">
        <div className="truncate text-[1.7em] font-semibold leading-tight text-fg">
          {branding.orgName} <span className="font-normal text-muted">— Situatsion markaz</span>
        </div>
        <div className="truncate text-[0.85em] text-muted">Davomat va xavfsizlik — real vaqtda</div>
      </div>
      <div className="ml-auto flex items-center gap-[1.6em]">
        <div
          className={cn(
            'flex items-center gap-[0.5em] rounded-full px-[0.9em] py-[0.35em] text-[0.85em] font-medium',
            online ? 'bg-success-soft text-success' : 'wall-blink bg-danger-soft text-danger',
          )}
          title={`Yangilandi: ${upd}`}
        >
          {online ? <Wifi className="h-[1.1em] w-[1.1em]" /> : <WifiOff className="h-[1.1em] w-[1.1em]" />}
          {online ? `Ulangan · ${upd}` : `Ulanish uzildi · oxirgi ${upd}`}
        </div>
        <div className="text-right leading-none">
          <div className="text-[3em] font-semibold tabular-nums tracking-tight text-fg">
            {hh}:{mm}
            <span className="text-[0.5em] text-muted">:{ss}</span>
          </div>
          <div className="mt-[0.3em] text-[0.85em] text-muted">
            {WEEKDAYS[now.getDay()]}, {now.getDate()}-{MONTHS[now.getMonth()]} {now.getFullYear()}
          </div>
        </div>
      </div>
    </header>
  );
}
