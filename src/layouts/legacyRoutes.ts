/** Eski /admin/* manzillari → yangi manzillar. Xatcho'plar, elektron
 *  xatlardagi (parolni tiklash) va Telegram bildirishnomalaridagi havolalar
 *  ishlashda davom etishi uchun. Query (`?id=`, `?search=`, `?token=`)
 *  va hash saqlanadi. */
const LEGACY_MAP: Record<string, string> = {
  '/admin': '/',
  '/admin/students-staff': '/reestr',
  '/admin/org-structure': '/tuzilma',
  '/admin/users-roles': '/sozlamalar/foydalanuvchilar',
  '/admin/system-log': '/sozlamalar/tizim?tab=jurnal',
  '/admin/notifications': '/sozlamalar/bildirishnomalar',
  '/admin/integrations': '/sozlamalar/tizim',
  '/admin/privacy': '/sozlamalar/maxfiylik',
  '/admin/login': '/kirish',
  '/admin/reset-password': '/parolni-tiklash',
};

/** Eski manzil uchun yangi to'liq manzil (noma'lum /admin/... → "/"). */
export function legacyRedirect(pathname: string, search = '', hash = ''): string {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const target = LEGACY_MAP[clean] ?? '/';
  const [targetPath, targetQuery = ''] = target.split('?');
  // Eski query saqlanadi; yangi manzilning o'z parametri (tab=jurnal) ustun.
  const params = new URLSearchParams(search);
  new URLSearchParams(targetQuery).forEach((value, key) => {
    params.set(key, value);
  });
  const query = params.toString();
  return `${targetPath}${query ? `?${query}` : ''}${hash}`;
}
