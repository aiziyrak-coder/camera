import { api, buildQuery, type CallOptions } from './apiClient';
import { config } from './config';

/** Video arxivi (camera-api/app/routers/archive.py). */

export interface ArchiveRange {
  start: string;
  end: string;
}

export interface ArchiveMarker {
  id: string;
  at: string;
  moduleName: string;
  severity: 'past' | "o'rta" | 'yuqori';
  status: string;
  personName?: string | null;
  hasClip: boolean;
}

export interface ArchiveDay {
  cameraId: string;
  cameraName: string;
  day: string;
  recording: boolean;
  retentionHours: number;
  ranges: ArchiveRange[];
  events: ArchiveMarker[];
}

export interface ArchiveLink {
  url: string;
  downloadUrl: string;
  start: string;
  duration: number;
  expiresAt: string;
}

export function getArchiveDay(cameraId: string, sana: string, opts: CallOptions = {}): Promise<ArchiveDay> {
  return api.get<ArchiveDay>(`/api/arxiv/${encodeURIComponent(cameraId)}/kun${buildQuery({ sana })}`, undefined, opts);
}

export function getArchiveLink(cameraId: string, start: Date, duration: number): Promise<ArchiveLink> {
  return api.get<ArchiveLink>(
    `/api/arxiv/${encodeURIComponent(cameraId)}/havola${buildQuery({ start: start.toISOString(), duration })}`,
  );
}

/** Backend nisbiy yo'l qaytaradi; API boshqa domenda bo'lishi mumkin. */
export function absoluteApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${config.apiBaseUrl.replace(/\/$/, '')}${path}`;
}
