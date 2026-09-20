import { describe, expect, it } from 'vitest';
import { ATTENDANCE_STATUS } from './status';

/**
 * Yagona atama qo'riqchisi.
 *
 * Bitta holat uchun oltita yorliq ishlatilardi ("Kech", "Kech qoldi",
 * "Kechikdi", "Kechikkan"...) — bir sahifada ikkitasi yonma-yon chiqardi.
 * Kanonik ro'yxat src/ui/status.ts'da; bu sinov eski variantlar qaytib
 * kelmasligini tekshiradi.
 */

// Uslub qo'llanmasi atamalarni namoyish qiladi — tekshiruvdan chetda.
const sources = import.meta.glob('../**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Taqiqlangan variant → o'rniga ishlatiladigan kanonik yorliq. */
const BANNED: RegExp[] = [/Kech qold/, /Kech qolgan/, /Kechikdi/, /Kechikkan(?! \/)/];

const SKIP = /StyleGuidePage\.tsx$|terminology\.test\.ts$/;

describe('atamalar', () => {
  it('kanonik yorliqlar kutilganidek', () => {
    expect(ATTENDANCE_STATUS.keldi.label).toBe('Keldi');
    expect(ATTENDANCE_STATUS.kech_keldi.label).toBe('Kech keldi');
    expect(ATTENDANCE_STATUS.kelmadi.label).toBe('Kelmadi');
    expect(ATTENDANCE_STATUS.nomalum.label).toBe("Ma'lumot yo'q");
  });

  it('"kech keldi" uchun eski variantlar ishlatilmaydi', () => {
    const canonical = ATTENDANCE_STATUS.kech_keldi.label;
    // Glob ishlayotganiga ishonch: aks holda sinov jimgina "o'tib" ketardi.
    expect(Object.keys(sources).length).toBeGreaterThan(200);
    const problems: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (SKIP.test(file)) continue;
      source.split('\n').forEach((line, index) => {
        // Faqat foydalanuvchiga ko'rinadigan matn: izohlar hisobga olinmaydi.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (BANNED.some((pattern) => pattern.test(code))) {
          problems.push(`${file}:${index + 1} — "${canonical}" ishlatilsin: ${code.trim()}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });
});
