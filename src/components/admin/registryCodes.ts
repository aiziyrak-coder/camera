/**
 * Xizmat kodlari — hujjat raqamlari va qator indekslari.
 *
 * Qoida: KOD FAQAT HOLATDAN kelib chiqadi. Vaqt, tasodif yoki render
 * tartibi ishtirok etmaydi — shuning uchun bir xil filtrdagi ekran
 * bugun ham, ertaga ham bir xil raqam ostida chop etiladi va ikki
 * nusxani solishtirib bo'ladi.
 *
 * Hammasi sof funksiya: testda ham, ekranda ham bir xil natija.
 */

/** FNV-1a — qisqa, barqaror, 4 belgili o'n oltilik iz. */
export function refHash(parts: readonly (string | number | null | undefined)[]): string {
  const text = parts.map((part) => (part === null || part === undefined ? '' : String(part))).join('');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // 32-bitli ko'paytirish (Math.imul) — brauzerda ham, Node'da ham bir xil.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, '0').slice(-4);
}

/** Tartib raqamli birlik kodi: FAK-01, BIN-02, KAF-03, GUR-04. */
export function unitCode(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

/** Yozuv identifikatoridan qisqa kod: SH-9F2A17. UUID ham, sanoq ham bo'lishi mumkin. */
export function recordCode(prefix: string, id: string): string {
  const clean = (id ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const tail = clean.length >= 6 ? clean.slice(-6) : `${clean}${refHash([id])}`.slice(0, 6).padEnd(6, '0');
  return `${prefix}-${tail}`;
}

/** Hujjat raqami: BO'LIM/KESIM/IZ. Bo'sh qismlar tushib qoladi. */
export function buildReference(prefix: string, segments: readonly (string | null | undefined)[], parts: readonly (string | number | null | undefined)[]): string {
  const head = segments.filter((segment): segment is string => Boolean(segment && segment.trim())).map((segment) => segment.trim().toUpperCase());
  return [prefix, ...head, refHash(parts)].join('/');
}

/** Bino nomidan qisqa belgi: "2-o'quv korpusi" → "2OQ". */
export function buildingAbbr(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/[^0-9a-zA-Zʻʼ'’]/gu, '').toUpperCase();
  if (!clean) return '---';
  return clean.replace(/[ʻʼ'’]/gu, '').slice(0, 3).padEnd(3, '-');
}

/** Joylashuv kodi: bino belgisi + qavat. Qavat yo'q bo'lsa ochiq aytiladi. */
export function locationCode(building: string | null | undefined, floor: number | null | undefined): string {
  const floorPart = floor === null || floor === undefined ? 'Q--' : `Q${String(floor).padStart(2, '0')}`;
  return `${buildingAbbr(building)}·${floorPart}`;
}
