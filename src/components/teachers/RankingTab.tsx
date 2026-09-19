import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Badge, Card, DateRangePicker, EmptyState, ErrorState, SearchInput, Tabs, Toolbar, formatPercent, formatUzDate, type Tone } from '../../ui';
import { getAnalyticsPeople, situationPaths, type PeopleSort, type PersonRank } from '../../lib/situationApi';
import { matchesName } from '../../lib/teachersApi';
import { RankingList, type RankingItem } from '../analytics';
import { ANALYTICS_PRESETS, useAnalyticsPeriod } from './analyticsPeriod';
import { useLoader } from './useLoader';

type Mode = 'late' | 'absent' | 'early' | 'best';

const MODES: Array<{ id: Mode; label: string; sort: PeopleSort; reverse: boolean }> = [
  { id: 'late', label: "Eng ko'p kechikkan", sort: 'late', reverse: false },
  { id: 'absent', label: "Eng ko'p kelmagan", sort: 'absent', reverse: false },
  { id: 'early', label: 'Eng erta keladigan', sort: 'arrival', reverse: true },
  { id: 'best', label: 'Eng yuqori davomat', sort: 'rate', reverse: true },
];

const STREAK_LABEL: Record<NonNullable<PersonRank['streakKind']>, string> = {
  kech_keldi: 'ketma-ket kech',
  kelmadi: 'ketma-ket kelmadi',
  aralash: 'ketma-ket muammo',
};

export function StreakBadge({ p }: { p: Pick<PersonRank, 'streak' | 'streakKind'> }) {
  if (p.streak < 2 || !p.streakKind) return null;
  return (
    <Badge tone={p.streakKind === 'kech_keldi' ? 'warning' : 'danger'} title="Hozirgacha davom etayotgan ketma-ket kunlar">
      {p.streak} kun {STREAK_LABEL[p.streakKind]}
    </Badge>
  );
}

function toItem(p: PersonRank, mode: Mode, max: number): RankingItem {
  const worked = p.presentDays + p.absentDays;
  let value: string;
  let hint: string;
  let tone: Tone;
  let bar: number | null;
  switch (mode) {
    case 'late':
      value = `${p.lateDays} kun`;
      hint = `${worked} ish kunidan · ${p.avgArrival ?? '—'}`;
      tone = 'warning';
      bar = max ? (p.lateDays / max) * 100 : 0;
      break;
    case 'absent':
      value = `${p.absentDays} kun`;
      hint = p.lastSeen ? `oxirgi: ${formatUzDate(p.lastSeen, { year: false })}` : "ko'rinmagan";
      tone = 'danger';
      bar = max ? (p.absentDays / max) * 100 : 0;
      break;
    case 'early':
      value = p.avgArrival ?? '—';
      hint = `o'rtacha · ${p.presentDays} kun`;
      tone = 'success';
      bar = null;
      break;
    default:
      value = formatPercent(p.rate, 1);
      hint = `${p.presentDays}/${worked} kun · ${p.lateDays} kech`;
      tone = 'success';
      bar = p.rate;
  }
  return {
    id: p.id,
    name: p.fullName,
    photoUrl: p.photoUrl,
    subtitle: p.unit,
    value,
    valueHint: hint,
    valueTone: tone,
    bar,
    badges: <StreakBadge p={p} />,
    to: situationPaths.person(p.id),
  };
}

/** "Reyting" tabi: xodimlar reytingi (kechikish, kelmaslik, erta kelish, davomat). */
export function RankingTab() {
  const [period, setPeriod] = useAnalyticsPeriod();
  const [mode, setMode] = useState<Mode>('late');
  const [search, setSearch] = useState('');
  const cfg = MODES.find((m) => m.id === mode) ?? MODES[0];
  const people = useLoader(
    `p:${period.from}:${period.to}:${cfg.sort}`,
    (signal) => getAnalyticsPeople({ from: period.from, to: period.to, type: 'xodim', sort: cfg.sort, limit: 500 }, { signal }),
    { group: 'people' },
  );

  const items = useMemo(() => {
    let rows = people.data ?? [];
    if (cfg.reverse) rows = [...rows].reverse().filter((p) => (mode === 'early' ? p.avgArrivalMinutes !== null : p.rate !== null));
    if (mode === 'late') rows = rows.filter((p) => p.lateDays > 0);
    if (mode === 'absent') rows = rows.filter((p) => p.absentDays > 0);
    if (mode === 'best') rows = [...rows].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.presentDays - a.presentDays || a.lateDays - b.lateDays);
    if (search.trim()) rows = rows.filter((p) => matchesName(p.fullName, search) || matchesName(p.unit, search));
    const max = Math.max(1, ...rows.map((p) => (mode === 'absent' ? p.absentDays : p.lateDays)));
    return rows.slice(0, 100).map((p) => toItem(p, mode, max));
  }, [people.data, cfg.reverse, mode, search]);

  return (
    <>
      <Toolbar>
        <DateRangePicker value={period} onChange={setPeriod} presets={ANALYTICS_PRESETS} size="sm" showSummary={false} />
        <SearchInput value={search} onChange={setSearch} placeholder="Ism yoki bo'linma…" ariaLabel="Reytingda qidirish" />
      </Toolbar>
      <Tabs variant="segmented" value={mode} onChange={setMode} ariaLabel="Reyting turi" tabs={MODES.map(({ id, label }) => ({ id, label }))} className="max-w-full overflow-x-auto" />
      <Card>
        {people.error && !people.data ? (
          <ErrorState message={people.error} onRetry={people.reload} />
        ) : !people.loading && items.length === 0 ? (
          <EmptyState icon={Trophy} title="Hech kim yo'q" description={search ? "Qidiruvga mos xodim topilmadi." : 'Bu davrda mos yozuvlar yo\'q — ajoyib!'} />
        ) : (
          <RankingList items={items} loading={people.loading} ariaLabel={cfg.label} />
        )}
        {items.length === 100 && <p className="mt-3 text-center text-xs text-muted">Birinchi 100 kishi ko'rsatilmoqda</p>}
      </Card>
    </>
  );
}
