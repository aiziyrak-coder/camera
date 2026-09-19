import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import {
  splitRecipientInput,
  validateRecipient,
  type NotificationChannel,
} from '../../lib/notificationsApi';

/** Qabul qiluvchilar "chip"lari: Enter, vergul yoki yopishtirish bilan
 *  qo'shiladi, kanal qoidasiga ko'ra darhol tekshiriladi (SMS — telefon
 *  +998XXXXXXXXX ga keltiriladi; Telegram — chat ID yoki @kanal). */
export default function RecipientChipsInput({
  channel,
  value,
  onChange,
  error,
}: {
  channel: NotificationChannel;
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  function commit(text: string): boolean {
    const parts = splitRecipientInput(text);
    if (parts.length === 0) return true;
    const next = [...value];
    for (const part of parts) {
      const [clean, err] = validateRecipient(channel, part);
      if (err) {
        setDraftError(err);
        return false;
      }
      if (clean && !next.includes(clean)) next.push(clean);
    }
    onChange(next);
    setDraft('');
    setDraftError(null);
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const placeholder =
    channel === 'sms' ? '+998 90 123 45 67 — Enter bilan qo\'shing' : 'Chat ID (123456789, -100…) yoki @kanal';
  const shownError = draftError ?? error;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Qabul qiluvchilar</label>
      <div
        className={`flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-xl border bg-white/60 px-2 py-1.5 ${
          shownError ? 'border-red-300' : 'border-white/80 focus-within:border-indigo-300'
        }`}
      >
        {value.map((recipient) => (
          <span
            key={recipient}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-indigo-700"
          >
            {recipient}
            <button
              type="button"
              onClick={() => onChange(value.filter((r) => r !== recipient))}
              aria-label={`${recipient} ni olib tashlash`}
              className="rounded-full p-0.5 hover:bg-indigo-200"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              commit(text);
            }
          }}
          placeholder={value.length ? '' : placeholder}
          aria-label="Qabul qiluvchi qo'shish"
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {shownError ? (
        <p className="mt-1 text-xs font-medium text-red-500">{shownError}</p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          {channel === 'telegram'
            ? "Guruh chat ID sini bilish uchun botni guruhga qo'shib /chatid yozing."
            : 'Bir nechta raqamni vergul bilan ajratib yopishtirish mumkin.'}
        </p>
      )}
    </div>
  );
}
