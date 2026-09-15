import type { AIEvent, EventStatus } from '../types';

/** Hodisa muhimligi va holati — Hodisalar jurnali va uning paneli uchun
 *  yagona yorliqlar. "Past" muhimlik kulrang: yashil rang "yaxshi" deb
 *  o'qilardi, past muhimlikdagi signal esa yaxshi narsa emas. */

export const SEVERITY_LABEL: Record<AIEvent['severity'], string> = {
  past: 'Past',
  "o'rta": "O'rta",
  yuqori: 'Yuqori',
};

export const SEVERITY_TONE: Record<AIEvent['severity'], 'slate' | 'amber' | 'red'> = {
  past: 'slate',
  "o'rta": 'amber',
  yuqori: 'red',
};

/** Qator/kartaning chap chizig'i. */
export const SEVERITY_STRIPE: Record<AIEvent['severity'], string> = {
  past: 'bg-slate-300',
  "o'rta": 'bg-amber-400',
  yuqori: 'bg-red-500',
};

export const STATUS_LABEL: Record<EventStatus, string> = {
  yangi: "Ko'rilmagan",
  tasdiqlangan: 'Tasdiqlangan',
  rad_etilgan: 'Rad etilgan',
};

export const STATUS_TONE: Record<EventStatus, 'amber' | 'green' | 'slate'> = {
  yangi: 'amber',
  tasdiqlangan: 'green',
  rad_etilgan: 'slate',
};
