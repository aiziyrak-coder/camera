import { CheckCircle2, CircleSlash, Loader2, MessageSquare, Send, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { NotificationStatus } from '../../lib/notificationsApi';

function Row({ ok, icon, title, detail }: { ok: boolean; icon: ReactNode; title: string; detail: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/40 px-3 py-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          ok ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {title}
          {ok ? (
            <CheckCircle2 size={14} className="text-emerald-500" aria-label="Sozlangan" />
          ) : (
            <CircleSlash size={14} className="text-slate-400" aria-label="Sozlanmagan" />
          )}
        </p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

/** Kanal holati — faqat o'qiladi. Sozlamalar serverning .env faylida
 *  (TELEGRAM_BOT_TOKEN, SMS_PROVIDER, ESKIZ_*, PARENT_NOTIFY_*). */
export default function NotificationStatusCard({
  status,
  loading,
  onTest,
}: {
  status: NotificationStatus | null;
  loading: boolean;
  onTest: () => void;
}) {
  return (
    <section className="glass p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700">Kanallar holati</h3>
        <button type="button" onClick={onTest} disabled={!status} className="btn-glass flex items-center gap-1.5 text-xs">
          <Send size={13} />
          Sinov xabari
        </button>
      </div>
      {loading && !status ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : status ? (
        <div className="space-y-2">
          <Row
            ok={status.telegramConfigured}
            icon={<Send size={15} />}
            title="Telegram bot"
            detail={
              status.telegramConfigured
                ? `${status.telegramBotUsername ? `@${status.telegramBotUsername}` : 'Bot nomi aniqlanmadi'}${
                    status.telegramPollingEnabled ? " · /start buyruqlari qabul qilinadi" : ' · polling o\'chiq'
                  }`
                : "Sozlanmagan — .env faylida TELEGRAM_BOT_TOKEN ni kiriting"
            }
          />
          <Row
            ok={status.smsConfigured}
            icon={<MessageSquare size={15} />}
            title="SMS (Eskiz.uz)"
            detail={
              status.smsConfigured
                ? `Yuboruvchi: ${status.smsSender ?? '—'}`
                : 'Sozlanmagan — SMS_PROVIDER=eskiz, ESKIZ_EMAIL va ESKIZ_PASSWORD'
            }
          />
          <Row
            ok={status.parentArrivalEnabled || status.parentAbsenceEnabled}
            icon={<Users size={15} />}
            title="Ota-onalarga xabar"
            detail={
              <>
                Kelganda: <b>{status.parentArrivalEnabled ? 'yoqilgan' : "o'chiq"}</b> · Kelmaganda:{' '}
                <b>{status.parentAbsenceEnabled ? 'yoqilgan' : "o'chiq"}</b>
                <span className="block text-[11px] text-slate-400">
                  Har bir talaba uchun alohida yoqiladi (Talabalar va Xodimlar → tahrirlash).
                </span>
              </>
            }
          />
        </div>
      ) : (
        <p className="text-xs text-slate-400">Holatni yuklab bo'lmadi.</p>
      )}
    </section>
  );
}
