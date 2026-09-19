import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ShieldCheck } from 'lucide-react';
import { Avatar, Badge, Button, Card, DateRangePicker, EmptyState, ErrorState, Select, SkeletonCard, Toolbar, cn, focusRing, formatUzDate } from '../../ui';
import { getAnalyticsChronic, situationPaths, type ChronicPerson } from '../../lib/situationApi';
import { exportRowsAsCsv } from '../../lib/csvExport';
import { ANALYTICS_PRESETS, periodSuffix, useAnalyticsPeriod } from './analyticsPeriod';
import { useLoader } from './useLoader';

const THRESHOLDS = [2, 3, 5, 7, 10].map((n) => ({ value: String(n), label: `${n} kundan` }));

function DateChips({ dates, tone, max = 12 }: { dates: string[]; tone: 'warning' | 'danger'; max?: number }) {
  const shown = dates.slice(-max);
  return (
    <span className="flex flex-wrap gap-1">
      {dates.length > shown.length && <span className="text-[11px] text-muted">+{dates.length - shown.length}</span>}
      {shown.map((d) => (
        <span key={d} className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums', tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger')}>
          {formatUzDate(d, { year: false })}
        </span>
      ))}
    </span>
  );
}

function ChronicRow({ p }: { p: ChronicPerson }) {
  return (
    <li>
      <Link to={situationPaths.person(p.id)} className={cn('group -mx-2 flex flex-col gap-3 rounded-control px-2 py-3 transition-colors hover:bg-surface-2 sm:flex-row sm:items-start', focusRing)}>
        <div className="flex min-w-0 items-center gap-3 sm:w-64 sm:shrink-0">
          <Avatar name={p.fullName} src={p.photoUrl ?? undefined} size="md" status={p.reasons.includes('kelmadi') ? 'danger' : 'warning'} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg group-hover:text-primary">{p.fullName}</p>
            <p className="truncate text-xs text-muted">{p.unit}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.reasons.includes('kech_keldi') && <Badge tone="warning">{p.lateDays} kun kech</Badge>}
              {p.reasons.includes('kelmadi') && <Badge tone="danger">{p.absentDays} kun kelmadi</Badge>}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {p.lateDates.length > 0 && (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 pt-0.5 text-[11px] text-muted">Kech:</span>
              <DateChips dates={p.lateDates} tone="warning" />
            </div>
          )}
          {p.absentDates.length > 0 && (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 pt-0.5 text-[11px] text-muted">Kelmadi:</span>
              <DateChips dates={p.absentDates} tone="danger" />
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

/** "Surunkali" tabi: davrda chegaradan ko'p kechikkan yoki kelmagan xodimlar. */
export function ChronicTab() {
  const [period, setPeriod] = useAnalyticsPeriod();
  const [minLate, setMinLate] = useState('3');
  const [minAbsent, setMinAbsent] = useState('3');
  const chronic = useLoader(
    `c:${period.from}:${period.to}:${minLate}:${minAbsent}`,
    (signal) => getAnalyticsChronic({ from: period.from, to: period.to, type: 'xodim', minLate: Number(minLate), minAbsent: Number(minAbsent) }, { signal }),
    { group: 'chronic' },
  );
  const rows = useMemo(() => chronic.data ?? [], [chronic.data]);
  const lateCount = rows.filter((r) => r.reasons.includes('kech_keldi')).length;
  const absentCount = rows.filter((r) => r.reasons.includes('kelmadi')).length;

  function exportCsv() {
    exportRowsAsCsv(
      ["F.I.Sh.", "Bo'linma", 'Kech (kun)', 'Kelmagan (kun)', 'Sabab', 'Kech kunlar', 'Kelmagan kunlar'],
      rows.map((r) => [
        r.fullName,
        r.unit,
        r.lateDays,
        r.absentDays,
        r.reasons.map((x) => (x === 'kelmadi' ? 'kelmadi' : 'kech keldi')).join(', '),
        r.lateDates.join(' '),
        r.absentDates.join(' '),
      ]),
      `surunkali_${periodSuffix(period)}.csv`,
    );
  }

  return (
    <>
      <Toolbar end={<Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} disabled={!rows.length}>CSV</Button>}>
        <DateRangePicker value={period} onChange={setPeriod} presets={ANALYTICS_PRESETS} size="sm" showSummary={false} />
        <Select size="sm" value={minLate} onChange={setMinLate} options={THRESHOLDS} ariaLabel="Kechikish chegarasi" label="Kech:" />
        <Select size="sm" value={minAbsent} onChange={setMinAbsent} options={THRESHOLDS} ariaLabel="Kelmaslik chegarasi" label="Kelmadi:" />
      </Toolbar>
      <Card>
        {chronic.data && (
          <p className="mb-2 text-sm text-muted">
            <span className="font-semibold text-fg">{rows.length}</span> kishi e'tibor talab qiladi · <span className="text-warning">{lateCount} surunkali kechikadi</span> ·{' '}
            <span className="text-danger">{absentCount} tez-tez kelmaydi</span>
          </p>
        )}
        {chronic.error && !chronic.data ? (
          <ErrorState message={chronic.error} onRetry={chronic.reload} />
        ) : chronic.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Surunkali holatlar yo'q" description="Bu davrda chegaradan oshgan xodim topilmadi." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <ChronicRow key={p.id} p={p} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
