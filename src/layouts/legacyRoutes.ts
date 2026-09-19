/** Eski /admin/* manzillari → yangi manzillar. Xatcho'plar, elektron
 *  xatlardagi (parolni tiklash) va Telegram bildirishnomalaridagi havolalar
 *  ishlashda davom etishi uchun. Query (`?id=`, `?search=`, `?token=`)
 *  va hash saqlanadi. */
const LEGACY_MAP: Record<string, string> = {
  '/admin': '/',
  '/admin/events': '/hodisalar',
  '/admin/students-staff': '/reestr',
  '/admin/attendance': '/talabalar',
  '/admin/presence': '/oqituvchilar',
  '/admin/teaching': '/darslar',
  '/admin/org-structure': '/tuzilma',
  '/admin/cameras': '/sozlamalar/kameralar',
  '/admin/ai-modules': '/sozlamalar/ai',
  '/admin/reports': '/hisobotlar',
  '/admin/users-roles': '/sozlamalar/foydalanuvchilar',
  '/admin/system-log': '/sozlamalar/tizim?tab=jurnal',
  '/admin/video-wall': '/videodevor',
  '/admin/floor-plans': '/xarita',
  '/admin/notifications': '/sozlamalar/bildirishnomalar',
  '/admin/integrations': '/sozlamalar/integratsiyalar',
  '/admin/privacy': '/sozlamalar/maxfiylik',
  '/admin/login': '/kirish',
  '/admin/reset-password': '/parolni-tiklash',
};

/** Eski manzil uchun yangi to'liq manzil (noma'lum /admin/... → "/"). */
export function legacyRedirect(pathname: string, search = '', hash = ''): string {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  // Eski davomat kalendari aniq bir odamni ?person=<id> bilan ochardi —
  // endi bu shaxs profili.
  if (clean === '/admin/attendance') {
    const person = new URLSearchParams(search).get('person');
    if (person) return `/shaxs/${encodeURIComponent(person)}${hash}`;
  }
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
