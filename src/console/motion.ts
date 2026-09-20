import type { Transition, Variants } from 'motion/react';

/**
 * Konsolning harakat tili — bitta joyda.
 *
 * Qoidalar: harakat TEZ (200–450 ms), bir yo'nalishli va to'xtovsiz
 * emas. Ekran jonli ko'rinsin, lekin o'qishga xalaqit qilmasin —
 * shuning uchun doimiy aylanuvchi bezak yo'q, faqat kirish, ochilish
 * va jonli manbaning nafasi.
 */

/** Tabiiy, "og'irligi bor" egri chiziq — sakrash yo'q. */
export const EASE: Transition['ease'] = [0.22, 1, 0.36, 1];

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 };

/** Panellar ketma-ket paydo bo'ladi — ekran bir zumda "yig'iladi". */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};

export const panelIn: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.42, ease: EASE },
  },
};

/** Ro'yxat qatori — yangi yozuv kelganda chapdan suriladi. */
export const rowIn: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE } },
  exit: { opacity: 0, x: 10, transition: { duration: 0.18, ease: EASE } },
};

/** Kengaytirilgan panel ustidagi qorayish. */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.22, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE } },
};

/** Foydalanuvchi harakatni kamaytirishni so'ragan bo'lsa — hammasi
 *  bir zumda, lekin holat baribir o'zgaradi. */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
