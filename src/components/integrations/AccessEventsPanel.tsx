import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import Badge from '../Badge';
import Pagination from '../Pagination';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useServerPage } from '../../lib/useServerPage';
import { formatDateTime, peopleSearchLink, type AccessDevice, type AccessEventItem } from '../../lib/integrationsApi';

const inputClass =
  'rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300';

export default function AccessEventsPanel({ devices }: { devices: AccessDevice[] }) {
  const [deviceId, setDeviceId] = useState('');
  const [granted, setGranted] = useState('');
  const [matched, setMatched] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const { items, page, setPage, totalPages, total, pageSize, loading, refreshing, error, reload } =
    useServerPage<AccessEventItem>(
      '/api/access/events',
      {
        deviceId: deviceId || undefined,
        granted: granted || undefined,
        matched: matched || undefined,
        from: from || undefined,
        to: to || undefined,
        search: search.trim() || undefined,
      },
      25,
    );

  return (
    <section className="glass-deep p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">Kirish hodisalari jurnali</h3>
        {refreshing && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism, karta yoki xodim raqami"
          aria-label="Qidirish"
          className={`${inputClass} min-w-[14rem] flex-1`}
        />
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Qurilma" className={inputClass}>
          <option value="">Barcha qurilmalar</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={granted} onChange={(e) => setGranted(e.target.value)} aria-label="Natija" className={inputClass}>
          <option value="">Ruxsat: hammasi</option>
          <option value="true">Ruxsat berilgan</option>
          <option value="false">Rad etilgan</option>
        </select>
        <select value={matched} onChange={(e) => setMatched(e.target.value)} aria-label="Odam" className={inputClass}>
          <option value="">Odam: hammasi</option>
          <option value="true">Aniqlangan</option>
          <option value="false">Aniqlanmagan</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Sanadan" className={inputClass} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sanagacha" className={inputClass} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact title="Hodisa topilmadi" description="Filtrlarni o'zgartiring yoki qurilma ulanganini tekshiring." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/70">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Vaqt</th>
                  <th className="px-3 py-3">Qurilma</th>
                  <th className="px-3 py-3">Yo'nalish</th>
                  <th className="px-3 py-3">Odam</th>
                  <th className="px-3 py-3">Karta / raqam</th>
                  <th className="px-3 py-3">Natija</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <tr key={event.id} className="border-t border-white/60">
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-700">
                      {formatDateTime(event.occurredAt, true)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{event.deviceName ?? "O'chirilgan qurilma"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {event.direction === 'kirish' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownLeft size={12} />Kirish</span>
                      ) : event.direction === 'chiqish' ? (
                        <span className="inline-flex items-center gap-1 text-amber-700"><ArrowUpRight size={12} />Chiqish</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {event.personName ? (
                        <>
                          <Link to={peopleSearchLink(event.personName)} className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline">
                            {event.personName}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {event.personType === 'xodim' ? 'Xodim' : 'Talaba'}
                            {event.personUnit ? ` · ${event.personUnit}` : ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Aniqlanmagan</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {event.cardNumber ?? '—'}
                      {event.employeeNo && <span className="block text-slate-400">№ {event.employeeNo}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {event.granted ? <Badge tone="green">Ruxsat</Badge> : <Badge tone="red">Rad etildi</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </>
      )}
    </section>
  );
}
