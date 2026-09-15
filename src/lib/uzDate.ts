/** O'zbekcha sana yordamchilari. Sanalar "YYYY-MM-DD" satr sifatida
 *  yuritiladi va UTC yarim tunidagi Date bilan hisoblanadi — brauzer
 *  mintaqasi Toshkentdan farq qilsa ham kun siljimaydi. */

export const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];
export const UZ_WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
export const UZ_WEEKDAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const TASHKENT = 'Asia/Tashkent';

/** Toshkent bo'yicha bugungi sana — institut kuni brauzer soatiga bog'liq emas. */
export function todayInTashkent(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000) + 1;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('ru-RU');
}

/** "hozirgina", "12 daq oldin", "3 soat oldin", "2 kun oldin" — bir haftadan
 *  eskisi sana bilan. Kelajakdagi vaqt (soat farqi) "hozirgina" deb olinadi. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 45) return 'hozirgina';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daq oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} kun oldin`;
  return iso.slice(0, 10);
}

/** Davomiylik: 45 -> "45 daq", 150 -> "2,5 soat", 4320 -> "3 kun". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return '1 daq dan kam';
  if (minutes < 60) return `${Math.round(minutes)} daq`;
  const hours = minutes / 60;
  if (hours < 48) return `${(Math.round(hours * 10) / 10).toString().replace('.', ',')} soat`;
  return `${Math.round(hours / 24)} kun`;
}
