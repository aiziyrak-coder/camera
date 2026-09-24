import { api, buildQuery, type CallOptions } from './apiClient';

/** Kunduzgi notanish yuzlar (camera-api/app/routers/unknown_sightings.py). */

export type SightingStatus = 'kutilmoqda' | 'talaba' | 'begona' | 'otkazildi';

export interface Sighting {
  id: string;
  day: string;
  cameraId: string | null;
  cameraName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Bugun necha marta ko'ringan — ko'p bo'lsa, ehtimol talaba. */
  hits: number;
  cropUrl: string | null;
  facePx: number;
  closestSimilarity: number | null;
  status: SightingStatus;
  personId: string | null;
  personName: string | null;
}

export interface SightingList {
  items: Sighting[];
  total: number;
  pending: number;
  day: string;
}

export interface ResolveResult {
  item: Sighting;
  message: string;
}

export function getSightings(
  params: { sana?: string; holat?: SightingStatus | 'hammasi'; limit?: number },
  opts: CallOptions = {},
): Promise<SightingList> {
  return api.get<SightingList>(`/api/notanishlar${buildQuery(params)}`, undefined, opts);
}

export function assignSighting(id: string, personId: string): Promise<ResolveResult> {
  return api.post<ResolveResult>(`/api/notanishlar/${encodeURIComponent(id)}/talaba`, { personId });
}

export function markStranger(id: string): Promise<ResolveResult> {
  return api.post<ResolveResult>(`/api/notanishlar/${encodeURIComponent(id)}/begona`, {});
}

export function dismissSighting(id: string): Promise<ResolveResult> {
  return api.post<ResolveResult>(`/api/notanishlar/${encodeURIComponent(id)}/otkazish`, {});
}

/** "11:42" — Toshkent vaqtida. */
export function sightingTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tashkent',
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** Ro'yxatdagi eng yaqin odamga o'xshashlik — operatorga ishora.
 *  Yuqori bo'lsa: ehtimol tanish odam, lekin yomon burchakdan. */
export function likelihoodHint(similarity: number | null): string | null {
  if (similarity === null) return null;
  if (similarity >= 0.35) return 'Kimgadir o‘xshaydi';
  return null;
}
