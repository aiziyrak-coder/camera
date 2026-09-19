import { useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import TelegramLinkBox from './TelegramLinkBox';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useApiResource } from '../../lib/useApiResource';
import { formatUzPhone, notificationsApi, type MyNotifications, type TelegramLink } from '../../lib/notificationsApi';

/** "Mening Telegramim" — shaxsiy bildirishnomalar (tayinlangan hodisa,
 *  muddati o'tgan hodisa) uchun o'z hisobini botga bog'lash. */
export default function MyTelegramCard() {
  const { token } = useAuth();
  const { data, loading, reload } = useApiResource<MyNotifications>('/api/notifications/me');
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      setLink(await notificationsApi.linkMyTelegram(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await notificationsApi.unlinkMyTelegram(token);
      setLink(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700">Mening Telegramim</h3>
        {data && !loading && (
          <button type="button" onClick={reload} className="text-[11px] font-semibold text-indigo-600 hover:underline">
            Yangilash
          </button>
        )}
      </div>
      {loading && !data ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Sizga tayinlangan va muddati o'tgan hodisalar haqida shaxsiy xabar keladi. Telegram bog'lanmagan bo'lsa —
            SMS ({data.phone ? formatUzPhone(data.phone) : 'telefon raqami kiritilmagan'}).
          </p>
          {data.telegramLinked ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
              <span className="text-xs font-semibold text-emerald-700">Telegram bog'langan</span>
              <button
                type="button"
                onClick={unlink}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-60"
              >
                <Unlink size={13} />
                Uzish
              </button>
            </div>
          ) : !data.telegramBotConfigured ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Telegram bot hali sozlanmagan — administratorga murojaat qiling.
            </p>
          ) : link ? (
            <>
              <TelegramLinkBox link={link} />
              <button type="button" onClick={reload} className="btn-glass w-full text-xs">
                Bog'ladim — holatni tekshirish
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={createLink}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-btn hover:bg-sky-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Telegramni bog'lash
            </button>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Ma'lumotni yuklab bo'lmadi.</p>
      )}
    </section>
  );
}
