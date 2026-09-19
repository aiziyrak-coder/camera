import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Modal from '../Modal';
import { SelectField, TextField } from '../FormField';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import {
  notificationsApi,
  validateRecipient,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationTestResult,
} from '../../lib/notificationsApi';

/** "Sinov xabari": sozlamalar to'g'riligini darhol tekshirish — natija
 *  (yoki Telegram/Eskiz qaytargan xato) shu oynada ko'rinadi. */
export default function TestMessageModal({
  open,
  status,
  onClose,
  onSent,
}: {
  open: boolean;
  status: NotificationStatus | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { token } = useAuth();
  const [channel, setChannel] = useState<NotificationChannel>('telegram');
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotificationTestResult | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(status && !status.telegramConfigured && status.smsConfigured ? 'sms' : 'telegram');
    setRecipient('');
    setText('');
    setError(null);
    setResult(null);
  }, [open, status]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const [clean, err] = validateRecipient(channel, recipient);
    if (!clean) {
      setError(err ?? 'Qabul qiluvchini kiriting');
      return;
    }
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const res = await notificationsApi.sendTest({ channel, recipient: clean, text: text.trim() || null }, token);
      setResult(res);
      onSent();
    } catch (err2) {
      setError(err2 instanceof ApiError ? err2.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setSending(false);
    }
  }

  const channelReady = channel === 'telegram' ? status?.telegramConfigured : status?.smsConfigured;

  return (
    <Modal open={open} onClose={onClose} title="Sinov xabari" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <SelectField
          label="Kanal"
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as NotificationChannel);
            setResult(null);
          }}
          options={[
            { value: 'telegram', label: 'Telegram' },
            { value: 'sms', label: 'SMS (Eskiz)' },
          ]}
        />
        {status && !channelReady && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Bu kanal serverda sozlanmagan — xabar yuborilmaydi, jurnalga sababi yoziladi.
          </p>
        )}
        <TextField
          label={channel === 'telegram' ? 'Telegram chat ID' : 'Telefon raqami'}
          placeholder={channel === 'telegram' ? '123456789 yoki -100…' : '+998 90 123 45 67'}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          error={error ?? undefined}
          autoComplete="off"
        />
        <TextField
          label="Matn (ixtiyoriy)"
          placeholder="Bildirishnomalar to'g'ri sozlangan."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
        {result &&
          (result.ok ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={15} /> Xabar yuborildi.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
              <XCircle size={15} className="mt-0.5 shrink-0" /> {result.error ?? "Yuborib bo'lmadi"}
            </p>
          ))}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-glass">
            Yopish
          </button>
          <button
            type="submit"
            disabled={sending}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sending ? 'Yuborilmoqda...' : 'Yuborish'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
