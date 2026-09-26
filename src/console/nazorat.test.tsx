import { describe, expect, it } from 'vitest';
import type { CameraFeed } from '../types';
import type { GroupStudent } from '../lib/situationApi';
import { rotatingMosaic } from './panels/CamerasPanel';
import { groupCounters, studentMatches } from './panels/GroupTablePanel';
import { parseCounter } from './nazoratSelection';

function camera(id: number): CameraFeed {
  return { id: `c${id}`, name: `Kamera ${String(id).padStart(2, '0')}`, status: 'live', hasVideo: true, streamUrl: `/s/${id}` } as CameraFeed;
}

function student(id: string, status: GroupStudent['status'], face = true): GroupStudent {
  return {
    id, fullName: id, photoUrl: null, initials: id.slice(0, 2), status, checkIn: null, checkOut: null,
    biometricsStatus: face ? 'tasdiqlangan' : 'yoq',
  };
}

describe('aylanuvchi kamera mozaikasi', () => {
  const cams = Array.from({ length: 10 }, (_, i) => camera(i + 1));

  it('har qadamda navbatdagi 4 ta, oxiri boshidan to‘ldiriladi', () => {
    expect(rotatingMosaic(cams, 0).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(rotatingMosaic(cams, 1).map((c) => c.id)).toEqual(['c5', 'c6', 'c7', 'c8']);
    expect(rotatingMosaic(cams, 2).map((c) => c.id)).toEqual(['c9', 'c10', 'c1', 'c2']);
    expect(rotatingMosaic(cams, 3).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('4 tadan kam kamera aylanmaydi', () => {
    expect(rotatingMosaic(cams.slice(0, 3), 5).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
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
