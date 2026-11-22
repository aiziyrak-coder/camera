/* Telegram bot: holat, ota-onalar qamrovi va yuborilgan xabarlar. */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, Search, Send } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { formatLogTime, notificationsApi, type NotificationLogEntry, type NotificationLogPage, type NotificationStatus } from '../lib/notificationsApi';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Alert, Badge, Button, Dot, Empty, IconButton, PageHead, Panel, Select, Spinner, Stat, errorText, formatNumber } from '../kit';

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

  if (error)
    return (
      <div className="p-6">
        <Alert>{error}</Alert>
      </div>
    );
  if (!status) return <Spinner />;

  return (
    <div>
      <PageHead
        title="Telegram"
        text="Ota-onalarga va xodimlarga Telegram orqali xabar yuborish"
        actions={
          status.telegramBotUsername && (
            <a href={`https://t.me/${status.telegramBotUsername}`} target="_blank" rel="noreferrer">
              <Button icon={Send}>@{status.telegramBotUsername}</Button>
            </a>
          )
        }
      />

      <div className="flex flex-col gap-5 p-4 lg:p-6">
        {!status.telegramConfigured && (
          <Alert tone="warn">
            Telegram bot hali ulanmagan — ota-onalarga xabar yuborilmaydi. Ishga tushirish uchun bot tokeni (BotFather) serverga kiritilishi kerak.
          </Alert>
        )}
        <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4 [&>*]:bg-white">
          <Stat
            label="Bot"
            value={
              <span className="flex items-center gap-2 text-[18px]">
                <Dot tone={status.telegramConfigured ? 'ok' : 'bad'} />
                {status.telegramConfigured ? 'Ishlayapti' : 'Sozlanmagan'}
              </span>
            }
          />
          <Stat
            label="Botga ulangan ota-onalar"
            value={parents ? formatNumber(parents.telegramLinked) : '—'}
            meter={parents && parents.students ? parents.telegramLinked / parents.students : 0}
            sub={parents ? `${formatNumber(parents.students)} talabadan` : undefined}
          />
          <Stat label="7 kunda yuborildi" value={parents ? formatNumber(parents.weekSent) : '—'} />
          <Stat label="7 kunda xato" value={parents ? formatNumber(parents.weekFailed) : '—'} sub={parents ? `${formatNumber(parents.weekSkipped)} ta o‘tkazib yuborildi` : undefined} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <MessageLog />
          <Panel title="Sozlamalar" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              <Toggle label="Talaba kelganda ota-onaga xabar" on={status.parentArrivalEnabled} />
              <Toggle label="Talaba kelmaganda ota-onaga xabar" on={status.parentAbsenceEnabled} />
              <Toggle label="Botga yozilgan xabarlarni qabul qilish" on={status.telegramPollingEnabled} />
            </ul>
            <p className="border-t border-line px-4 py-3 text-[12px] text-faint">Bu sozlamalar serverda o‘rnatiladi.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
      <span className="text-ink">{label}</span>
      <Badge tone={on ? 'ok' : 'plain'}>{on ? 'Yoqilgan' : 'O‘chiq'}</Badge>
    </li>
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
    <Panel
      title="Yuborilgan xabarlar"
      bodyClassName="p-0"
      actions={
        <>
          <div className="relative hidden w-52 sm:block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input className="input h-7 pl-8 text-[12.5px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish" aria-label="Xabarlarni qidirish" />
          </div>
          <Select value={statusFilter} onChange={setStatusFilter} placeholder="Hammasi" options={STATUS_FILTERS} className="h-7 w-40 text-[12.5px]" ariaLabel="Holat" />
        </>
      }
    >
      {error ? (
        <div className="p-4">
          <Alert>{error}</Alert>
        </div>
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty icon={MessageCircle} title="Xabar yo‘q" text="Hali hech qanday xabar yuborilmagan." />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.items.map((m) => (
              <li key={m.id} className="flex gap-4 px-4 py-3">
                <span className="tnum w-28 shrink-0 pt-px text-[12px] text-faint">{formatLogTime(m.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-soft">{KIND_LABEL[m.kind] ?? m.kind}</p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] text-ink">{m.text}</p>
                  {m.error && <p className="mt-1 text-[12px] text-bad">{m.error}</p>}
                </div>
                <span className="shrink-0">
                  <Badge tone={m.status === 'yuborildi' ? 'ok' : m.status === 'xato' ? 'bad' : 'plain'}>
                    {m.status === 'yuborildi' ? 'Yuborildi' : m.status === 'xato' ? 'Xato' : 'O‘tkazildi'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <div className="flex h-11 items-center justify-end gap-1 border-t border-line px-3 text-[12.5px] text-soft">
              <IconButton icon={ChevronLeft} label="Oldingi" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} />
              <span className="tnum min-w-[64px] text-center">
                {page} / {data.totalPages}
              </span>
              <IconButton icon={ChevronRight} label="Keyingi" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
