import { DataTable, ProgressBar, formatNumber, formatPercent, toneForRate, type DataTableColumn } from '../../ui';
import type { GroupStat, KafedraStat } from '../../lib/situationApi';

function RateCell({ rate }: { rate: number | null }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <ProgressBar value={rate} size="sm" className="hidden w-20 sm:block" ariaLabel="Davomat" />
      <span className="w-12 text-right font-semibold tabular-nums text-fg">{formatPercent(rate, 1)}</span>
    </span>
  );
}

function RankCell({ rank }: { rank: number }) {
  return <span className="tabular-nums text-muted">{rank}</span>;
}

type RankedGroup = GroupStat & { rank: number };
type RankedKafedra = KafedraStat & { rank: number };

export function GroupsRanking({
  rows,
  loading,
  error,
  onRetry,
  onOpen,
  filtered,
}: {
  rows: RankedGroup[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (row: RankedGroup) => void;
  filtered: boolean;
}) {
  const columns: DataTableColumn<RankedGroup>[] = [
    { key: 'rank', header: '#', width: '3rem', cell: (r) => <RankCell rank={r.rank} />, sortValue: (r) => r.rank, hideOnMobile: true },
    {
      key: 'name',
      header: 'Guruh',
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="min-w-0">
          <span className="block font-medium text-fg">
            <span className="mr-1.5 text-muted md:hidden">{r.rank}.</span>
            {r.name}
          </span>
          <span className="block truncate text-xs text-muted">{r.faculty ?? 'Fakultetsiz'}</span>
        </span>
      ),
    },
    { key: 'course', header: 'Kurs', cell: (r) => (r.course ? `${r.course}-kurs` : '—'), sortValue: (r) => r.course, hideOnMobile: true },
    { key: 'total', header: 'Talabalar', align: 'right', cell: (r) => formatNumber(r.total), sortValue: (r) => r.total, sortFirst: 'desc' },
    { key: 'present', header: 'Keldi', align: 'right', cell: (r) => <span className="text-success">{formatNumber(r.present)}</span>, sortValue: (r) => r.present, sortFirst: 'desc' },
    { key: 'late', header: 'Kech', align: 'right', cell: (r) => <span className="text-warning">{formatNumber(r.late)}</span>, sortValue: (r) => r.late, sortFirst: 'desc', hideOnMobile: true },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (r) => <span className="text-danger">{formatNumber(r.absent)}</span>, sortValue: (r) => r.absent, sortFirst: 'desc' },
    { key: 'rate', header: 'Davomat', align: 'right', width: '10rem', cell: (r) => <RateCell rate={r.rate} />, sortValue: (r) => r.rate, sortFirst: 'desc' },
  ];
  return (
    <DataTable
      ariaLabel="Guruhlar reytingi"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.name}
      onRowClick={onOpen}
      rowTone={(r) => (r.rate === null ? null : toneForRate(r.rate))}
      loading={loading && rows.length === 0}
      error={error}
      onRetry={onRetry}
      maxHeight="min(75vh, 60rem)"
      emptyTitle={filtered ? 'Guruh topilmadi' : "Guruhlar bo'yicha ma'lumot yo'q"}
      emptyDescription={filtered ? "Filtrlarni o'zgartiring." : 'Talabalar reestrga «N-kurs, GURUH» ko‘rinishida kiritilganda guruhlar shu yerda chiqadi.'}
    />
  );
}

export function KafedrasRanking({
  rows,
  loading,
  error,
  onRetry,
  onOpen,
  filtered,
}: {
  rows: RankedKafedra[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (row: RankedKafedra) => void;
  filtered: boolean;
}) {
  const columns: DataTableColumn<RankedKafedra>[] = [
    { key: 'rank', header: '#', width: '3rem', cell: (r) => <RankCell rank={r.rank} />, sortValue: (r) => r.rank, hideOnMobile: true },
    {
      key: 'name',
      header: 'Kafedra',
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="min-w-0">
          <span className="block font-medium text-fg">
            <span className="mr-1.5 text-muted md:hidden">{r.rank}.</span>
            {r.name}
          </span>
          <span className="block truncate text-xs text-muted">{r.building ?? 'Bino ko‘rsatilmagan'}</span>
        </span>
      ),
    },
    { key: 'staff', header: 'Xodimlar', align: 'right', cell: (r) => formatNumber(r.staffTotal), sortValue: (r) => r.staffTotal, sortFirst: 'desc' },
    { key: 'present', header: 'Keldi', align: 'right', cell: (r) => <span className="text-success">{formatNumber(r.present)}</span>, sortValue: (r) => r.present, sortFirst: 'desc', hideOnMobile: true },
    { key: 'absent', header: 'Kelmadi', align: 'right', cell: (r) => <span className="text-danger">{formatNumber(r.absent)}</span>, sortValue: (r) => r.absent, sortFirst: 'desc' },
    { key: 'lessons', header: 'Darslar', align: 'right', cell: (r) => formatNumber(r.lessonsToday), sortValue: (r) => r.lessonsToday, sortFirst: 'desc', hideOnMobile: true },
    {
      key: 'teacherLate',
      header: 'Kechikkan / o‘tilmagan',
      mobileLabel: 'Kech / o‘tilmagan dars',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums">
          <span className={r.teacherLateLessons ? 'text-warning' : 'text-muted'}>{r.teacherLateLessons}</span>
          <span className="text-subtle"> / </span>
          <span className={r.teacherMissedLessons ? 'font-semibold text-danger' : 'text-muted'}>{r.teacherMissedLessons}</span>
        </span>
      ),
      sortValue: (r) => r.teacherMissedLessons * 1000 + r.teacherLateLessons,
      sortFirst: 'desc',
    },
    { key: 'rate', header: 'Davomat', align: 'right', width: '10rem', cell: (r) => <RateCell rate={r.rate} />, sortValue: (r) => r.rate, sortFirst: 'desc' },
  ];
  return (
    <DataTable
      ariaLabel="Kafedralar reytingi"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={onOpen}
      rowTone={(r) => (r.rate === null ? null : toneForRate(r.rate))}
      loading={loading && rows.length === 0}
      error={error}
      onRetry={onRetry}
      maxHeight="min(75vh, 60rem)"
      emptyTitle={filtered ? 'Kafedra topilmadi' : "Kafedralar bo'yicha ma'lumot yo'q"}
      emptyDescription={filtered ? "Qidiruvni o'zgartiring." : "Tashkiliy tuzilmada kafedralar qo'shilib, xodimlar ularga biriktirilganda chiqadi."}
    />
  );
}
