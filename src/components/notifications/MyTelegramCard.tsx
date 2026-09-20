import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Link2, RefreshCw, Unlink, UserRound } from 'lucide-react';
import { Button, Card, CardHeader, ErrorState, SkeletonText } from '../../ui';
import { Notice } from '../settings/kit';
import TelegramLinkBox from './TelegramLinkBox';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useApiResource } from '../../lib/useApiResource';
import { formatUzPhone, notificationsApi, type MyNotifications, type TelegramLink } from '../../lib/notificationsApi';

/** "Mening Telegramim" — shaxsiy bildirishnomalar (tayinlangan hodisa,
 *  muddati o'tgan hodisa) uchun o'z hisobini botga bog'lash. */
export default function MyTelegramCard() {
  const { token } = useAuth();
  const { data, loading, error: loadError, reload } = useApiResource<MyNotifications>('/api/notifications/me');
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Bog'ladim — holatni tekshirish" bosilganda, agar hali bog'lanmagan
  // bo'lsa, EKRANDA HECH NARSA O'ZGARMASDI — tugma buzuq deb o'ylanardi.
  // Javob kelgach natijani aytamiz.
  const [checkRequested, setCheckRequested] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const lastData = useRef(data);

  useEffect(() => {
    if (lastData.current === data) return; // yangi javob kelmadi
    lastData.current = data;
    if (!checkRequested) return;
    setCheckRequested(false);
    setCheckMessage(
      data?.telegramLinked ? null : "Hali bog'lanmagan — havolani oching va Telegram'da «Start» ni bosing, so'ng qayta tekshiring.",
    );
  }, [data, checkRequested]);

  function checkStatus() {
    setCheckMessage(null);
    setCheckRequested(true);
    reload();
  }

  async function createLink() {
    setBusy(true);
    setError(null);
    setCheckMessage(null);
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

  let body;
  if (loading && !data) {
    body = <SkeletonText lines={3} />;
  } else if (data) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted">
          Sizga tayinlangan va muddati o'tgan hodisalar haqida shaxsiy xabar keladi. Telegram bog'lanmagan bo'lsa — SMS (
          {data.phone ? <span className="tabular-nums text-fg">{formatUzPhone(data.phone)}</span> : 'telefon raqami kiritilmagan'}).
        </p>
        {data.telegramLinked ? (
          <Notice
            tone="success"
            icon={CheckCircle2}
            action={
              <Button size="sm" variant="ghost" icon={Unlink} onClick={() => void unlink()} loading={busy} className="text-danger hover:text-danger">
                Uzish
              </Button>
            }
          >
            <span className="font-medium">Telegram bog'langan</span>
          </Notice>
        ) : !data.telegramBotConfigured ? (
          <Notice tone="neutral">Telegram bot hali sozlanmagan — administratorga murojaat qiling.</Notice>
        ) : link ? (
          <>
            <TelegramLinkBox link={link} />
            <Button icon={RefreshCw} onClick={checkStatus} loading={loading} fullWidth>
              Bog'ladim — holatni tekshirish
            </Button>
            {checkMessage && <Notice tone="warning">{checkMessage}</Notice>}
          </>
        ) : (
          <Button variant="primary" icon={Link2} onClick={() => void createLink()} loading={busy} fullWidth>
            Telegramni bog'lash
          </Button>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    );
  } else {
    body = <ErrorState message={loadError ?? "Ma'lumotni yuklab bo'lmadi."} onRetry={reload} />;
  }

  return (
    <Card>
      <CardHeader
        icon={UserRound}
        title="Mening Telegramim"
        subtitle="Shaxsiy bildirishnomalar uchun"
        actions={data && !loading ? <Button size="sm" variant="ghost" icon={RefreshCw} onClick={reload}>Yangilash</Button> : undefined}
      />
      {body}
    </Card>
  );
}
