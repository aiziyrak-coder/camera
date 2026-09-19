import { useEffect } from 'react';

/** Saqlanmagan o'zgarish bor ekan, sahifadan chiqishdan oldin so'raydi.
 *
 * Ilova BrowserRouter'da (data router emas), shuning uchun react-router'ning
 * useBlocker'i ishlamaydi. O'rniga: brauzer yorlig'ini yopish/yangilash —
 * `beforeunload`, ilova ichidagi havolalar (menyu, Link) — hujjat
 * darajasidagi "capture" bosish tinglovchisi. U React'ning o'z
 * tinglovchisidan OLDIN ishlaydi va rad etilsa o'tishni to'xtatadi. */
export function useUnsavedChangesGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Eski brauzerlar uchun (Chrome < 119).
      e.returnValue = message;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, message]);
}
