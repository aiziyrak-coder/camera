/** Video Monitoring Markazining holati URL'da saqlanadi:
 * `?bino=&qavat=&kamera=&q=`.
 *
 * Nega alohida modul: daraja (kampus / bino / qavat / qidiruv) va server
 * so'rovi parametrlari shu qoidalardan kelib chiqadi, ular esa sahifa
 * ichida ko'zdan qochadigan shartlar to'plamiga aylanardi. Bu yerda ular
 * sof funksiya sifatida, testlanadigan holatda.
 *
 * "Biriktirilmagan" guruhlar uchun URL'da `yoq`, API'da esa `none`
 * ishlatiladi: URL foydalanuvchiga ko'rinadi (o'zbekcha), API parametri
 * esa backend shartnomasi. */

export const UNASSIGNED_KEY = 'yoq';
export const UNASSIGNED_API = 'none';

export type CampusLevel = 'campus' | 'building' | 'floor' | 'search';

export interface CampusRoute {
  /** '' — kampus darajasi; UUID yoki `yoq` — tanlangan bino. */
  building: string;
  /** null — bino darajasi; raqam yoki `yoq` — tanlangan qavat. */
  floor: string | null;
  camera: string | null;
  search: string;
  level: CampusLevel;
}

export function floorKey(floor: number | null | undefined): string {
  return floor === null || floor === undefined ? UNASSIGNED_KEY : String(floor);
}

export function buildingKey(building: { id: string }): string {
  return building.id || UNASSIGNED_KEY;
}

export function parseCampusRoute(params: URLSearchParams): CampusRoute {
  const building = params.get('bino') ?? '';
  const floor = params.get('qavat');
  const camera = params.get('kamera');
  const search = (params.get('q') ?? '').trim();
  // Qidiruv boshqa hamma narsadan ustun: operator aniq kamerani
  // qidirayotganda unga kampus kesimi emas, natijalar kerak.
  const level: CampusLevel = search
    ? 'search'
    : floor !== null
      ? 'floor'
      : building
        ? 'building'
        : 'campus';
  return { building, floor, camera, search, level };
}

/** GET /api/public/cameras parametrlari. Kameralar ro'yxati FAQAT qavat
 * yoki qidiruv darajasida so'raladi — yuqori darajalarda bo'sh obyekt
 * qaytadi va so'rov umuman yuborilmaydi. */
export function campusListParams(route: CampusRoute): Record<string, string | undefined> {
  if (route.level === 'search') return { search: route.search };
  if (route.level !== 'floor') return {};
  return {
    buildingId: route.building === UNASSIGNED_KEY ? UNASSIGNED_API : route.building,
    floor: route.floor === UNASSIGNED_KEY ? UNASSIGNED_API : (route.floor ?? undefined),
  };
}

export type CampusPatch = Partial<Record<'bino' | 'qavat' | 'kamera' | 'q', string | null>>;

/** Yangi URL parametrlari: null yoki bo'sh qiymat kalitni o'chiradi. */
export function withCampusRoute(params: URLSearchParams, patch: CampusPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  return next;
}
