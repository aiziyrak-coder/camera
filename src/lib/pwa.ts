/**
 * PWA: service worker'ni ro'yxatdan o'tkazish (public/sw.js).
 *
 * Faqat production build'da va xavfsiz kontekstda (HTTPS yoki localhost).
 * Dev rejimida (Vite HMR) service worker keshlari xalaqit beradi — avval
 * o'rnatilgan bo'lsa o'chiriladi.
 */

// vite.config.ts `define` orqali beriladi (build vaqtidagi git commit yoki vaqt).
declare const __APP_BUILD_ID__: string | undefined;

/** Soatiga bir marta yangi versiya bor-yo'qligini tekshirish. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function buildId(): string {
  return typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__ ? __APP_BUILD_ID__ : 'dev';
}

/** Har build o'z manziliga ega — brauzer yangi service worker'ni o'rnatadi,
 * u esa eski keshlarni tozalaydi (sw.js `activate`). */
export function serviceWorkerUrl(id: string = buildId()): string {
  return `/sw.js?v=${encodeURIComponent(id)}`;
}

export interface PwaEnvironment {
  production: boolean;
  secureContext: boolean;
  supported: boolean;
}

export function shouldRegisterServiceWorker(env: PwaEnvironment): boolean {
  return env.production && env.secureContext && env.supported;
}

async function unregisterAll(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  const supported = 'serviceWorker' in navigator;
  const env: PwaEnvironment = {
    production: import.meta.env.PROD,
    secureContext: window.isSecureContext,
    supported,
  };

  if (!shouldRegisterServiceWorker(env)) {
    if (supported && !env.production) {
      unregisterAll().catch(() => undefined);
    }
    return;
  }

  const register = () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl(), { scope: '/' })
      .then((registration) => {
        // Uzoq ochiq turadigan ekranlar (videodevor, monitoring) ham yangilanishni olsin.
        window.setInterval(() => {
          registration.update().catch(() => undefined);
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((error: unknown) => {
        console.warn("Service worker ro'yxatdan o'tmadi", error);
      });
  };

  // Birinchi yuklanishda asosiy resurslar bilan raqobatlashmasin.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
