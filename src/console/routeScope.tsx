import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useNavigate,
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  UNSAFE_createMemoryHistory as createMemoryHistory,
  type NavigateOptions,
  type To,
} from 'react-router-dom';

/**
 * KONSOL MANZIL QOBIG'I.
 *
 * Konsol ichida mavjud sahifalar (reestr, tuzilma, kameralar…) o'z
 * holatini URL'da saqlaydi: `useUrlTab` va filtrlar `?tab=`, `?tur=`
 * yozadi. Konsolda esa manzil O'ZGARMASLIGI kerak (konsol.md, 2-qoida)
 * va ikkita panel bir xil `?tab=` ni talashib qolmasligi ham kerak.
 *
 * Shu sababli panel ichidagi sahifaga ALOHIDA, xotiradagi manzil
 * beriladi: `?tab=` brauzer manziliga tushmaydi, orqaga tugmasi
 * konsolni buzmaydi. `<MemoryRouter>` ishlatib bo'lmaydi — react-router
 * router ichida router'ni taqiqlaydi — shuning uchun u nima qilsa,
 * o'shani qilamiz: navigatsiya va joylashuv kontekstini almashtiramiz.
 *
 * BOSHQA SAHIFAGA o'tish (masalan reestrdagi shaxs kartasi havolasi)
 * xotirada yutilmaydi: u haqiqiy router'ga uzatiladi. Foydalanuvchi
 * ataylab bosgan havola jimgina ishlamay qolgandan ko'ra, sahifa
 * ochilgani halolroq.
 */

/** `to` shu qobiqdan CHIQIB ketadimi (boshqa manzil)? Faqat `?`/`#`
 *  o'zgarishi — qobiq ichida qoladi. */
export function leavesScope(basePath: string, to: To): boolean {
  const pathname = typeof to === 'string' ? to.split('?')[0].split('#')[0] : (to.pathname ?? '');
  if (!pathname) return false;
  const clean = pathname.replace(/\/+$/, '') || '/';
  const base = basePath.replace(/\/+$/, '') || '/';
  return clean !== base;
}

export interface RouteScopeProps {
  /** Ichkaridagi sahifa o'zini qaysi manzilda deb bilsin. */
  path: string;
  children: ReactNode;
}

export default function RouteScope({ path, children }: RouteScopeProps) {
  // Haqiqiy router — qobiqdan tashqariga chiqadigan havolalar uchun.
  const escape = useNavigate();

  const historyRef = useRef<ReturnType<typeof createMemoryHistory> | null>(null);
  if (historyRef.current === null) {
    historyRef.current = createMemoryHistory({ initialEntries: [path], v5Compat: true });
  }
  const history = historyRef.current;

  const [state, setState] = useState({ action: history.action, location: history.location });
  useLayoutEffect(() => history.listen(setState), [history]);

  const navigation = useMemo(
    () => ({
      basename: '/',
      navigator: {
        createHref: (to: To) => history.createHref(to),
        encodeLocation: (to: To) => history.encodeLocation(to),
        go: (delta: number) => history.go(delta),
        push: (to: To, historyState?: unknown, options?: NavigateOptions) => {
          if (leavesScope(path, to)) escape(to, options);
          else history.push(to, historyState);
        },
        replace: (to: To, historyState?: unknown, options?: NavigateOptions) => {
          if (leavesScope(path, to)) escape(to, { ...options, replace: true });
          else history.replace(to, historyState);
        },
      },
      static: false,
      useTransitions: false,
      future: {},
    }),
    [history, path, escape],
  );

  const location = useMemo(() => ({ location: state.location, navigationType: state.action }), [state]);
  // Nisbiy manzillar konsolning o'z yo'lidan emas, qobiq ildizidan hisoblansin.
  const route = useMemo(() => ({ outlet: null, matches: [], isDataRoute: false }), []);

  return (
    <NavigationContext.Provider value={navigation}>
      <LocationContext.Provider value={location}>
        <RouteContext.Provider value={route}>{children}</RouteContext.Provider>
      </LocationContext.Provider>
    </NavigationContext.Provider>
  );
}
