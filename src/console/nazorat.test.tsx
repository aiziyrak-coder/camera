import { describe, expect, it } from 'vitest';
import type { GroupStudent } from '../lib/situationApi';
import { ROTATE_MS, nextTile } from './panels/CamerasPanel';
import { groupCounters, studentMatches } from './panels/GroupTablePanel';
import { parseCounter } from './nazoratSelection';

function student(id: string, status: GroupStudent['status'], face = true): GroupStudent {
  return {
    id, fullName: id, photoUrl: null, initials: id.slice(0, 2), status, checkIn: null, checkOut: null,
    biometricsStatus: face ? 'tasdiqlangan' : 'yoq',
  };
}

describe('aylanuvchi kamera mozaikasi', () => {
  it('kataklar navbat bilan: har safar bitta yangi, ko‘rinib turgani takrorlanmaydi', () => {
    const pool = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    expect(nextTile(['c1', 'c2', 'c3', 'c4'], pool, 4)).toEqual({ id: 'c5', cursor: 5 });
    expect(nextTile(['c5', 'c2', 'c3', 'c4'], pool, 5)).toEqual({ id: 'c6', cursor: 6 });
    // oxiriga yetgach boshidan, lekin ekrandagilarni o'tkazib yuboradi
    expect(nextTile(['c5', 'c6', 'c3', 'c4'], pool, 6)).toEqual({ id: 'c1', cursor: 1 });
    expect(nextTile(['c1', 'c2'], ['c1', 'c2'], 0)).toEqual({ id: null, cursor: 0 });
    expect(ROTATE_MS).toBe(30_000);
  });
});

describe('guruh sanoqlari va filtr', () => {
  const students = [
    student('a', 'keldi'),
    student('b', 'kech_keldi'),
    student('c', 'kelmadi'),
    student('d', 'kutilmoqda'),
    student('e', 'malumot_yoq', false),
  ];

  it('sanoq va filtr bir xil qoidada', () => {
    const seen = new Set(['a']);
    const counts = Object.fromEntries(groupCounters(students, seen).map((c) => [c.key, c.value]));
    expect(counts).toEqual({ hammasi: 5, kelgan: 2, kech_keldi: 1, kelmadi: 1, kutilmoqda: 1, yuzsiz: 1, darsda: 1, darsda_emas: 4 });
    expect(students.filter((s) => studentMatches(s, 'kelgan', seen)).map((s) => s.id)).toEqual(['a', 'b']);
    expect(students.filter((s) => studentMatches(s, 'darsda_emas', seen)).map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('dars bo‘lmasa — darsda sanoqlari yo‘q', () => {
    expect(groupCounters(students, null).map((c) => c.key)).not.toContain('darsda');
  });

  it('URL dagi noto‘g‘ri holat — hammasi', () => {
    expect(parseCounter('kelmadi')).toBe('kelmadi');
    expect(parseCounter('xyz')).toBe('hammasi');
    expect(parseCounter(null)).toBe('hammasi');
  });
});
