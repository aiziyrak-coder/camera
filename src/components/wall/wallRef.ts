import type { WallConfig } from '../../lib/wallApi';

/**
 * Devor ekranining xizmat kodi: `FERMI/DEV/20260920/PNL-0001`.
 *   TASHKILOT / EKRAN / KUN / TARKIB-TARTIB
 *
 * Kod ekran SOZLAMASIDAN chiqadi (qaysi panellar, qaysi kameralar,
 * aylanish davri) va vaqtga bog'liq emas: bir xil sozlama — doim bir
 * xil kod. Shu bilan zaldagi ekranni telefondagi ko'rinish bilan
 * solishtirish mumkin: kodlar bir xil bo'lsa, tarkib ham bir xil.
 */

export const WALL_ORG_CODE = 'FERMI';

function serial(parts: readonly string[]): string {
  const key = parts.map((p) => p.trim()).filter(Boolean).join('|');
  if (!key) return '0001';
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String((hash % 9998) + 2).padStart(4, '0');
}

export function wallReference(input: { date: string | null | undefined; config: WallConfig; org?: string }): string {
  const org = (input.org ?? WALL_ORG_CODE).toUpperCase();
  const period = (input.date ?? '').replace(/-/g, '') || '00000000';
  const code = serial([
    [...input.config.panels].sort().join(''),
    [...input.config.cameras].sort().join(','),
    String(input.config.rotate),
  ]);
  return `${org}/DEV/${period}/PNL-${code}`;
}
