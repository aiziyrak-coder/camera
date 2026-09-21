import { api } from './apiClient';

export interface PersonLocation {
  id: string;
  fullName: string;
  type: 'talaba' | 'xodim';
  faculty: string | null;
  groupOrPosition: string;
  initials: string;
  cameraId: string | null;
  cameraName: string | null;
  building: string | null;
  floor: number | null;
  zone: string | null;
  lastSeenAt: string | null;
  currentlyVisible: boolean;
}

export function searchPersonLocation(query: string, signal?: AbortSignal): Promise<PersonLocation[]> {
  return api.post<PersonLocation[]>('/api/person-locator/search', { query, limit: 12 }, null, { signal });
}

export function locationText(person: PersonLocation): string | null {
  if (!person.cameraName) return null;
  const place = [person.building, person.floor == null ? null : `${person.floor}-qavat`, person.zone].filter(Boolean);
  return [person.cameraName, place.join(' · ')].filter(Boolean).join(' · ');
}
