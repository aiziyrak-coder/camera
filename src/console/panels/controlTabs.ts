import { BellRing, CalendarRange, Cctv, Clock, Contact, Network, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Role } from '../../lib/auth';
import type { PermissionKey } from '../../lib/permissions';
import { isPathAllowedForRole } from '../../layouts/shell/navConfig';
import { lazyPage } from '../../lib/lazyPage';

/**
 * BOSHQARUV paneli — konsoldan chiqmasdan boshqariladigan bo'limlar.
 *
 * Har band MAVJUD sahifani ochadi (yangi ekran yozilmaydi): panel ichida,
 * o'z manzil qobig'ida (routeScope.tsx). Huquq — sahifa marshrutidagi
 * bilan BIR XIL (App.tsx): huquqi yo'q odam tabni ko'rmaydi ham.
 */

export type ControlTabId =
  | 'reestr'
  | 'tuzilma'
  | 'kameralar'
  | 'foydalanuvchilar'
  | 'ish-vaqti'
  | 'bildirishnomalar'
  | 'dars-jadvali';

/** Sanoq qayerdan olinadi. `null` — o'lchanmagan (chiziqcha ko'rsatiladi). */
export type CountKey = 'people' | 'units' | 'cameras' | 'users' | 'notifications' | 'lessons' | null;

export interface ControlTab {
  id: ControlTabId;
  /** Yorliq — 2 so'zdan oshmaydi. */
  label: string;
  icon: LucideIcon;
  /** Sahifaning haqiqiy marshruti (qobiqdagi boshlang'ich manzil). */
  path: string;
  permission?: PermissionKey;
  countKey: CountKey;
  /** Sanoq nimani anglatadi — yig'ilgan ro'yxatdagi izoh. */
  countLabel: string;
}

export const CONTROL_TABS: readonly ControlTab[] = [
  {
    id: 'reestr',
    label: 'Shaxslar',
    icon: Contact,
    path: '/reestr',
    permission: 'registerPeople',
    countKey: 'people',
    countLabel: 'ta yozuv',
  },
  // Tuzilma o'qish uchun hammaga ochiq (App.tsx'da ham marshrut ruxsatsiz);
  // o'zgartirish tugmalari sahifaning o'zida manageOrgStructure bo'yicha yashiriladi.
  { id: 'tuzilma', label: 'Tuzilma', icon: Network, path: '/tuzilma', countKey: 'units', countLabel: "ta bo'linma" },
  {
    id: 'kameralar',
    label: 'Kameralar',
    icon: Cctv,
    path: '/sozlamalar/kameralar',
    permission: 'editCameraLocation',
    countKey: 'cameras',
    countLabel: 'ta faol',
  },
  {
    id: 'foydalanuvchilar',
    label: 'Foydalanuvchilar',
    icon: ShieldCheck,
    path: '/sozlamalar/foydalanuvchilar',
    permission: 'manageRoles',
    countKey: 'users',
    countLabel: 'ta hisob',
  },
  {
    id: 'ish-vaqti',
    label: 'Ish vaqti',
    icon: Clock,
    path: '/sozlamalar/ish-vaqti',
    permission: 'manageAttendance',
    countKey: null,
    countLabel: '',
  },
  {
    id: 'bildirishnomalar',
    label: 'Bildirishnomalar',
    icon: BellRing,
    path: '/sozlamalar/bildirishnomalar',
    permission: 'manageNotifications',
    countKey: 'notifications',
    countLabel: 'ta qoida',
  },
  {
    id: 'dars-jadvali',
    label: 'Dars jadvali',
    icon: CalendarRange,
    path: '/dars-jadvali',
    permission: 'manageAttendance',
    countKey: 'lessons',
    countLabel: 'ta dars',
  },
];

/** Sahifa komponentlari — faqat tab ochilganda yuklanadi. */
export const CONTROL_PAGES: Record<ControlTabId, ReturnType<typeof lazyPage>> = {
  reestr: lazyPage(() => import('../../pages/admin/StudentsStaffPage')),
  tuzilma: lazyPage(() => import('../../pages/admin/OrgStructurePage')),
  kameralar: lazyPage(() => import('../../pages/admin/CamerasZonesPage')),
  foydalanuvchilar: lazyPage(() => import('../../pages/admin/UsersRolesPage')),
  'ish-vaqti': lazyPage(() => import('../../pages/settings/WorkHoursPage')),
  bildirishnomalar: lazyPage(() => import('../../pages/admin/NotificationsPage')),
  'dars-jadvali': lazyPage(() => import('../../pages/admin/DarsJadvaliPage')),
};

/**
 * Ko'rinadigan bandlar: huquq matritsasi VA cheklangan rol ro'yxati
 * (navConfig.ROLE_PAGES) bo'yicha — menyudagi qoida bilan bir xil.
 */
export function visibleControlTabs(can: (key: PermissionKey) => boolean, role: Role | null): readonly ControlTab[] {
  if (!role) return [];
  return CONTROL_TABS.filter((tab) => (!tab.permission || can(tab.permission)) && isPathAllowedForRole(role, tab.path));
}
