import { describe, expect, it } from 'vitest';
import { consentCoverage, privacyReference, referenceSerial } from './reference';
import { RATE_RAG, rag } from '../../ui/rag';

describe('privacyReference', () => {
  it("har bo'lim o'z kodini oladi", () => {
    expect(privacyReference({ tab: 'umumiy' })).toBe('FERMI/MXF/UMM-0001');
    expect(privacyReference({ tab: 'shaxslar' })).toBe('FERMI/MXF/SHX-0001');
  });

  it('bir xil filtr va qidiruv — bir xil kod', () => {
    const parts = ['no_consent', 'karimov'];
    expect(privacyReference({ tab: 'shaxslar', parts })).toBe(privacyReference({ tab: 'shaxslar', parts: [...parts] }));
  });

  it("filtr o'zgarsa kod o'zgaradi", () => {
    expect(privacyReference({ tab: 'shaxslar', parts: ['no_consent'] })).not.toBe(
      privacyReference({ tab: 'shaxslar', parts: ['inactive'] }),
    );
  });

  it("bo'sh bo'laklar e'tiborga olinmaydi", () => {
    expect(referenceSerial(['', null, undefined])).toBe('0001');
    expect(referenceSerial(['inactive', ''])).toBe(referenceSerial(['inactive']));
  });
});

describe('consentCoverage', () => {
  it('biometrika bo\'lmasa — o\'lchanmagan', () => {
    expect(consentCoverage({ withBiometrics: 0, biometricsWithoutConsent: 0 })).toBeNull();
    expect(rag(consentCoverage({ withBiometrics: 0, biometricsWithoutConsent: 0 }), RATE_RAG)).toBe('yoq');
  });

  it('hammasida rozilik bor — 100%', () => {
    expect(consentCoverage({ withBiometrics: 40, biometricsWithoutConsent: 0 })).toBe(100);
    expect(rag(100, RATE_RAG)).toBe('yashil');
  });

  it("rozilik yo'qlar ulushini hisobga oladi", () => {
    expect(consentCoverage({ withBiometrics: 100, biometricsWithoutConsent: 20 })).toBe(80);
    expect(rag(80, RATE_RAG)).toBe('sariq');
  });

  it('hech kimda rozilik bo\'lmasa — 0% va qizil', () => {
    expect(consentCoverage({ withBiometrics: 10, biometricsWithoutConsent: 10 })).toBe(0);
    expect(rag(0, RATE_RAG)).toBe('qizil');
  });

  it("noto'g'ri sonlar 0–100 oralig'idan chiqmaydi", () => {
    expect(consentCoverage({ withBiometrics: 5, biometricsWithoutConsent: 9 })).toBe(0);
    expect(consentCoverage({ withBiometrics: 5, biometricsWithoutConsent: -3 })).toBe(100);
  });
});
