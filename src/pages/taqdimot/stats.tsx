/* Taqdimotdagi jonli raqamlar: /api/public/taqdimot (kirishsiz, faqat umumiy sonlar).
 * Server javob bermasa — oxirgi o'lchangan qiymatlar ko'rinadi. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { config } from '../../lib/config';

export interface Cov {
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  awaiting: number;
  percent: number | null;
}

export interface Stats {
  generatedAt: string | null;
  talaba: Cov;
  xodim: Cov;
  faceVectors: number;
  photos: number;
  selfRegistered: number;
  byFaculty: { faculty: string; total: number; confirmed: number; percent: number | null }[];
  byCourse: { course: string; total: number; confirmed: number; percent: number | null }[];
  daily: { date: string; count: number }[];
  hemis: { configured: boolean; intervalHours: number; lastSuccessAt: string | null };
  parents: { students: number; telegramLinked: number; weekSent: number };
  live: boolean;
}

/** 2026-11-13 22:01 holati. */
export const FALLBACK: Stats = {
  generatedAt: null,
  talaba: { total: 7419, confirmed: 7141, pending: 0, missing: 278, awaiting: 0, percent: 96.3 },
  xodim: { total: 962, confirmed: 902, pending: 0, missing: 60, awaiting: 0, percent: 93.8 },
  faceVectors: 8043,
  photos: 22207,
  selfRegistered: 644,
  byFaculty: [
    { faculty: 'Davolash ishi fakulteti', total: 2236, confirmed: 2196, percent: 98.2 },
    { faculty: 'Pediatriya fakulteti', total: 1768, confirmed: 1758, percent: 99.4 },
    { faculty: 'Xalqaro fakultet', total: 1624, confirmed: 1604, percent: 98.8 },
    { faculty: 'Tibbiy profilaktika va jamoat salomatligi fakulteti', total: 1166, confirmed: 1156, percent: 99.1 },
    { faculty: 'Magistratura boʻlimi', total: 611, confirmed: 415, percent: 67.9 },
  ],
  byCourse: [
    { course: '1-kurs', total: 1802, confirmed: 1765, percent: 97.9 },
    { course: '2-kurs', total: 1530, confirmed: 1522, percent: 99.5 },
    { course: '3-kurs', total: 1333, confirmed: 1331, percent: 99.8 },
    { course: '4-kurs', total: 985, confirmed: 983, percent: 99.8 },
    { course: '5-kurs', total: 879, confirmed: 876, percent: 99.7 },
    { course: '6-kurs', total: 458, confirmed: 451, percent: 98.5 },
  ],
  daily: [],
  hemis: { configured: true, intervalHours: 24, lastSuccessAt: null },
  parents: { students: 7419, telegramLinked: 0, weekSent: 0 },
  live: false,
};

const StatsContext = createContext<Stats>(FALLBACK);

export function useStats(): Stats {
  return useContext(StatsContext);
}

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`${config.apiBaseUrl}/api/public/taqdimot`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: Omit<Stats, 'live'>) => {
          if (!cancelled && data && data.talaba) setStats({ ...FALLBACK, ...data, live: true });
        })
        .catch(() => undefined);
    }
    load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);
  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>;
}

/** Ikkala tur birga. */
export function totals(s: Stats) {
  const total = s.talaba.total + s.xodim.total;
  const confirmed = s.talaba.confirmed + s.xodim.confirmed;
  const missing = s.talaba.missing + s.talaba.pending + s.xodim.missing + s.xodim.pending;
  return { total, confirmed, missing, awaiting: s.talaba.awaiting + s.xodim.awaiting, ratio: total ? confirmed / total : 0 };
}

export function fmt(n: number): string {
  return n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

export function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
