import { useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import { TextField } from '../FormField';
import TelegramLinkBox from './TelegramLinkBox';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { notificationsApi, type TelegramLink } from '../../lib/notificationsApi';

export interface ParentFieldsValue {
  parentPhone: string;
  parentNotifyEnabled: boolean;
  cardNumber: string;
}

/** Talaba/xodim oynalaridagi "Ota-ona va turniket" bo'limi.
 *
 *  Ota-ona qismi faqat talabada ko'rinadi. `personId` berilsa (tahrirlash)
 *  ota-ona Telegramini bog'lash havolasini yaratish ham mumkin — yangi
 *  yozuvda havola saqlangandan keyin yaratiladi. */
export default function ParentNotifyFields({
  isStudent,
  value,
  onChange,
  errors,
  disabled = false,
  personId,
  telegramLinked = false,
  onTelegramUnlinked,
}: {
  isStudent: boolean;
  value: ParentFieldsValue;
  onChange: (next: ParentFieldsValue) => void;
  errors?: Partial<Record<'parentPhone' | 'cardNumber', string>>;
  disabled?: boolean;
  personId?: string;
  telegramLinked?: boolean;
  onTelegramUnlinked?: () => void;
}) {
  const { token } = useAuth();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  function set<K extends keyof ParentFieldsValue>(key: K, v: ParentFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  async function createLink() {
    if (!personId) return;
    setBusy(true);
    setLinkError(null);
    try {
      setLink(await notificationsApi.parentTelegramLink(personId, token));
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!personId) return;
    setBusy(true);
    setLinkError(null);
    try {
      await notificationsApi.unlinkParentTelegram(personId, token);
      setLink(null);
      onTelegramUnlinked?.();
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-white/80 bg-white/40 p-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {isStudent ? 'Ota-ona va turniket' : 'Turniket'}
      </legend>
      {isStudent && (
        <>
          <TextField
            label="Ota-ona telefoni"
            type="tel"
            placeholder="+998 90 123 45 67"
            autoComplete="off"
            value={value.parentPhone}
            disabled={disabled}
            onChange={(e) => set('parentPhone', e.target.value)}
            error={errors?.parentPhone}
          />
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={value.parentNotifyEnabled}
              disabled={disabled}
              onChange={(e) => set('parentNotifyEnabled', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-slate-700">
              Ota-onaga xabar yuborilsin
              <span className="block text-[11px] text-slate-400">
                Institutga kelganda va kun oxirida kelmaganda (Telegram bog'langan bo'lsa Telegram, aks holda SMS).
              </span>
            </span>
          </label>
          {!personId && (
            <p className="text-[11px] text-slate-400">
              Ota-ona Telegramini bog'lash havolasi yozuv saqlangandan keyin tahrirlash oynasida yaratiladi.
            </p>
          )}
          {personId && (
            <div className="flex flex-col gap-2">
              {telegramLinked ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                  <span className="text-xs font-semibold text-emerald-700">Ota-ona Telegrami bog'langan</span>
                  <button
                    type="button"
                    onClick={unlink}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-60"
                  >
                    <Unlink size={12} />
                    Uzish
                  </button>
                </div>
              ) : link ? (
                <TelegramLinkBox
                  link={link}
                  hint="Havolani ota-onaga yuboring: u havolani ochib Telegram'da «Start» ni bossa, bog'lanadi."
                />
              ) : (
                <button
                  type="button"
                  onClick={createLink}
                  disabled={busy || disabled}
                  className="btn-glass flex items-center justify-center gap-1.5 !py-1.5 text-xs"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                  Ota-ona Telegramini bog'lash
                </button>
              )}
              {linkError && <p className="text-xs font-medium text-red-500">{linkError}</p>}
            </div>
          )}
        </>
      )}
      <TextField
        label="Kirish kartasi raqami (ixtiyoriy)"
        autoComplete="off"
        maxLength={64}
        placeholder="Turniket o'qiydigan raqam"
        value={value.cardNumber}
        disabled={disabled}
        onChange={(e) => set('cardNumber', e.target.value)}
        error={errors?.cardNumber}
      />
    </fieldset>
  );
}
