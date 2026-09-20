import { useCallback, useState } from 'react';
import { Users } from 'lucide-react';
import { Badge, DataTable, SearchInput, StatusBadge, Toolbar, type DataTableColumn } from '../../ui';
import { getTeachersDay, hhmm } from '../../lib/teachersApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { todayInTashkent } from '../../lib/uzDate';
import type { TeacherDaySummary } from '../../types';
import { TeacherDayDrawer } from './TeacherDayDrawer';
import { useLoader } from './useLoader';


/** Vaqt yo'q bo'lganda sababini aytadigan katak (yalang'och "—" o'rniga). */
function Unseen({ value }: { value: string | null }) {
  if (!value) return <span className="text-subtle" title="Bu kunda kameralar bu xodimni tanimagan">—</span>;
  return <span className="tabular-nums">{hhmm(value)}</span>;
}

export function DayTrackingTab({ date }: { date: string }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const [selected, setSelected] = useState<TeacherDaySummary | null>(null);
  const load = useCallback((signal: AbortSignal) => getTeachersDay({ date, search: debounced }, { signal }), [date, debounced]);
  const teachers = useLoader(`t:${date}:${debounced}`, load);
  // Bugungi kun hali tugamagan: kunning oxiridagi darsi bor xodimni soat
  // 09:00 da qizil qilib "kirmagan" deyish noto'g'ri edi. O'tgan kunlardagina
  // kam kirilgan dars haqiqatan muammo.
  const dayFinished = date < todayInTashkent();

  const columns: DataTableColumn<TeacherDaySummary>[] = [
    {
      key: 'fullName',
      header: 'F.I.Sh.',
      sortValue: (r) => r.fullName,
      cell: (r) => (
        <div className="min-w-0">
          {/* Uzun o'zbekcha F.I.Sh. jadvalni cho'zib yubormasin. */}
          <p className="truncate font-medium text-fg" title={r.fullName}>
            {r.fullName}
          </p>
          <p className="truncate text-xs text-muted" title={r.unit}>
            {r.unit}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Davomat',
      sortValue: (r) => r.attendanceStatus ?? '',
      cell: (r) => <StatusBadge status={r.attendanceStatus ?? 'nomalum'} />,
    },
    // Yalang'och "—" nimani anglatishini aytmasdi — endi tooltipda sabab bor.
    { key: 'firstSeen', header: 'Keldi', align: 'right', sortValue: (r) => r.firstSeen ?? '99', cell: (r) => <Unseen value={r.firstSeen} /> },
    // Noma'lum vaqt ikkala ustunda ham OXIRIDA tursin ('99' > har qanday "HH:MM").
    { key: 'lastSeen', header: "Oxirgi marta ko'ringan", align: 'right', hideOnMobile: true, sortValue: (r) => r.lastSeen ?? '99', cell: (r) => <Unseen value={r.lastSeen} /> },
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
      cell: (r) => {
        if (r.lessonsScheduled === 0) return <span className="text-[13px] text-subtle">jadvalda yo'q</span>;
        const missing = r.lessonsScheduled - r.lessonsAttended;
        // Kun tugamaguncha kirilmagan dars "hali bo'lmagan dars" bo'lishi
        // mumkin — u qizil emas, neytral ko'rsatiladi.
        const tone = missing <= 0 ? 'success' : dayFinished ? 'danger' : 'neutral';
        return (
          <Badge tone={tone} title={missing > 0 && !dayFinished ? "Kun hali tugamagan — qolgan darslar hali bo'lmagan bo'lishi mumkin" : undefined}>
            {r.lessonsAttended} / {r.lessonsScheduled}
          </Badge>
        );
      },
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
        rowTone={(r) => (dayFinished && r.lessonsScheduled > r.lessonsAttended ? 'danger' : null)}
        emptyTitle={debounced ? 'Hech kim topilmadi' : "Bu kunda hech kim ko'rinmagan"}
        emptyDescription={
          debounced
            ? `«${debounced}» so'roviga mos xodim bu kunda ro'yxatda yo'q. Qidiruv so'zini o'zgartiring yoki tozalang.`
            : "Bu kunda kameralar birorta xodimni tanimagan va darsi bor xodim ham topilmadi. Xodim bu ro'yxatda ko'rinishi uchun avval yuzini ro'yxatdan o'tkazishi kerak."
        }
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
          {/* Qidiruv serverga ketadi, ya'ni bu son qidiruv natijalari soni —
              avval u shunchaki "N ta xodim" deb turib, jami kabi o'qilardi. */}
          {debounced ? `«${debounced}» bo'yicha ${teachers.data.length} ta xodim topildi` : `${teachers.data.length} ta xodim`}
        </p>
      )}
    </>
  );
}
