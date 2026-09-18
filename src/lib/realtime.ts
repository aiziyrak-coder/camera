import { useEffect, useRef } from 'react';
import { useAuth } from './auth';
import { config, isBackendConfigured } from './config';
import type { AIEvent, EventStatus } from '../types';

export type LiveEventHandler = (event: AIEvent) => void;

/** Bir nechta hodisa birdan ko'rib chiqilganda keladigan yig'ma xabar
 *  (POST /api/events/review-bulk). Hodisa emas — shuning uchun alohida
 *  ishlovchiga boradi: aks holda "yangi hodisa" hisoblagichi oshib ketardi. */
export interface LiveReviewMessage {
  kind: 'events_reviewed';
  ids: string[];
  status: Exclude<EventStatus, 'yangi'>;
  reviewedBy?: string | null;
}

export type LiveReviewHandler = (message: LiveReviewMessage) => void;

/** Kunning birinchi davomat qaydi (app/jobs/attendance_ai.py
 *  _announce_attendance). Hodisa emas — "yangi hodisa" hisoblagichiga
 *  tushmasligi kerak, shuning uchun alohida ishlovchiga boradi. */
export interface LiveAttendanceMessage {
  kind: 'attendance_recorded';
  personId: string;
  fullName: string | null;
  personType: 'talaba' | 'xodim' | null;
  group: string | null;
  status: 'keldi' | 'kech_keldi';
  checkIn: string | null;
  date: string;
  camera: string | null;
}

export type LiveAttendanceHandler = (message: LiveAttendanceMessage) => void;

interface SocketHandlers {
  onEvent?: LiveEventHandler;
  onReviewed?: LiveReviewHandler;
  onAttendance?: LiveAttendanceHandler;
}

const RECONNECT_DELAY_MS = 3_000;

/** Server ulanishni rad etgan kodlar (app/routers/events.py): token
 * yaroqsiz (4401) yoki hodisalarni ko'rish huquqi yo'q (4403). Bularda
 * qayta ulanish ma'nosiz — xuddi shu token bilan javob o'zgarmaydi.
 * Sessiya tugagani HTTP so'rovlaridagi 401 orqali alohida aniqlanadi. */
export const WS_REJECTED_CODES: ReadonlySet<number> = new Set([4401, 4403]);

/**
 * Haqiqiy backend'ga /ws/events orqali ulanadi (app/routers/events.py) —
 * yangi AI hodisa yaratilganda yoki ko'rib chiqilganda backend shu ulanish
 * orqali darhol xabar yuboradi. Token query param orqali uzatiladi, chunki
 * brauzer WebSocket API'si maxsus header o'rnatishga imkon bermaydi.
 * Ulanish uzilsa avtomatik qayta urinadi (masalan server qayta ishga tushsa).
 */
function subscribeWebSocket(token: string, handlers: SocketHandlers): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let cancelled = false;

  function connect() {
    if (cancelled) return;
    const url = `${config.realtimeUrl}?token=${encodeURIComponent(token)}`;
    socket = new WebSocket(url);

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.kind === 'events_reviewed') {
          handlers.onReviewed?.(data as LiveReviewMessage);
          return;
        }
        if (data && data.kind === 'attendance_recorded') {
          handlers.onAttendance?.(data as LiveAttendanceMessage);
          return;
        }
        handlers.onEvent?.(data as AIEvent);
      } catch {
        /* JSON bo'lmagan xabar — e'tiborsiz qoldiriladi */
      }
    };

    socket.onclose = (e) => {
      if (cancelled || WS_REJECTED_CODES.has(e.code)) return;
      reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }

  connect();

  return () => {
    cancelled = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}

/**
 * Backend/token bo'lmasa — HECH NARSA qilmaydi.
 *
 * Ilgari bu yerda "simulyatsiya" rejimi bor edi: mock ma'lumotlaridan
 * (src/mock/admin.ts) har 25 soniyada SOXTA AI hodisa yasab, uni haqiqiy
 * hodisa sifatida UI'ga uzatardi. Xavfsizlik tizimida bu qabul qilib
 * bo'lmaydigan xatar — operator ekranda ko'rgan "hodisa" hech qachon
 * o'ylab topilgan bo'lmasligi kerak. Demo ma'lumot kerak bo'lsa, u
 * backend tomonda, ochiq belgilangan holda berilishi lozim.
 */
export function useLiveEvents(onEvent: LiveEventHandler, enabled = true, onReviewed?: LiveReviewHandler) {
  const { token } = useAuth();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const reviewRef = useRef(onReviewed);
  reviewRef.current = onReviewed;

  useEffect(() => {
    if (!enabled) return;
    if (!isBackendConfigured || !config.realtimeUrl || !token) return;
    return subscribeWebSocket(token, {
      onEvent: (event) => handlerRef.current(event),
      onReviewed: (message) => reviewRef.current?.(message),
    });
  }, [enabled, token]);
}

/** Yangi davomat qaydlari — davomat sahifasi o'zi yangilanishi uchun. */
export function useLiveAttendance(onAttendance: LiveAttendanceHandler, enabled = true) {
  const { token } = useAuth();
  const handlerRef = useRef(onAttendance);
  handlerRef.current = onAttendance;

  useEffect(() => {
    if (!enabled) return;
    if (!isBackendConfigured || !config.realtimeUrl || !token) return;
    return subscribeWebSocket(token, {
      onAttendance: (message) => handlerRef.current(message),
    });
  }, [enabled, token]);
}
