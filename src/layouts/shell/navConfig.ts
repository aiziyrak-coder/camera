import {
  BellRing,
  BookUser,
  BrainCircuit,
  CalendarClock,
  Cctv,
  ChartColumn,
  Contact,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Map as MapIcon,
  MonitorPlay,
  Network,
  PlugZap,
  ServerCog,
  ShieldCheck,
  Siren,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../lib/auth';
import type { PermissionKey } from '../../lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  /** Faqat aniq manzil (masalan "/" — boshqa hamma manzilning boshi). */
  end?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'monitoring',
    label: 'Monitoring',
    items: [
      { to: '/', label: 'Situatsion markaz', icon: LayoutDashboard, end: true },
      { to: '/videodevor', label: 'Videodevor', icon: MonitorPlay, permission: 'viewLive' },
      { to: '/xarita', label: 'Qavat xaritasi', icon: MapIcon, permission: 'viewLive' },
      { to: '/hodisalar', label: 'Hodisalar', icon: Siren, permission: 'reviewEvents' },
    ],
  },
  {
    id: 'davomat',
    label: 'Davomat',
    items: [
      { to: '/talabalar', label: 'Talabalar', icon: GraduationCap, permission: 'manageAttendance' },
      { to: '/oqituvchilar', label: "O'qituvchilar", icon: BookUser, permission: 'manageAttendance' },
      { to: '/darslar', label: 'Darslar', icon: CalendarClock, permission: 'manageLessons' },
    ],
  },
  {
    id: 'tahlil',
    label: 'Tahlil',
    items: [{ to: '/hisobotlar', label: 'Hisobotlar', icon: ChartColumn, permission: 'viewReports' }],
  },
  {
    id: 'malumotlar',
    label: "Ma'lumotlar",
    items: [
      { to: '/reestr', label: 'Shaxslar reestri', icon: Contact, permission: 'registerPeople' },
      // Ruxsatsiz: o'qish hammaga ochiq, o'zgartirish tugmalari sahifaning
      // o'zida manageOrgStructure bo'yicha yashiriladi.
      { to: '/tuzilma', label: 'Tashkiliy tuzilma', icon: Network },
    ],
  },
  {
    id: 'sozlamalar',
    label: 'Sozlamalar',
    items: [
      { to: '/sozlamalar/kameralar', label: 'Kameralar', icon: Cctv, permission: 'editCameraLocation' },
      { to: '/sozlamalar/ai', label: 'AI modullar', icon: BrainCircuit, permission: 'configureAi' },
      { to: '/sozlamalar/bildirishnomalar', label: 'Bildirishnomalar', icon: BellRing, permission: 'manageNotifications' },
      { to: '/sozlamalar/integratsiyalar', label: 'Integratsiyalar', icon: PlugZap, permission: 'manageIntegrations' },
      { to: '/sozlamalar/foydalanuvchilar', label: 'Foydalanuvchilar', icon: ShieldCheck, permission: 'manageRoles' },
      { to: '/sozlamalar/maxfiylik', label: 'Maxfiylik', icon: Lock, permission: 'managePrivacy' },
      { to: '/sozlamalar/tizim', label: 'Tizim holati', icon: ServerCog, permission: 'systemSettings' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Ayrim rollar butun panelni emas, sanoqli sahifani ko'radi.
 *
 * Huquqlar matritsasi "nima qilish mumkin"ni boshqaradi, bu ro'yxat esa
 * "qayerga kirish mumkin"ni: kamera mas'uli uchun qolgan bo'limlar
 * (davomat, hodisalar, hisobotlar) shunchaki keraksiz va chalg'ituvchi.
 * Haqiqiy chegara baribir backendda — bu ro'yxat menyuni tozalaydi. */
export const ROLE_PAGES: Partial<Record<Role, string[]>> = {
  'kamera-masuli': ['/tuzilma', '/sozlamalar/kameralar'],
};

/** Cheklangan rol kirgandan keyin qayerga tushadi (kunlik ish — kameralar). */
export const ROLE_HOME: Partial<Record<Role, string>> = {
  'kamera-masuli': '/sozlamalar/kameralar',
};

export const ROLE_LABEL: Record<Role, string> = {
  'super-admin': 'Super Admin',
  admin: 'Admin',
  'kamera-masuli': "Kamera mas'uli",
};

/** `pathname` shu bo'lim ichidami ("/talabalar/guruh/x" → "/talabalar"). */
export function matchesPath(pathname: string, to: string, end = false): boolean {
  if (to === '/') return pathname === '/';
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function homeForRole(role: Role | null | undefined): string {
  return (role && ROLE_HOME[role]) || '/';
}

/** Cheklangan rol uchun manzil ruxsat etilganmi (cheklanmagan rol — doim ha). */
export function isPathAllowedForRole(role: Role | null | undefined, pathname: string): boolean {
  const allowed = role ? ROLE_PAGES[role] : undefined;
  if (!allowed) return true;
  return allowed.some((to) => matchesPath(pathname, to));
}

/** Menyu: huquq va rol bo'yicha filtrlangan, bo'sh bo'limlarsiz. */
export function visibleSections(can: (key: PermissionKey) => boolean, role: Role | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => (!item.permission || can(item.permission)) && isPathAllowedForRole(role, item.to)),
  })).filter((section) => section.items.length > 0);
}

/** Joriy manzilga mos menyu bandi va bo'limi (eng uzun moslik). */
export function findActive(pathname: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (matchesPath(pathname, item.to, item.end) && (!best || item.to.length > best.item.to.length)) {
        best = { section, item };
      }
    }
  }
  return best;
}

/** Global sana tanlagichi ko'rinadigan (davomat) sahifalar. */
const DATE_ROUTES = ['/', '/talabalar', '/oqituvchilar', '/darslar', '/shaxs'];

export function usesViewDate(pathname: string): boolean {
  return DATE_ROUTES.some((to) => matchesPath(pathname, to));
}
