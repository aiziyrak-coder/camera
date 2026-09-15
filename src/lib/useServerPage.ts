import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { api, buildQuery, isAbortError, type Page } from './apiClient';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Server-side pagination — the real-backend counterpart to
 * usePagination.ts (which slices an already-fully-loaded array).
 *
 * Tezlik uchun uch narsa:
 *  - filtr o'zgarishi 300 ms debounce qilinadi — qidiruvda har harf
 *    bosilganda so'rov ketmaydi;
 *  - eskirgan so'rov AbortController bilan bekor qilinadi — kech kelgan
 *    javob yangi filtr natijasini bosib ketmaydi;
 *  - javob xotirada keshlanadi: sahifaga qaytilganda ro'yxat darhol
 *    ko'rinadi, yangisi fonda olinadi (`refreshing`). Qidiruv matni bor
 *    so'rovlar keshlanmaydi — unda JSHSHIR bo'lishi mumkin.
 */

const CACHE_LIMIT = 50;
const cache = new Map<string, Page<unknown>>();

function remember(key: string, value: Page<unknown>) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Yozuv o'zgargandan keyin (yaratish/o'chirish) eski ro'yxat ko'rinmasin. */
export function invalidateServerPageCache(pathPrefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key.includes(` ${pathPrefix}`)) cache.delete(key);
  }
}

export function useServerPage<T>(
  path: string,
  params: Record<string, string | undefined>,
  pageSize = 10,
  /** post: filtrni URL o'rniga so'rov tanasida yuborish. Qidiruv matni
   *  JSHSHIR bo'lishi mumkin — query qatori access log va brauzer
   *  tarixida qoladi, tana esa qolmaydi.
   *  enabled: false bo'lsa so'rov yuborilmaydi (sahifaning boshqa
   *  ko'rinishi o'z ma'lumotini boshqa joydan olayotganda). */
  options: { post?: boolean; debounceMs?: number; enabled?: boolean } = {},
) {
  const post = Boolean(options.post);
  const enabled = options.enabled ?? true;
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<T>>({ items: [], total: 0, page: 1, pageSize, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasData = useRef(false);

  const paramsKey = useDebouncedValue(JSON.stringify(params), options.debounceMs ?? 300);

  useEffect(() => {
    setPage(1);
  }, [paramsKey]);

  useEffect(() => {
    if (!token || !enabled) {
      // So'rov yuborilmaydi => "ma'lumot yo'q" tugallangan holat.
      setLoading(false);
      return;
    }
    const filters = JSON.parse(paramsKey) as Record<string, string | undefined>;
    const cacheable = !filters.search;
    const cacheKey = `${post ? 'POST' : 'GET'} ${path} ${page} ${pageSize} ${paramsKey}`;
    const cached = cacheable ? cache.get(cacheKey) : undefined;
    if (cached) {
      setData(cached as Page<T>);
      hasData.current = true;
      setLoading(false);
      setRefreshing(true);
    } else if (hasData.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const controller = new AbortController();
    const request = post
      ? api.post<Page<T>>(path, { page, pageSize, ...filters }, token, { signal: controller.signal })
      : api.get<Page<T>>(`${path}${buildQuery({ page, pageSize, ...filters })}`, token, { signal: controller.signal });
    request
      .then((res) => {
        setData(res);
        hasData.current = true;
        setError(null);
        if (cacheable) remember(cacheKey, res as Page<unknown>);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : "So'rov bajarilmadi");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [path, page, pageSize, paramsKey, token, reloadNonce, post, enabled]);

  return {
    ...data,
    page,
    setPage,
    loading,
    refreshing,
    error,
    reload: () => setReloadNonce((n) => n + 1),
  };
}
