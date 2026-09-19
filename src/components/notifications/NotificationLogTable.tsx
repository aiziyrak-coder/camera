import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import Badge from '../Badge';
import Pagination from '../Pagination';
import SearchInput from '../ui/SearchInput';
import SelectFilter from '../ui/SelectFilter';
import { useServerPage } from '../../lib/useServerPage';
import {
  CHANNEL_LABELS,
  KIND_OPTIONS,
  STATUS_LABELS,
  formatLogTime,
  kindLabel,
  type NotificationLogEntry,
  type NotificationLogStatus,
} from '../../lib/notificationsApi';

const STATUS_TONE: Record<NotificationLogStatus, 'green' | 'red' | 'slate'> = {
  yuborildi: 'green',
  xato: 'red',
  otkazildi: 'slate',
};

const KIND_FILTER_OPTIONS = [
  ...KIND_OPTIONS.map((k) => ({ value: k.value, label: k.label })),
  { value: 'parent_arrival', label: kindLabel('parent_arrival') },
  { value: 'parent_absence', label: kindLabel('parent_absence') },
];

/** Yetkazish jurnali — "nega xabar kelmadi?" savoliga javob. `refreshKey`
 *  o'zgarsa (masalan sinov xabari yuborilgach) qayta yuklanadi. */
export default function NotificationLogTable({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const { items, page, setPage, totalPages, total, pageSize, loading, refreshing, error, reload } =
    useServerPage<NotificationLogEntry>(
      '/api/notifications/log',
      { status: status || undefined, channel: channel || undefined, kind: kind || undefined, search: search || undefined },
      20,
    );

  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey, reload]);

  return (
    <section className="glass p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Yetkazish jurnali</h3>
          <p className="text-xs text-slate-500">Har bir xabar: kimga, qaysi kanal orqali va natijasi</p>
        </div>
        <button type="button" onClick={reload} className="btn-glass flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Yangilash
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Qabul qiluvchi, matn yoki xato" ariaLabel="Jurnaldan qidirish" />
        <SelectFilter
          label="Holat"
          value={status}
          onChange={setStatus}
          options={(Object.keys(STATUS_LABELS) as NotificationLogStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <SelectFilter
          label="Kanal"
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'telegram', label: CHANNEL_LABELS.telegram },
            { value: 'sms', label: CHANNEL_LABELS.sms },
          ]}
        />
        <SelectFilter label="Turi" value={kind} onChange={setKind} options={KIND_FILTER_OPTIONS} />
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          {status || channel || kind || search ? 'Filtrlarga mos yozuv topilmadi' : "Hali hech qanday xabar yuborilmagan"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Vaqt</th>
                <th className="px-4 py-3">Turi</th>
                <th className="px-4 py-3">Kanal</th>
                <th className="px-4 py-3">Qabul qiluvchi</th>
                <th className="px-4 py-3">Xabar</th>
                <th className="px-4 py-3">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {items.map((row) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-white/40">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{formatLogTime(row.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{kindLabel(row.kind)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{row.recipient}</td>
                  <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                    <p className="line-clamp-2 whitespace-pre-line" title={row.text}>
                      {row.text}
                    </p>
                    {row.error && <p className="mt-1 text-[11px] font-medium text-red-500">{row.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
          </div>
        </div>
      )}
    </section>
  );
}
