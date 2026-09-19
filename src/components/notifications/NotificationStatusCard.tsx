import type { ReactNode } from 'react';
import { MessageSquare, Radio, Send, Users, type LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton, cn } from '../../ui';
import type { NotificationStatus } from '../../lib/notificationsApi';

function Row({ ok, icon: Icon, title, detail }: { ok: boolean; icon: LucideIcon; title: string; detail: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
          ok ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted',
        )}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-fg">{title}</p>
          <Badge tone={ok ? 'success' : 'neutral'} dot>
            {ok ? 'Sozlangan' : 'Sozlanmagan'}
          </Badge>
        </div>
        <div className="mt-0.5 text-[13px] text-muted">{detail}</div>
      </div>
    </li>
  );
}

/** Kanal holati — faqat o'qiladi. Sozlamalar serverning .env faylida
 *  (TELEGRAM_BOT_TOKEN, SMS_PROVIDER, ESKIZ_*, PARENT_NOTIFY_*). */
export default function NotificationStatusCard({
  status,
  loading,
  onTest,
  error,
  onRetry,
}: {
  status: NotificationStatus | null;
  loading: boolean;
  onTest: () => void;
  error?: string | null;
  onRetry?: () => void;
}) {
  let body: ReactNode;
  if (loading && !status) {
    body = (
      <div className="space-y-4" aria-busy="true" aria-label="Yuklanmoqda">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (status) {
    body = (
      <ul className="divide-y divide-border">
        <Row
          ok={status.telegramConfigured}
          icon={Send}
          title="Telegram bot"
          detail={
            status.telegramConfigured ? (
              <>
                {status.telegramBotUsername ? <span className="font-mono">@{status.telegramBotUsername}</span> : 'Bot nomi aniqlanmadi'}
                {status.telegramPollingEnabled ? ' · /start buyruqlari qabul qilinadi' : " · polling o'chiq"}
              </>
            ) : (
              <>
                .env faylida <code className="font-mono">TELEGRAM_BOT_TOKEN</code> ni kiriting
              </>
            )
          }
        />
        <Row
          ok={status.smsConfigured}
          icon={MessageSquare}
          title="SMS (Eskiz.uz)"
          detail={
            status.smsConfigured ? (
              `Yuboruvchi: ${status.smsSender ?? '—'}`
            ) : (
              <>
                <code className="font-mono">SMS_PROVIDER=eskiz</code>, <code className="font-mono">ESKIZ_EMAIL</code> va{' '}
                <code className="font-mono">ESKIZ_PASSWORD</code>
              </>
            )
          }
        />
        <Row
          ok={status.parentArrivalEnabled || status.parentAbsenceEnabled}
          icon={Users}
          title="Ota-onalarga xabar"
          detail={
            <>
              Kelganda: <b className="font-medium text-fg">{status.parentArrivalEnabled ? 'yoqilgan' : "o'chiq"}</b> · Kelmaganda:{' '}
              <b className="font-medium text-fg">{status.parentAbsenceEnabled ? 'yoqilgan' : "o'chiq"}</b>
              <span className="mt-0.5 block text-xs text-subtle">Har bir talaba uchun alohida yoqiladi (Reestr → tahrirlash).</span>
            </>
          }
        />
      </ul>
    );
  } else {
    body = <ErrorState message={error ?? "Holatni yuklab bo'lmadi."} onRetry={onRetry} />;
  }

  return (
    <Card>
      <CardHeader
        icon={Radio}
        title="Kanallar holati"
        subtitle="Server .env faylidan — faqat o'qiladi"
        actions={
          <Button size="sm" icon={Send} onClick={onTest} disabled={!status}>
            Sinov xabari
          </Button>
        }
      />
      {body}
    </Card>
  );
}
