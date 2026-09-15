import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { api, buildQuery, type Page } from './apiClient';

/**
 * Server-side pagination — the real-backend counterpart to
 * usePagination.ts (which slices an already-fully-loaded array).
 * Re-fetches whenever page or the filter params change; call `reload()`
 * after a mutation (create/update/delete) to refresh the current page.
 */
export function useServerPage<T>(
  path: string,
  params: Record<string, string | undefined>,
  pageSize = 10,
  /** Filtrni URL o'rniga so'rov tanasida yuborish (POST). Qidiruv matni
   *  JSHSHIR bo'lishi mumkin — query qatori access log va brauzer
   *  tarixida qoladi, tana esa qolmaydi. */
  options: { post?: boolean } = {},
) {
  const post = Boolean(options.post);
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<T>>({ items: [], total: 0, page: 1, pageSize, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    if (!token) {
      // Token yo'q => hech qachon so'rov yuborilmaydi, demak `loading`
      // ham hech qachon o'chmasdi va chaqiruvchi komponent abadiy
      // spinner ko'rsatib turardi. "Ma'lumot yo'q" — bu tugallangan
      // holat, yuklanish emas.
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const filters = JSON.parse(paramsKey) as Record<string, string | undefined>;
    const request = post
      ? api.post<Page<T>>(path, { page, pageSize, ...filters }, token)
      : api.get<Page<T>>(`${path}${buildQuery({ page, pageSize, ...filters })}`, token);
    request
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, page, pageSize, paramsKey, token, reloadNonce, post]);

  return {
    ...data,
    page,
    setPage,
    loading,
    error,
    reload: () => setReloadNonce((n) => n + 1),
  };
}
