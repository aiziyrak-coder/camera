import { useCallback, useState } from 'react';
import { Users } from 'lucide-react';
import { Badge, DataTable, SearchInput, StatusBadge, Toolbar, type DataTableColumn } from '../../ui';
import { getTeachersDay, hhmm } from '../../lib/teachersApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { TeacherDaySummary } from '../../types';
import { TeacherDayDrawer } from './TeacherDayDrawer';
import { useLoader } from './useLoader';


export function DayTrackingTab({ date }: { date: string }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const [selected, setSelected] = useState<TeacherDaySummary | null>(null);
  const load = useCallback((signal: AbortSignal) => getTeachersDay({ date, search: debounced }, { signal }), [date, debounced]);
  const teachers = useLoader(`t:${date}:${debounced}`, load);

  const columns: DataTableColumn<TeacherDaySummary>[] = [
    {
      key: 'fullName',
      header: 'F.I.Sh.',
      sortValue: (r) => r.fullName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{r.fullName}</p>
          <p className="truncate text-xs text-muted">{r.unit}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Davomat',
      sortValue: (r) => r.attendanceStatus ?? '',
      cell: (r) => <StatusBadge status={r.attendanceStatus ?? 'nomalum'} />,
    },
    { key: 'firstSeen', header: 'Keldi', align: 'right', sortValue: (r) => r.firstSeen ?? '99', cell: (r) => hhmm(r.firstSeen) },
    { key: 'lastSeen', header: "Oxirgi marta ko'ringan", align: 'right', hideOnMobile: true, sortValue: (r) => r.lastSeen ?? '', cell: (r) => hhmm(r.lastSeen) },
    {
      key: 'buildings',
      header: 'Binolar',
      hideOnMobile: true,
      cell: (r) => <span className="text-[13px] text-muted">{r.buildings.join(', ') || '—'}</span>,
    },
    { key: 'visits', header: "Necha marta ko'ringan", align: 'right', sortValue: (r) => r.visits, sortFirst: 'desc' },
    {
      key: 'lessons',
      header: 'Darsiga kirgan',
      align: 'right',
      sortValue: (r) => (r.lessonsScheduled ? r.lessonsAttended / r.lessonsScheduled : null),
      cell: (r) =>
        r.lessonsScheduled === 0 ? (
          <span className="text-[13px] text-subtle">jadvalda yo'q</span>
        ) : (
          <Badge tone={r.lessonsAttended < r.lessonsScheduled ? 'danger' : 'success'}>
            {r.lessonsAttended} / {r.lessonsScheduled}
          </Badge>
        ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="O'qituvchi ismi…" ariaLabel="O'qituvchini qidirish" />
        <p className="text-[13px] text-muted">
          Kim soat nechada kelgan, qaysi binoda ko'ringan va darsiga kirganmi. Ro'yxatga kameralar tanigan yoki shu kuni darsi bor
          xodimlar tushadi.
        </p>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={teachers.data ?? []}
        rowKey={(r) => r.id}
        loading={teachers.loading}
        error={teachers.data ? null : teachers.error}
        onRetry={teachers.reload}
        onRowClick={setSelected}
        selectedKey={selected?.id ?? null}
        rowTone={(r) => (r.lessonsScheduled > r.lessonsAttended ? 'danger' : null)}
        emptyTitle="Bu kunda hech kim ko'rinmagan"
        emptyDescription="Bu kunda kameralar birorta xodimni tanimagan va darsi bor xodim ham topilmadi. Xodim bu ro'yxatda ko'rinishi uchun avval yuzini ro'yxatdan o'tkazishi kerak."
        ariaLabel="O'qituvchilar kuni"
        defaultSort={{ key: 'firstSeen', dir: 'asc' }}
      />
      <TeacherDayDrawer
        person={selected ? { id: selected.id, fullName: selected.fullName, subtitle: [selected.unit, selected.faculty].filter(Boolean).join(' · ') } : null}
        date={date}
        onClose={() => setSelected(null)}
      />
      {teachers.data && (
        <p className="text-xs text-muted">
          <Users size={12} className="mr-1 inline" aria-hidden="true" />
          {teachers.data.length} ta xodim
        </p>
      )}
    </>
  );
}
