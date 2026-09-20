import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { branding } from '../../lib/branding';
import { todayInTashkent } from '../../lib/uzDate';
import { cn } from '../../ui';

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/** Soat/sana — institut vaqti (Toshkent) bo'yicha: devor ekrani
 *  turgan kompyuterning vaqt mintaqasi noto'g'ri sozlangan bo'lsa ham
 *  ekrandagi kun serverdagi kun bilan bir xil bo'ladi. */
export function tashkentClock(now: Date): { hh: string; mm: string; ss: string; dateLabel: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const iso = todayInTashkent(now);
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    hh: pick('hour') === '24' ? '00' : pick('hour'),
    mm: pick('minute'),
    ss: pick('second'),
    dateLabel: `${WEEKDAYS[weekday]}, ${d}-${MONTHS[m - 1]} ${y}`,
  };
}

function tashkentHhmm(value: Date): string {
  const { hh, mm } = tashkentClock(value);
  return `${hh}:${mm}`;
}

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
  const { hh, mm, ss, dateLabel } = tashkentClock(now);
  const upd = updatedAt ? tashkentHhmm(updatedAt) : '—';
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
          <div className="mt-[0.3em] text-[0.85em] text-muted">{dateLabel}</div>
        </div>
      </div>
    </header>
  );
}
