import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { Notice } from '../settings/kit';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import {
  notificationsApi,
  validateRecipient,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationTestResult,
} from '../../lib/notificationsApi';

const CHANNEL_OPTIONS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'sms', label: 'SMS (Eskiz)' },
];

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
    <Modal
      open={open}
      onClose={onClose}
      title="Sinov xabari"
      description="Kanal sozlamalari to'g'riligini darhol tekshiring — natija jurnalga ham yoziladi."
      size="md"
      dismissible={!sending}
      footer={
        <>
          <Button onClick={onClose} disabled={sending}>
            Yopish
          </Button>
          <Button type="submit" form="notification-test-form" variant="primary" icon={Send} loading={sending}>
            Yuborish
          </Button>
        </>
      }
    >
      <form id="notification-test-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Kanal">
          <Select
            value={channel}
            onChange={(v) => {
              setChannel(v as NotificationChannel);
              setResult(null);
            }}
            options={CHANNEL_OPTIONS}
          />
        </Field>
        {status && !channelReady && <Notice tone="warning">Bu kanal serverda sozlanmagan — xabar yuborilmaydi, jurnalga sababi yoziladi.</Notice>}
        <Field label={channel === 'telegram' ? 'Telegram chat ID' : 'Telefon raqami'} required error={error}>
          <Input
            placeholder={channel === 'telegram' ? '123456789 yoki -100…' : '+998 90 123 45 67'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoComplete="off"
            className="font-mono"
          />
        </Field>
        <Field label="Matn (ixtiyoriy)" hint={`${text.length} / 500`}>
          <Textarea placeholder="Bildirishnomalar to'g'ri sozlangan." value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} />
        </Field>
        {result &&
          (result.ok ? (
            <Notice tone="success">Xabar yuborildi.</Notice>
          ) : (
            <Notice tone="danger" title="Yuborib bo'lmadi">
              {result.error ?? "Yuborib bo'lmadi"}
            </Notice>
          ))}
      </form>
    </Modal>
  );
}
