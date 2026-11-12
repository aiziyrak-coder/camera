/* Telegram bot: holat, ota-onalar qamrovi va yuborilgan xabarlar. */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, Search, Send } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { formatLogTime, notificationsApi, type NotificationLogEntry, type NotificationLogPage, type NotificationStatus } from '../lib/notificationsApi';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Alert, Badge, Button, Empty, PageHead, Select, Spinner, errorText, formatNumber } from '../kit';

interface ParentCoverage {
  students: number;
  telegramLinked: number;
  phoneOnly: number;
  enabled: number;
  arrivalEnabled: boolean;
  absenceEnabled: boolean;
  weekSent: number;
  weekFailed: number;
  weekSkipped: number;
}

const KIND_LABEL: Record<string, string> = {
  parent_arrival: 'Ota-onaga: keldi',
  parent_absence: 'Ota-onaga: kelmadi',
  system: 'Tizim',
};

const STATUS_FILTERS = [
  { value: 'yuborildi', label: 'Yuborilgan' },
  { value: 'xato', label: 'Xato' },
  { value: 'otkazildi', label: 'O‘tkazib yuborilgan' },
];

export default function TelegramPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [parents, setParents] = useState<ParentCoverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notificationsApi
      .status(token)
      .then(setStatus)
      .catch((err) => setError(errorText(err)));
    api
      .get<ParentCoverage>('/api/notifications/ota-ona', token)
      .then(setParents)
      .catch(() => undefined);
  }, [token]);

  if (error) return <Alert>{error}</Alert>;
  if (!status) return <Spinner />;

  return (
    <div className="max-w-4xl">
      <PageHead title="Telegram" text="Ota-onalarga va xodimlarga Telegram orqali xabar yuborish" />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${status.telegramConfigured ? 'bg-ok-tint text-ok' : 'bg-bad-tint text-bad'}`}>
              <Send size={22} aria-hidden />
            </span>
            <div>
              <p className="text-[17px] font-semibold text-ink">{status.telegramConfigured ? 'Bot ishlayapti' : 'Bot sozlanmagan'}</p>
              {status.telegramBotUsername && (
                <a href={`https://t.me/${status.telegramBotUsername}`} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-brand hover:underline">
                  @{status.telegramBotUsername}
                </a>
              )}
            </div>
          </div>
          <ul className="mt-5 flex flex-col gap-2.5 text-[14px]">
            <Toggle label="Talaba kelganda ota-onaga xabar" on={status.parentArrivalEnabled} />
            <Toggle label="Talaba kelmaganda ota-onaga xabar" on={status.parentAbsenceEnabled} />
            <Toggle label="Botga yozilgan xabarlarni qabul qilish" on={status.telegramPollingEnabled} />
          </ul>
          <p className="mt-4 text-[13px] text-faint">Bu sozlamalar serverda o‘rnatiladi.</p>
        </div>

        <div className="card p-6">
          <p className="text-[17px] font-semibold text-ink">Ota-onalar</p>
          {parents ? (
            <>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[30px] font-semibold tracking-tight text-ink">{formatNumber(parents.telegramLinked)}</span>
                <span className="text-[14px] text-soft">/ {formatNumber(parents.students)} talabaning ota-onasi botga ulangan</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-brand" style={{ width: `${parents.students ? (parents.telegramLinked / parents.students) * 100 : 0}%` }} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                <Mini label="7 kunda yuborildi" value={parents.weekSent} tone="text-ok" />
                <Mini label="Xato" value={parents.weekFailed} tone={parents.weekFailed ? 'text-bad' : 'text-ink'} />
                <Mini label="O‘tkazildi" value={parents.weekSkipped} tone="text-soft" />
              </dl>
            </>
          ) : (
            <p className="mt-4 text-[14px] text-soft">Yuklanmoqda...</p>
          )}
        </div>
      </div>

      <MessageLog />
    </div>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-ink">{label}</span>
      <Badge tone={on ? 'ok' : 'plain'}>{on ? 'Yoqilgan' : 'O‘chiq'}</Badge>
    </li>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-page px-2 py-3">
      <dd className={`text-[20px] font-semibold ${tone}`}>{formatNumber(value)}</dd>
      <dt className="mt-0.5 text-[12px] text-faint">{label}</dt>
    </div>
  );
}

function MessageLog() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 350);
  const [data, setData] = useState<NotificationLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debounced]);

  useEffect(() => {
    const controller = new AbortController();
    notificationsApi
      .log({ page, pageSize: 20, status: statusFilter as NotificationLogEntry['status'] | '', search: debounced }, token, controller.signal)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [page, statusFilter, debounced, token]);

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-[18px] font-semibold text-ink">Yuborilgan xabarlar</h2>
        <div className="relative w-full sm:w-64">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input className="input h-10 pl-9 text-[14px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish" aria-label="Xabarlarni qidirish" />
        </div>
        <Select value={statusFilter} onChange={setStatusFilter} placeholder="Hammasi" options={STATUS_FILTERS} className="h-10 w-full text-[14px] sm:w-48" ariaLabel="Holat" />
      </div>

      {error ? (
        <Alert>{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <div className="card">
          <Empty icon={MessageCircle} title="Xabar yo‘q" text="Hali hech qanday xabar yuborilmagan." />
        </div>
      ) : (
        <>
          <div className="card divide-y divide-line">
            {data.items.map((m) => (
              <div key={m.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-faint">{formatLogTime(m.createdAt)}</span>
                  <span className="text-[13px] text-soft">· {KIND_LABEL[m.kind] ?? m.kind}</span>
                  <span className="ml-auto">
                    <Badge tone={m.status === 'yuborildi' ? 'ok' : m.status === 'xato' ? 'bad' : 'plain'}>
                      {m.status === 'yuborildi' ? 'Yuborildi' : m.status === 'xato' ? 'Xato' : 'O‘tkazildi'}
                    </Badge>
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-[14px] text-ink">{m.text}</p>
                {m.error && <p className="mt-1 text-[13px] text-bad">{m.error}</p>}
              </div>
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Oldingi
              </Button>
              <span className="text-[14px] text-soft">
                {page} / {data.totalPages}
              </span>
              <Button size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                Keyingi <ChevronRight size={15} aria-hidden />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
