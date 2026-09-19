import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Loader2, UserSearch } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../lib/auth';
import { formatDateTime, integrationsApi, peopleSearchLink, type UnmatchedCredential } from '../../lib/integrationsApi';
import { copyText } from './ApiKeyDialog';

const DAY_OPTIONS = [1, 7, 30, 90];

/** Turniketda ko'ringan, lekin hech kimga biriktirilmagan karta/xodim
 *  raqamlari. Admin raqamni nusxalab, odamlar sahifasida kerakli odamning
 *  kartasiga yozadi — shundan keyin raqam bu ro'yxatdan chiqadi. */
export default function UnmatchedPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<UnmatchedCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await integrationsApi.unmatched(days, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [days, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="glass-deep p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            Biriktirilmagan kartalar
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </h3>
          <p className="text-xs text-slate-500">
            Raqamni nusxalang va odamlar sahifasida egasining “Karta raqami” maydoniga kiriting.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Davr"
          className="rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Oxirgi {d} kun
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items === null ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact title="Hammasi biriktirilgan" description="Bu davrda noma'lum karta yoki xodim raqami ko'rinmadi." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Karta raqami</th>
                <th className="px-3 py-3">Xodim raqami</th>
                <th className="px-3 py-3 text-right">O'tishlar</th>
                <th className="px-3 py-3">Oxirgi marta</th>
                <th className="px-3 py-3">Qurilma</th>
                <th className="px-3 py-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const value = item.cardNumber ?? item.employeeNo ?? '';
                return (
                  <tr key={`${item.cardNumber}|${item.employeeNo}`} className="border-t border-white/60">
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{item.cardNumber ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{item.employeeNo ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                      {item.count}
                      {item.deniedCount > 0 && <span className="ml-1 text-red-600">({item.deniedCount} rad)</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">{formatDateTime(item.lastSeen)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{item.lastDeviceName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Raqamni nusxalash"
                          aria-label="Raqamni nusxalash"
                          onClick={async () => {
                            if (await copyText(value)) toast.info(`${value} nusxalandi`);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 hover:text-indigo-600"
                        >
                          <Copy size={14} />
                        </button>
                        <Link
                          to={peopleSearchLink(value)}
                          title="Odamlar sahifasida qidirish"
                          aria-label="Odamlar sahifasida qidirish"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 hover:text-indigo-600"
                        >
                          <UserSearch size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
