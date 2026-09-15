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
