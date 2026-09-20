import { describe, expect, it } from 'vitest';
import { integrationsReference, referenceSerial } from './reference';

describe('integrationsReference', () => {
  it("har bo'lim o'z kodini oladi", () => {
    expect(integrationsReference({ tab: 'hemis' })).toBe('FERMI/INT/HMS-0001');
    expect(integrationsReference({ tab: 'turniket' })).toBe('FERMI/INT/TRN-0001');
    expect(integrationsReference({ tab: 'jurnal' })).toBe('FERMI/INT/JRN-0001');
    expect(integrationsReference({ tab: 'biriktirilmagan' })).toBe('FERMI/INT/BRK-0001');
  });

  it("bir xil filtr — bir xil kod", () => {
    const parts = ['dev-1', 'true', '', '2026-09-01', '2026-09-20'];
    expect(integrationsReference({ tab: 'jurnal', parts })).toBe(integrationsReference({ tab: 'jurnal', parts: [...parts] }));
  });

  it("filtr o'zgarsa kod o'zgaradi", () => {
    expect(integrationsReference({ tab: 'jurnal', parts: ['dev-1'] })).not.toBe(integrationsReference({ tab: 'jurnal', parts: ['dev-2'] }));
  });

  it("bo'sh bo'laklar e'tiborga olinmaydi", () => {
    expect(referenceSerial([null, undefined, '', '   '])).toBe('0001');
    expect(referenceSerial(['7', ''])).toBe(referenceSerial(['7']));
  });

  it('tartib raqami doim 4 xonali', () => {
    for (const seed of ['x', 'dev-1|true', '90']) {
      expect(referenceSerial([seed])).toMatch(/^\d{4}$/);
    }
  });
});
