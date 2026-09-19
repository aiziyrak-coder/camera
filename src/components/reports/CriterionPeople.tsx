import { Camera as CameraIcon, Clock } from 'lucide-react';
import { Avatar, DataTable, SearchInput, Tabs, Toolbar, type DataTableColumn } from '../../ui';
import ReportPager from './ReportPager';
import type { ReportCriterion, ReportPersonRow } from '../../types';

/** 2-daraja: kartadagi raqam ortidagi odamlar.
 *
 * Har qatorda "isbot" belgilari bor — qachon kelgani (check-in) va uni
 * oxirgi marta qaysi kamera ko'rgani. Qatorni bosish odamning to'liq
 * kesimini (Drawer) ochadi. */
export default function CriterionPeople({
  criterion,
  bucket,
  onBucketChange,
  people,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  error,
  onRetry,
  onPageChange,
  search,
  onSearchChange,
  onOpenPerson,
  selectedId,
  population,
}: {
  criterion: ReportCriterion;
  bucket: string;
  onBucketChange: (bucket: string) => void;
  people: ReportPersonRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenPerson: (person: ReportPersonRow) => void;
  selectedId?: string | null;
  population: 'xodim' | 'talaba';
}) {
  const current = criterion.buckets.find((item) => item.key === bucket) ?? criterion.buckets[0];

  const columns: DataTableColumn<ReportPersonRow>[] = [
    {
      key: 'name',
      header: 'Ism',
      cell: (person) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={person.fullName} src={person.photoUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{person.fullName}</span>
            {person.biometricsStatus !== 'tasdiqlangan' && (
              <span className="block text-[11px] font-medium text-danger">yuzi ro&apos;yxatga kiritilmagan</span>
            )}
          </span>
        </span>
      ),
      sortValue: (person) => person.fullName,
    },
    { key: 'faculty', header: population === 'talaba' ? 'Fakultet' : "Kafedra / bo'lim", cell: (p) => <span className="text-muted">{p.faculty || '—'}</span>, hideOnMobile: true },
    { key: 'unit', header: population === 'talaba' ? 'Guruh' : 'Lavozim', cell: (p) => <span className="text-muted">{p.unit || '—'}</span> },
    {
      key: 'attendance',
      header: 'Davomat',
      sortValue: (p) => p.absentDays,
      sortFirst: 'desc',
      cell: (p) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted">
          <span className="font-semibold text-success">{p.presentDays}</span> keldi · <span className="font-semibold text-warning">{p.lateDays}</span>{' '}
          kech · <span className="font-semibold text-danger">{p.absentDays}</span> kelmadi
        </span>
      ),
    },
    {
      key: 'proof',
      header: 'Isbot',
      hideOnMobile: true,
      cell: (p) => (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {p.firstCheckIn && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock size={12} aria-hidden="true" />
              {p.firstCheckIn}
            </span>
          )}
          {p.visits > 0 ? (
            <span className="inline-flex items-center gap-1">
              <CameraIcon size={12} aria-hidden="true" />
              {p.visits} ta ko&apos;rinish{p.lastSeenCamera ? ` · ${p.lastSeenCamera}` : ''}
            </span>
          ) : (
            <span className="text-subtle">kamerada ko&apos;rinmagan</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <Tabs
          variant="segmented"
          ariaLabel="Ro'yxat turini tanlash"
          tabs={criterion.buckets.map((item) => ({ id: item.key, label: item.label, count: item.count }))}
          value={current?.key ?? bucket}
          onChange={onBucketChange}
        />
        <SearchInput value={search} onChange={onSearchChange} placeholder="Ism bo'yicha qidirish…" ariaLabel="Ro'yxatdan qidirish" />
      </Toolbar>
      <DataTable
        ariaLabel={`${criterion.title}: ${current?.label ?? ''}`}
        columns={columns}
        rows={people}
        rowKey={(person) => person.id}
        onRowClick={onOpenPerson}
        selectedKey={selectedId}
        loading={loading && people.length === 0}
        error={error}
        onRetry={onRetry}
        maxHeight="none"
        emptyTitle="Bu ro'yxat bo'sh"
        emptyDescription={search.trim() ? "Qidiruv so'zini o'zgartiring." : "Tanlangan davr va kriteriya bo'yicha odam topilmadi."}
        footer={people.length > 0 ? <ReportPager page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={onPageChange} /> : undefined}
      />
    </div>
  );
}
