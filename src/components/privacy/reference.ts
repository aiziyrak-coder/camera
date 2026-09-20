/* ------------------------------------------------------------------
 * Maxfiylik sahifasining hujjat raqami.
 *
 * Shakl: TASHKILOT / HUJJAT / BO'LIM-TARTIB
 *   FERMI/MXF/UMM-0001
 *
 * Raqam faqat ekran holatidan (bo'lim + filtr + qidiruv) hisoblanadi:
 * vaqtga ham, render tartibiga ham bog'liq emas.
 * ------------------------------------------------------------------ */

/** Tashkilot kodi — boshqa muassasaga o'rnatishda almashtiriladi. */
export const PRIVACY_ORG_CODE = 'FERMI';

export type PrivacyTab = 'umumiy' | 'shaxslar';

const TAB_CODE: Record<PrivacyTab, string> = {
  umumiy: 'UMM',
  shaxslar: 'SHX',
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
export function privacyReference(
  input: {
    tab: PrivacyTab;
    parts?: readonly (string | null | undefined)[];
  },
  org: string = PRIVACY_ORG_CODE,
): string {
  return `${org.toUpperCase()}/MXF/${TAB_CODE[input.tab]}-${referenceSerial(input.parts ?? [])}`;
}

/** Rozilik qamrovi (%) — biometrikasi saqlangan shaxslarning qanchasida
 *  joriy rozilik bor. Biometrika umuman bo'lmasa — `null` ("o'lchanmagan"),
 *  chunki 0 dan 0 ni hisoblash "100%" degan yolg'on hukm berardi. */
export function consentCoverage(input: { withBiometrics: number; biometricsWithoutConsent: number }): number | null {
  if (!Number.isFinite(input.withBiometrics) || input.withBiometrics <= 0) return null;
  const covered = Math.max(0, input.withBiometrics - Math.max(0, input.biometricsWithoutConsent));
  return (covered / input.withBiometrics) * 100;
}
