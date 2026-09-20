import { describe, expect, it } from 'vitest';
import { eventCode, eventsReference, type EventsReferenceInput } from './eventCodes';

const BASE: EventsReferenceInput = {
  view: 'navbat',
  severity: '',
  status: '',
  quick: '',
  moduleCode: '',
  building: '',
  from: '',
  to: '',
  search: '',
};

describe('eventCodes', () => {
  it('qator kodi identifikatordan barqaror', () => {
    expect(eventCode('3f2a17e0-1c4b-4a9d-9f21-7b6c5d4e3f2a')).toBe('HD-4E3F2A');
    expect(eventCode('abc')).toBe(eventCode('abc'));
  });

  it('hujjat raqami ko‘rinish va davrni ochiq aytadi', () => {
    expect(eventsReference(BASE)).toMatch(/^HOD\/NAVBAT\/BARCHA\/[0-9A-F]{4}$/);
    expect(eventsReference({ ...BASE, from: '2026-09-01', to: '2026-09-07' })).toContain('/2026-09-01_2026-09-07/');
  });

  it('filtr o‘zgarsa raqam ham o‘zgaradi, render esa ta’sir qilmaydi', () => {
    const once = eventsReference({ ...BASE, severity: 'yuqori' });
    expect(once).toBe(eventsReference({ ...BASE, severity: 'yuqori' }));
    expect(once).not.toBe(eventsReference(BASE));
    // Qidiruvdagi ortiqcha probel raqamni o'zgartirmaydi.
    expect(eventsReference({ ...BASE, search: ' qopqa ' })).toBe(eventsReference({ ...BASE, search: 'qopqa' }));
  });
});
