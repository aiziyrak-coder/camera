// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

/**
 * QA: AI qobiliyatlari reyestrining sof yordamchilari.
 *
 * Hujjat raqami va xizmat kodi RENDER VAQTIGA bog'liq bo'lmasligi shart —
 * aks holda chop etilgan nusxadagi raqam ekrandagiga to'g'ri kelmaydi.
 * "Nega ishlamaydi" sababi esa eng chuqur to'siqni birinchi aytishi kerak,
 * aks holda "sinovda" deb yozib, kameraga biriktirilmaganini yashirardik.
 */

import { COVERAGE_RAG, aiRegisterReference, blockingReason, moduleCode } from './AIModulesPage';
import { rag } from '../../ui/rag';
import type { AIModule } from '../../types';

function mod(patch: Partial<AIModule>): AIModule {
  return {
    id: '1',
    code: 3,
    group: 'A',
    name: 'Test',
    description: '',
    active: true,
    mode: 'ishchi',
    hasDetector: true,
    cameraCount: 5,
    threshold: 0.5,
    sensitivity: 'orta',
    maturity: 'ishchi',
    ...patch,
  } as AIModule;
}

describe('moduleCode', () => {
  it('ikki xonali xizmat kodi beradi', () => {
    expect(moduleCode(3)).toBe('M-03');
    expect(moduleCode(12)).toBe('M-12');
    expect(moduleCode(null)).toBe('M-??');
  });
});

describe('aiRegisterReference', () => {
  it('toifa va band sonidan kelib chiqadi, vaqtdan emas', () => {
    expect(aiRegisterReference('A', 7)).toBe('AI-A-007');
    expect(aiRegisterReference('A', 7)).toBe(aiRegisterReference('A', 7));
    expect(aiRegisterReference('toxtatilgan', 12)).toBe('AI-TOXT-012');
  });
});

describe('blockingReason', () => {
  it('ishlayotgan modul uchun sabab yozmaydi', () => {
    expect(blockingReason(mod({}))).toBeNull();
  });

  it('eng chuqur to’siqni birinchi aytadi', () => {
    // Aniqlash logikasi yo'q — qolgan hammasi ahamiyatsiz.
    expect(blockingReason(mod({ hasDetector: false, active: false, mode: 'sinov' }))).toMatch(/Aniqlash logikasi/);
    expect(blockingReason(mod({ active: false, mode: 'sinov' }))).toMatch(/o’chirilgan|o'chirilgan/);
    // Kameraga biriktirilmagan modul "sinovda" deb yumshatilmaydi.
    expect(blockingReason(mod({ cameraCount: 0, mode: 'sinov' }))).toMatch(/Hech bir kameraga/);
    expect(blockingReason(mod({ mode: 'sinov' }))).toMatch(/Sinov rejimida/);
  });

  it('sozlash kerak bo’lsa serverning izohini ishlatadi', () => {
    expect(blockingReason(mod({ maturity: 'sozlash_kerak', maturityNote: 'Chegarani pasaytiring' }))).toBe(
      'Chegarani pasaytiring',
    );
  });
});

describe('qamrov svetofori', () => {
  it('hech bir kamerada yoqilmagan modul qizil bo’ladi', () => {
    expect(rag(0, COVERAGE_RAG)).toBe('qizil');
    expect(rag(5, COVERAGE_RAG)).toBe('sariq');
    expect(rag(10, COVERAGE_RAG)).toBe('yashil');
    // Maxraj noma'lum — hukm chiqarilmaydi.
    expect(rag(null, COVERAGE_RAG)).toBe('yoq');
  });
});
