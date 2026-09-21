import { describe, expect, it } from 'vitest';
import { topAlerts } from './alerts';
import type { AIEvent } from '../../types';

function event(id: string, severity: AIEvent['severity'], timestamp: string, occurredAt?: string): AIEvent {
  return {
    id,
    timestamp,
    occurredAt: occurredAt ?? null,
    cameraId: 'c1',
    cameraName: 'Kamera 1',
    building: 'A',
    moduleCode: 1,
    moduleName: 'Test',
    group: 'xavfsizlik' as AIEvent['group'],
    confidence: 90,
    severity,
    status: 'yangi',
  };
}

describe('topAlerts', () => {
  it('avval muhimlik bo‘yicha saralaydi', () => {
    const rows = topAlerts(
      [event('a', 'past', '2026-09-21 09:00:00'), event('b', 'yuqori', '2026-09-21 08:00:00'), event('c', "o'rta", '2026-09-21 10:00:00')],
      3,
    );
    expect(rows.map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });

  it('muhimligi teng bo‘lsa yangisi yuqorida', () => {
    const rows = topAlerts(
      [event('eski', 'yuqori', '2026-09-21 08:00:00'), event('yangi', 'yuqori', '2026-09-21 11:30:00')],
      2,
    );
    expect(rows.map((row) => row.id)).toEqual(['yangi', 'eski']);
  });

  it('occurredAt bor bo‘lsa o‘sha ishlatiladi', () => {
    const rows = topAlerts(
      [
        event('a', 'yuqori', '2026-09-21 08:00:00', '2026-09-21T12:00:00+05:00'),
        event('b', 'yuqori', '2026-09-21 09:00:00', '2026-09-21T09:00:00+05:00'),
      ],
      2,
    );
    expect(rows[0].id).toBe('a');
  });

  it('chegaradan ortig‘ini kesadi va asl ro‘yxatni o‘zgartirmaydi', () => {
    const input = [event('a', 'past', '2026-09-21 09:00:00'), event('b', 'yuqori', '2026-09-21 08:00:00')];
    expect(topAlerts(input, 1)).toHaveLength(1);
    expect(input[0].id).toBe('a');
  });

  it('bo‘sh ro‘yxat — bo‘sh natija', () => {
    expect(topAlerts([], 3)).toEqual([]);
  });
});
