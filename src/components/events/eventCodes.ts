import { buildReference, recordCode } from '../admin/registryCodes';

/** Hodisa jurnalidagi qator kodi: HD-4E3F2A. */
export function eventCode(id: string): string {
  return recordCode('HD', id);
}

export interface EventsReferenceInput {
  view: string;
  severity: string;
  status: string;
  quick: string;
  moduleCode: string;
  building: string;
  from: string;
  to: string;
  search: string;
}

/**
 * Jurnal varag'ining raqami: HOD/NAVBAT/2026-09-01/1A2B.
 * Faqat ko'rinish va filtrlardan hisoblanadi — bir xil so'rov bir xil
 * raqam ostida chop etiladi.
 */
export function eventsReference(input: EventsReferenceInput): string {
  const period = input.from || input.to ? `${input.from || '…'}_${input.to || '…'}` : 'BARCHA';
  return buildReference('HOD', [input.view, period], [
    input.severity,
    input.status,
    input.quick,
    input.moduleCode,
    input.building,
    input.search.trim(),
  ]);
}
