import { describe, expect, it } from 'vitest';
import { notificationsReference, referenceSerial } from './reference';

describe('notificationsReference', () => {
  it('filtrsiz bo\'lim asosiy hujjat raqamini oladi', () => {
    expect(notificationsReference({ tab: 'qoidalar' })).toBe('FERMI/BLD/QDL-0001');
    expect(notificationsReference({ tab: 'kanallar' })).toBe('FERMI/BLD/KNL-0001');
    expect(notificationsReference({ tab: 'jurnal' })).toBe('FERMI/BLD/JRN-0001');
  });

  it('bir xil tanlov — doim bir xil kod (vaqtga bog\'liq emas)', () => {
    const parts = ['xato', 'telegram', '', 'qidiruv'];
    expect(notificationsReference({ tab: 'jurnal', parts })).toBe(notificationsReference({ tab: 'jurnal', parts: [...parts] }));
  });

  it('turli tanlov — turli kod', () => {
    const a = notificationsReference({ tab: 'jurnal', parts: ['xato'] });
    const b = notificationsReference({ tab: 'jurnal', parts: ['yuborildi'] });
    expect(a).not.toBe(b);
  });

  it('bo\'sh bo\'laklar tartib raqamiga ta\'sir qilmaydi', () => {
    expect(referenceSerial(['', null, undefined, '  '])).toBe('0001');
    expect(referenceSerial(['xato', '', null])).toBe(referenceSerial(['xato']));
  });

  it('tartib raqami doim 4 xonali', () => {
    for (const seed of ['a', 'bb', 'telegram|xato', 'juda-uzun-filtr-qiymati-123']) {
      expect(referenceSerial([seed])).toMatch(/^\d{4}$/);
    }
  });

  it('tashkilot kodi almashtiriladi', () => {
    expect(notificationsReference({ tab: 'qoidalar' }, 'test')).toBe('TEST/BLD/QDL-0001');
  });
});
