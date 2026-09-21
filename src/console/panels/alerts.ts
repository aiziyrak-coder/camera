import type { AIEvent } from '../../types';

/** Muhimlik tartibi: yuqori — birinchi. */
export const SEVERITY_RANK: Record<AIEvent['severity'], number> = { yuqori: 0, "o'rta": 1, past: 2 };

/** Qatorni qachon bo'lganiga qarab qiyoslash uchun kalit. */
function whenKey(event: AIEvent): string {
  return event.occurredAt ?? event.timestamp ?? '';
}

/**
 * Eng muhim hodisalar: avval muhimligi bo'yicha, teng bo'lsa YANGISI
 * yuqorida. Yig'ilgan panelda uch qator — shuning uchun tartib
 * serverga emas, shu yerga bog'liq (server `sort=severity` ichida
 * vaqtni kafolatlamaydi).
 */
export function topAlerts(events: readonly AIEvent[], limit: number): AIEvent[] {
  return [...events]
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      const when = whenKey(b).localeCompare(whenKey(a));
      if (when !== 0) return when;
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit));
}
