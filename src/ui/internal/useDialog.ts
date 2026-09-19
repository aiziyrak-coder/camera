import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ochiq dialoglar steki: Esc va Tab faqat eng ustidagisiga tegishli.
const stack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = '';

function lockScroll() {
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

/** Modal/Drawer umumiy xulqi: fokusni ichkariga olish va qaytarish,
 *  Tab'ni ichkarida aylantirish, Esc bilan yopish, fonni aylantirmaslik. */
export function useDialog(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>, initialFocusRef?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    stack.push(token);
    lockScroll();
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus({ preventScroll: true });
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      unlockScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, panelRef, initialFocusRef]);
}
