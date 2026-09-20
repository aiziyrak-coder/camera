/* ------------------------------------------------------------------
 * Integratsiyalar sahifasining hujjat raqami.
 *
 * Shakl: TASHKILOT / HUJJAT / BO'LIM-TARTIB
 *   FERMI/INT/HMS-0001
 *
 * Raqam faqat ekran holatidan (bo'lim + filtr) hisoblanadi: vaqtga
 * ham, render tartibiga ham bog'liq emas.
 * ------------------------------------------------------------------ */

/** Tashkilot kodi — boshqa muassasaga o'rnatishda almashtiriladi. */
export const INTEGRATIONS_ORG_CODE = 'FERMI';

export type IntegrationsTab = 'hemis' | 'turniket' | 'jurnal' | 'biriktirilmagan';

const TAB_CODE: Record<IntegrationsTab, string> = {
  hemis: 'HMS',
  turniket: 'TRN',
  jurnal: 'JRN',
  biriktirilmagan: 'BRK',
};

/** Tanlovdan deterministik 4 xonali tartib raqami (0002–9999).
 *  Tanlov bo'sh bo'lsa — 0001. */
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
export function integrationsReference(
  input: {
    tab: IntegrationsTab;
    parts?: readonly (string | null | undefined)[];
  },
  org: string = INTEGRATIONS_ORG_CODE,
): string {
  return `${org.toUpperCase()}/INT/${TAB_CODE[input.tab]}-${referenceSerial(input.parts ?? [])}`;
}
