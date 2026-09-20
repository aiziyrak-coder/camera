/* ------------------------------------------------------------------
 * Bildirishnomalar sahifasining hujjat raqami.
 *
 * Shakl: TASHKILOT / HUJJAT / BO'LIM-TARTIB
 *   FERMI/BLD/QDL-0001
 *
 * Raqam faqat EKRAN HOLATIDAN kelib chiqadi (qaysi bo'lim, qanday
 * filtr) — vaqtga ham, render tartibiga ham bog'liq emas. Bir xil
 * tanlov — doim bir xil kod, shuning uchun havola yoki bosma nusxa
 * bo'yicha bir-birini topish mumkin.
 *
 * Hisobot sahifasidagi `documentReference` bilan bir xil qoidada
 * ishlaydi, lekin u yerdagi tur/bo'lim ro'yxatlari bu ekranga mos
 * kelmaydi — shuning uchun alohida, sof funksiya.
 * ------------------------------------------------------------------ */

/** Tashkilot kodi — boshqa muassasaga o'rnatishda almashtiriladi. */
export const NOTIFICATIONS_ORG_CODE = 'FERMI';

export type NotificationsTab = 'qoidalar' | 'kanallar' | 'jurnal';

const TAB_CODE: Record<NotificationsTab, string> = {
  qoidalar: 'QDL',
  kanallar: 'KNL',
  jurnal: 'JRN',
};

/** Tanlovdan deterministik 4 xonali tartib raqami (0002–9999).
 *  Tanlov bo'sh bo'lsa — 0001 (bo'limning asosiy hujjati). */
export function referenceSerial(parts: readonly (string | null | undefined)[]): string {
  const key = parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('|');
  if (!key) return '0001';
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String((hash % 9998) + 2).padStart(4, '0');
}

/** Joriy holat uchun hujjat raqami. */
export function notificationsReference(
  input: {
    tab: NotificationsTab;
    /** Jurnal filtrlari — boshqa bo'limlarda bo'sh. */
    parts?: readonly (string | null | undefined)[];
  },
  org: string = NOTIFICATIONS_ORG_CODE,
): string {
  return `${org.toUpperCase()}/BLD/${TAB_CODE[input.tab]}-${referenceSerial(input.parts ?? [])}`;
}
