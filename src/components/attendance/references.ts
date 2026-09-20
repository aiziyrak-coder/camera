/**
 * Hujjat raqamlari va xizmat kodlari — SOF funksiyalar.
 *
 * Qoida: kod faqat sahifaning holatidan chiqadi (id, sana, tartib raqami).
 * Hech qachon `Date.now()` yoki render tartibidan foydalanilmaydi — bir xil
 * havola bir xil raqamni beradi, chop etilgan qog'oz bilan ekran mos keladi.
 *
 * Shakl: `<BO'LIM>-<TANLOV>/<DAVR>` — masalan `TAL-FAK/20.09.2026` emas,
 * `TAL-FAK/2026-09-20`: hujjat raqamida sana ISO ko'rinishida qoladi, chunki
 * u saralanadigan va bir ma'noli.
 */

/** Ro'yxatdagi o'rinni xizmat kodiga aylantiradi: `FAK-01`, `KAF-03`.
 *  Tartib — serverdan kelgan ro'yxat tartibi, shuning uchun bitta hujjat
 *  ichida kod o'zgarmaydi (ekranda saralash kodni ko'chirmaydi). */
export function unitCode(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

/** Bo'linma turiga qarab kod boshi: kafedra → KAF, dekanat → DEK,
 *  bo'lim → BOL, lavozim (bo'linmasi yozilmagan) → LAV. */
export function unitKindPrefix(kind: string): string {
  switch (kind) {
    case 'kafedra':
      return 'KAF';
    case 'dekanat':
      return 'DEK';
    case 'bolim':
      return 'BOL';
    case 'lavozim':
      return 'LAV';
    default:
      return 'BOL';
  }
}

/** Uzun/ixtiyoriy identifikatorni qisqa, bir ma'noli belgiga aylantiradi.
 *  Harf va raqamlar saqlanadi, qolgani chiziqcha bo'ladi; bo'sh bo'lsa
 *  `YOQ` qaytadi (havolada id yo'q holati ham raqamga tushsin). */
export function idToken(raw: string | null | undefined, max = 8): string {
  const cleaned = (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return 'YOQ';
  return cleaned.slice(0, max).replace(/-+$/, '') || 'YOQ';
}

/** Bitta kun uchun hujjat raqami: `TAL-FAK/2026-09-20`. */
export function dayReference(section: string, date: string): string {
  return `${section}/${date}`;
}

/** Davr uchun hujjat raqami: `SHX-P1/2026-09-01..2026-09-20`.
 *  Bir kunlik davr qisqartiriladi — `..` takrori ma'nosiz. */
export function periodReference(section: string, from: string, to: string): string {
  return from === to ? `${section}/${from}` : `${section}/${from}..${to}`;
}
