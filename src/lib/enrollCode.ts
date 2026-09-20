/**
 * Guruh kodi — ochiq ro'yxatdan o'tish sahifasida.
 *
 * Kod 6 belgidan iborat va unda O, 0, I, 1 YO'Q: kod og'zaki aytiladi
 * va chop etilgan kartadan ko'chiriladi, aynan shu to'rt belgi esa eng
 * ko'p chalkashtiriladi.
 *
 * Alifbo va uzunlik server bilan AYNAN bir xil
 * (camera-api/app/services/enrollment_code.py) — aks holda sahifa
 * to'g'ri kodni qabul qilmay, odamni "kodingiz noto'g'ri" deb
 * to'xtatib qo'yardi.
 */
export const ENROLL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ENROLL_CODE_LENGTH = 6;

/**
 * Kiritilgan kodni tozalaydi: katta harfga o'tkazadi, alifboda yo'q
 * belgilarni (bo'sh joy, chiziqcha, tasodifiy nuqta) tashlaydi va
 * uzunligini cheklaydi.
 *
 * Tozalash mijozda ham bajariladi, chunki maydonga kod qo'lda yoki
 * ko'chirib qo'yiladi va bo'sh joy bilan kelishi odatiy hol.
 */
export function normalizeEnrollCode(value: string | null | undefined): string {
  if (!value) return '';
  let out = '';
  for (const ch of value.toUpperCase()) {
    if (ENROLL_CODE_ALPHABET.includes(ch)) {
      out += ch;
      if (out.length === ENROLL_CODE_LENGTH) break;
    }
  }
  return out;
}

/** To'liq terilganmi — tugmani faollashtirish uchun. */
export function isEnrollCodeComplete(value: string | null | undefined): boolean {
  return normalizeEnrollCode(value).length === ENROLL_CODE_LENGTH;
}
