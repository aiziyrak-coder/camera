/**
 * Qavat rejalari API'si (camera-api/app/routers/floor_plans.py).
 *
 * GET/POST/DELETE umumiy apiClient orqali. PUT (joylashuvlarni saqlash)
 * va multipart PATCH (nom/rasmni almashtirish) uchun apiClient'da metod
 * yo'q, shuning uchun ular shu yerdagi kichik `send` orqali — xato
 * javobi apiClient bilan bir xil ApiError'ga aylantiriladi.
 */
import { ApiError, api, buildQuery, type CallOptions } from './apiClient';
import { config } from './config';
import type { PositionUpdate } from './floorPlan';

export interface FloorPlan {
  id: string;
  buildingId: string;
  buildingName: string;
  floor: number;
  name: string;
  /** Imzolangan havola; ombor javob bermasa null. */
  imageUrl: string | null;
  width: number;
  height: number;
  cameraCount: number;
  placedCount: number;
  createdAt: string;
}

export interface FloorPlanCamera {
  id: string;
  name: string;
  zone: string;
  /** Admin belgilagan holat: 'faol' | 'nofaol' | 'tamirda'. */
  status: string;
  online: boolean;
  videoFlowing: boolean;
  planX: number | null;
  planY: number | null;
  planRotation: number | null;
  ptzEnabled: boolean;
  /** Oxirgi 24 soatdagi ochiq (yangi/jarayonda) signallar. */
  openEvents: number;
  /** Imzolangan HLS havola — faqat viewLive huquqi borlarga. */
  streamUrl: string | null;
  /** false — kamera hali bu qavatga biriktirilmagan (faqat tahrirda keladi). */
  assigned: boolean;
  buildingId: string | null;
  floor: number | null;
}

export interface PositionsResult {
  updated: number;
  assigned: number;
}

async function send<T>(method: 'PUT' | 'PATCH', path: string, token: string | null, body: FormData | unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `So'rov muvaffaqiyatsiz tugadi (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((d: { msg?: string }) => d.msg).join(', ');
    } catch {
      /* javob JSON emas — standart xabar */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export function listFloorPlans(token: string | null, buildingId?: string, opts: CallOptions = {}) {
  return api.get<FloorPlan[]>(`/api/floor-plans${buildQuery({ buildingId })}`, token, opts);
}

export function uploadFloorPlan(
  token: string | null,
  input: { buildingId: string; floor: number; name?: string; file: File },
) {
  const form = new FormData();
  form.set('buildingId', input.buildingId);
  form.set('floor', String(input.floor));
  if (input.name?.trim()) form.set('name', input.name.trim());
  form.set('file', input.file);
  return api.postForm<FloorPlan>('/api/floor-plans', form, token);
}

export function updateFloorPlan(token: string | null, planId: string, input: { name?: string; file?: File | null }) {
  const form = new FormData();
  if (input.name !== undefined) form.set('name', input.name);
  if (input.file) form.set('file', input.file);
  return send<FloorPlan>('PATCH', `/api/floor-plans/${encodeURIComponent(planId)}`, token, form);
}

export function deleteFloorPlan(token: string | null, planId: string) {
  return api.del(`/api/floor-plans/${encodeURIComponent(planId)}`, token);
}

export function listPlanCameras(
  token: string | null,
  planId: string,
  includeUnassigned: boolean,
  opts: CallOptions = {},
) {
  const qs = includeUnassigned ? '?includeUnassigned=true' : '';
  return api.get<FloorPlanCamera[]>(`/api/floor-plans/${encodeURIComponent(planId)}/cameras${qs}`, token, opts);
}

export function savePlanPositions(token: string | null, planId: string, items: PositionUpdate[]) {
  return send<PositionsResult>('PUT', `/api/floor-plans/${encodeURIComponent(planId)}/cameras`, token, { items });
}

/** Yuklashdan oldin brauzerda tekshirish — server baribir o'zi tekshiradi. */
export const PLAN_ACCEPT = 'image/png,image/jpeg,image/webp';
export const PLAN_MAX_BYTES = 15 * 1024 * 1024;

export function validatePlanFile(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'Faqat PNG, JPEG yoki WebP rasm yuklang';
  }
  if (file.size > PLAN_MAX_BYTES) return "Rasm 15 MB dan katta bo'lmasligi kerak";
  if (file.size === 0) return "Fayl bo'sh";
  return null;
}
