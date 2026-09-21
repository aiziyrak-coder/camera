import { describe, expect, it } from 'vitest';
import { CONTROL_PAGES, CONTROL_TABS, visibleControlTabs } from './controlTabs';
import type { PermissionKey } from '../../lib/permissions';

const ALL = () => true;
const NONE = () => false;

describe('visibleControlTabs', () => {
  it('tizimga kirmagan foydalanuvchiga hech narsa ko‘rsatmaydi', () => {
    expect(visibleControlTabs(ALL, null)).toEqual([]);
  });

  it('huquqi yo‘q bo‘lsa faqat ruxsatsiz bandlar qoladi', () => {
    const tabs = visibleControlTabs(NONE, 'admin');
    // Tuzilma o'qish uchun ochiq (App.tsx'dagi marshrut ham ruxsatsiz).
    expect(tabs.map((tab) => tab.id)).toEqual(['tuzilma']);
  });

  it('to‘liq huquqda hamma bandlar ko‘rinadi', () => {
    expect(visibleControlTabs(ALL, 'super-admin')).toHaveLength(CONTROL_TABS.length);
  });

  it('kamera mas’uli faqat o‘ziga ruxsat etilgan sahifalarni ko‘radi', () => {
    const tabs = visibleControlTabs(ALL, 'kamera-masuli');
    expect(tabs.map((tab) => tab.id)).toEqual(['tuzilma', 'kameralar']);
  });

  it('bitta huquq bitta bandni ochadi', () => {
    const can = (key: PermissionKey) => key === 'manageRoles';
    expect(visibleControlTabs(can, 'admin').map((tab) => tab.id)).toEqual(['tuzilma', 'foydalanuvchilar']);
  });

  it('har band uchun sahifa bor', () => {
    for (const tab of CONTROL_TABS) expect(CONTROL_PAGES[tab.id]).toBeTruthy();
  });
});
