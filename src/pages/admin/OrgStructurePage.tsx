import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Building2, Landmark, Pencil, Plus, Trash2, Users2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, DataTable, ErrorState, FilterBar, filterActiveCount, formatNumber, IconButton, Page, useToast, useUrlTab, type DataTableColumn, type FilterFieldEntry, type TabItem } from '../../ui';
import AddBuildingModal from '../../components/admin/AddBuildingModal';
import AddDepartmentModal from '../../components/admin/AddDepartmentModal';
import AddFacultyModal from '../../components/admin/AddFacultyModal';
import AddGroupModal from '../../components/admin/AddGroupModal';
import { ApiError, api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { situationPaths } from '../../lib/situationApi';
import type { Building, Department, Faculty, StudentGroup } from '../../types';

type TabId = 'binolar' | 'fakultetlar' | 'guruhlar' | 'kafedralar';

type DeleteTarget =
  | { kind: 'building'; item: Building }
  | { kind: 'faculty'; item: Faculty }
  | { kind: 'group'; item: StudentGroup }
  | { kind: 'department'; item: Department };

const DELETE_META: Record<DeleteTarget['kind'], { noun: string; path: string }> = {
  building: { noun: 'korpus', path: '/api/buildings' },
  faculty: { noun: 'fakultet', path: '/api/faculties' },
  group: { noun: 'guruh', path: '/api/student-groups' },
  department: { noun: 'kafedra', path: '/api/departments' },
};

/**
 * O'chirish tasdig'ida AYNAN nima yo'qolishi va nima saqlanib qolishi
 * yoziladi. Ilgari hamma tur uchun bitta matn turardi ("butunlay
 * o'chiriladi") — holbuki backendda oqibatlar juda har xil:
 * fakultet o'chirilsa uning GURUHLARI ham CASCADE bilan ketadi
 * (app/models/org.py: student_groups.faculty_id ondelete="CASCADE"),
 * bino o'chirilsa qavat rasmlari (floor_plans) ketadi, kameralar esa
 * qolib binosiz bo'ladi. Admin buni tasdiqlashdan oldin bilishi shart.
 */
export function deleteConsequences(target: DeleteTarget, groupsInFaculty: number): { lost: string[]; kept: string[] } {
  const { kind, item } = target;
  if (kind === 'building') {
    const building = item as Building;
    return {
      lost: ['Binoning qavat rasmlari (qavat sxemalari)'],
      kept: [
        building.cameraCount > 0
          ? `${formatNumber(building.cameraCount)} ta kamera — o'chmaydi, lekin binosiz qoladi va binolar bo'yicha filtrda ko'rinmaydi`
          : "Kameralar (bu binoda biriktirilgani yo'q)",
        "Bu binodagi kafedralar — o'chmaydi, binosi bo'sh qoladi",
        "Turniket qurilmalari — o'chmaydi, binosi bo'sh qoladi",
      ],
    };
  }
  if (kind === 'faculty') {
    const faculty = item as Faculty;
    return {
      lost: [
        groupsInFaculty > 0
          ? `${formatNumber(groupsInFaculty)} ta guruh — fakultet bilan birga o'chadi`
          : "Fakultetga biriktirilgan guruhlar (hozircha yo'q)",
      ],
      kept: [
        faculty.studentCount > 0
          ? `${formatNumber(faculty.studentCount)} ta talaba — reestrda qoladi, lekin fakultetsiz bo'ladi`
          : 'Talabalar reestri',
        'Davomat tarixi',
      ],
    };
  }
  if (kind === 'group') {
    const group = item as StudentGroup;
    return {
      lost: ["Guruh ro'yxatdan chiqadi (guruh kesimidagi davomat sahifasi ochilmaydi)"],
      kept: [
        group.studentCount > 0
          ? `${formatNumber(group.studentCount)} ta talaba — reestrda qoladi`
          : 'Talabalar reestri',
        'Davomat tarixi',
      ],
    };
  }
  const department = item as Department;
  return {
    lost: ['Kafedra bo’yicha filtr'],
    kept: [
      department.cameraCount > 0
        ? `${formatNumber(department.cameraCount)} ta kamera — o'chmaydi, kafedrasiz qoladi`
        : "Kameralar (bu kafedrada biriktirilgani yo'q)",
      'Xodimlar reestri',
    ],
  };
}

const ADD_LABEL: Record<TabId, string> = {
  binolar: "Korpus qo'shish",
  fakultetlar: "Fakultet qo'shish",
  guruhlar: "Guruh qo'shish",
  kafedralar: "Kafedra qo'shish",
};

function matches(text: string | null | undefined, query: string): boolean {
  return (text ?? '').toLocaleLowerCase('uz').includes(query);
}

/** Qator ichidagi tugmalar — qator bosilishi (havola) bilan to'qnashmasin. */
function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-end gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function NameCell({ icon: Icon, name, hint }: { icon: typeof Building2; name: string; hint?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg">{name}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
    </span>
  );
}

export default function OrgStructurePage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  // O'qish hammaga ochiq (kamera mas'uli binolar ro'yxatini ko'radi),
  // o'zgartirish tugmalari faqat huquqi borlarga. Server ham tekshiradi.
  const canEdit = can('manageOrgStructure', role);
  // Fakultet/guruh/kafedra sahifalari davomat huquqini talab qiladi.
  const canOpenAttendance = can('manageAttendance', role);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [search, setSearch] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  const [addOpen, setAddOpen] = useState<TabId | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    setLoading(true);
    Promise.all([
      api.get<Building[]>('/api/buildings', token, opts),
      api.get<Department[]>('/api/departments', token, opts),
      api.get<Faculty[]>('/api/faculties', token, opts),
      api.get<StudentGroup[]>('/api/student-groups', token, opts),
    ])
      .then(([b, d, f, g]) => {
        setBuildings(b);
        setDepartments(d);
        setFaculties(f);
        setGroups(g);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Tuzilmani yuklab bo'lmadi — ulanishni tekshiring");
        setLoading(false);
      });
    return () => controller.abort();
  }, [token, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const tabs = useMemo<TabItem<TabId>[]>(
    () => [
      { id: 'binolar', label: 'Binolar', icon: Building2, count: loading ? null : buildings.length },
      { id: 'fakultetlar', label: 'Fakultetlar', icon: BookOpen, count: loading ? null : faculties.length },
      { id: 'guruhlar', label: 'Guruhlar', icon: Users2, count: loading ? null : groups.length },
      { id: 'kafedralar', label: 'Kafedralar', icon: Landmark, count: loading ? null : departments.length },
    ],
    [loading, buildings.length, faculties.length, groups.length, departments.length],
  );
  const [tab] = useUrlTab(tabs);

  const query = search.trim().toLocaleLowerCase('uz');

  const shownBuildings = useMemo(() => buildings.filter((b) => matches(b.name, query)), [buildings, query]);
  const shownFaculties = useMemo(() => faculties.filter((f) => matches(f.name, query)), [faculties, query]);
  const shownDepartments = useMemo(
    () => departments.filter((d) => matches(d.name, query) || matches(d.buildingName, query)),
    [departments, query],
  );
  const shownGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          matches(g.name, query) &&
          (!facultyFilter || g.faculty === facultyFilter) &&
          (!courseFilter || String(g.course) === courseFilter),
      ),
    [groups, query, facultyFilter, courseFilter],
  );

  const courseOptions = useMemo(
    () =>
      Array.from(new Set(groups.map((g) => g.course)))
        .sort((a, b) => a - b)
        .map((c) => ({ value: String(c), label: `${c}-kurs` })),
    [groups],
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { kind, item } = deleteTarget;
    try {
      await api.del(`${DELETE_META[kind].path}/${item.id}`, token);
    } catch (err) {
      // ConfirmDialog xatoni o'z ichida ko'rsatadi va yopilmaydi.
      throw new Error(err instanceof ApiError ? err.message : `${DELETE_META[kind].noun}ni o'chirib bo'lmadi`);
    }
    if (kind === 'building') setBuildings((prev) => prev.filter((b) => b.id !== item.id));
    if (kind === 'faculty') setFaculties((prev) => prev.filter((f) => f.id !== item.id));
    if (kind === 'group') setGroups((prev) => prev.filter((g) => g.id !== item.id));
    if (kind === 'department') setDepartments((prev) => prev.filter((d) => d.id !== item.id));
    toast.success(`«${item.name}» o'chirildi`);
    setDeleteTarget(null);
  }

  function deleteButton(target: DeleteTarget) {
    return <IconButton icon={Trash2} label={`«${target.item.name}» — o'chirish`} size="sm" variant="danger" onClick={() => setDeleteTarget(target)} />;
  }

  const buildingColumns: DataTableColumn<Building>[] = [
    {
      key: 'name',
      header: 'Korpus',
      cell: (b) => <NameCell icon={Building2} name={b.name} />,
      sortValue: (b) => b.sortOrder ?? b.name,
    },
    {
      key: 'floors',
      header: 'Qavatlar',
      align: 'right',
      cell: (b) => (b.floors ? formatNumber(b.floors) : <span className="text-subtle">kiritilmagan</span>),
      sortValue: (b) => b.floors ?? null,
      sortFirst: 'desc',
    },
    {
      key: 'cameras',
      header: 'Kameralar',
      align: 'right',
      cell: (b) => formatNumber(b.cameraCount),
      sortValue: (b) => b.cameraCount,
      sortFirst: 'desc',
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Amallar</span>,
            align: 'right' as const,
            width: '6rem',
            mobileLabel: 'Amallar',
            cell: (b: Building) => (
              <RowActions>
                <IconButton icon={Pencil} label={`«${b.name}» — tahrirlash`} size="sm" onClick={() => setEditingBuilding(b)} />
                {deleteButton({ kind: 'building', item: b })}
              </RowActions>
            ),
          },
        ]
      : []),
  ];

  const facultyColumns: DataTableColumn<Faculty>[] = [
    { key: 'name', header: 'Fakultet', cell: (f) => <NameCell icon={BookOpen} name={f.name} />, sortValue: (f) => f.name },
    { key: 'courses', header: 'Kurslar', align: 'right', cell: (f) => formatNumber(f.courseCount), sortValue: (f) => f.courseCount, sortFirst: 'desc' },
    {
      key: 'groups',
      header: 'Guruhlar',
      align: 'right',
      cell: (f) => formatNumber(groups.filter((g) => g.faculty === f.name).length),
      sortValue: (f) => groups.filter((g) => g.faculty === f.name).length,
      sortFirst: 'desc',
      hideOnMobile: true,
    },
    { key: 'students', header: 'Talabalar', align: 'right', cell: (f) => formatNumber(f.studentCount), sortValue: (f) => f.studentCount, sortFirst: 'desc' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Amallar</span>,
            align: 'right' as const,
            width: '4rem',
            mobileLabel: 'Amallar',
            cell: (f: Faculty) => <RowActions>{deleteButton({ kind: 'faculty', item: f })}</RowActions>,
          },
        ]
      : []),
  ];

  const groupColumns: DataTableColumn<StudentGroup>[] = [
    { key: 'name', header: 'Guruh', cell: (g) => <NameCell icon={Users2} name={g.name} />, sortValue: (g) => g.name },
    { key: 'faculty', header: 'Fakultet', cell: (g) => g.faculty || <span className="text-subtle">—</span>, sortValue: (g) => g.faculty },
    { key: 'course', header: 'Kurs', cell: (g) => <Badge>{g.course}-kurs</Badge>, sortValue: (g) => g.course },
    { key: 'students', header: 'Talabalar', align: 'right', cell: (g) => formatNumber(g.studentCount), sortValue: (g) => g.studentCount, sortFirst: 'desc' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Amallar</span>,
            align: 'right' as const,
            width: '4rem',
            mobileLabel: 'Amallar',
            cell: (g: StudentGroup) => <RowActions>{deleteButton({ kind: 'group', item: g })}</RowActions>,
          },
        ]
      : []),
  ];

  const departmentColumns: DataTableColumn<Department>[] = [
    { key: 'name', header: 'Kafedra', cell: (d) => <NameCell icon={Landmark} name={d.name} />, sortValue: (d) => d.name },
    {
      key: 'building',
      header: 'Bino',
      cell: (d) => d.buildingName || <Badge tone="warning">ko&apos;rsatilmagan</Badge>,
      sortValue: (d) => d.buildingName || null,
    },
    { key: 'cameras', header: 'Kameralar', align: 'right', cell: (d) => formatNumber(d.cameraCount), sortValue: (d) => d.cameraCount, sortFirst: 'desc' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Amallar</span>,
            align: 'right' as const,
            width: '4rem',
            mobileLabel: 'Amallar',
            cell: (d: Department) => <RowActions>{deleteButton({ kind: 'department', item: d })}</RowActions>,
          },
        ]
      : []),
  ];

  const searchPlaceholder: Record<TabId, string> = {
    binolar: 'Korpus nomi…',
    fakultetlar: 'Fakultet nomi…',
    guruhlar: 'Guruh nomi…',
    kafedralar: 'Kafedra yoki bino…',
  };

  const isGroups = tab === 'guruhlar';
  const filterFields: FilterFieldEntry[] = [
    { kind: 'search', value: search, onChange: setSearch, placeholder: searchPlaceholder[tab] },
    // Fakultet/kurs faqat "Guruhlar" tabida — boshqa tabda sanalmaydi ham.
    isGroups && {
      kind: 'select',
      value: facultyFilter,
      onChange: setFacultyFilter,
      placeholder: 'Barcha fakultetlar',
      ariaLabel: 'Fakultet',
      options: faculties.map((f) => ({ value: f.name, label: f.name })),
    },
    isGroups && {
      kind: 'select',
      value: courseFilter,
      onChange: setCourseFilter,
      placeholder: 'Barcha kurslar',
      ariaLabel: 'Kurs',
      options: courseOptions,
    },
  ];
  // Bo'sh holat matni ham xuddi shu sanoqqa tayanadi (ilgari alohida
  // hisoblanardi va qidiruvdagi bo'sh probelni boshqacha sanardi).
  const filtersActive = filterActiveCount(filterFields);
  const toolbar = (
    <FilterBar
      fields={filterFields}
      onReset={() => {
        setSearch('');
        setFacultyFilter('');
        setCourseFilter('');
      }}
    />
  );

  const emptyAction = (id: TabId) =>
    canEdit && !query ? (
      <Button icon={Plus} variant="primary" onClick={() => setAddOpen(id)}>
        {ADD_LABEL[id]}
      </Button>
    ) : undefined;

  const common = { loading, loadingRows: 5 } as const;

  return (
    <Page
      title="Tashkiliy tuzilma"
      subtitle={
        canEdit
          ? "Binolar, fakultetlar, guruhlar va kafedralar — institut tuzilmasi boshqaruvi"
          : "Binolar, fakultetlar, guruhlar va kafedralar — faqat ko'rish"
      }
      tabs={tabs}
      actions={
        canEdit && (
          <Button variant="primary" icon={Plus} onClick={() => setAddOpen(tab)} disabled={loading}>
            {ADD_LABEL[tab]}
          </Button>
        )
      }
      toolbar={error ? undefined : toolbar}
    >
      {error ? (
        <ErrorState variant="block" message={error} onRetry={reload} className="rounded-card border border-border bg-surface" />
      ) : (
        <>
          {tab === 'binolar' && (
            <DataTable
              {...common}
              ariaLabel="O'quv korpuslari"
              columns={buildingColumns}
              rows={shownBuildings}
              rowKey={(b) => b.id}
              defaultSort={{ key: 'name', dir: 'asc' }}
              emptyTitle={query ? 'Korpus topilmadi' : "Hozircha korpus qo'shilmagan"}
              emptyDescription={query ? "Qidiruv so'zini o'zgartiring." : "Kameralarni joylashtirish uchun avval o'quv korpuslarini kiriting."}
              emptyAction={emptyAction('binolar')}
            />
          )}

          {tab === 'fakultetlar' && (
            <DataTable
              {...common}
              ariaLabel="Fakultetlar"
              columns={facultyColumns}
              rows={shownFaculties}
              rowKey={(f) => f.id}
              onRowClick={canOpenAttendance ? (f) => navigate(situationPaths.faculty(f.id)) : undefined}
              defaultSort={{ key: 'name', dir: 'asc' }}
              emptyTitle={query ? 'Fakultet topilmadi' : "Hozircha fakultet qo'shilmagan"}
              emptyAction={emptyAction('fakultetlar')}
            />
          )}

          {tab === 'guruhlar' && (
            <DataTable
              {...common}
              ariaLabel="Guruhlar"
              columns={groupColumns}
              rows={shownGroups}
              rowKey={(g) => g.id}
              onRowClick={canOpenAttendance ? (g) => navigate(situationPaths.group(g.name)) : undefined}
              defaultSort={{ key: 'name', dir: 'asc' }}
              emptyTitle={filtersActive ? 'Guruh topilmadi' : "Hozircha guruh qo'shilmagan"}
              emptyDescription={filtersActive ? "Filtrlarni o'zgartiring yoki tozalang." : undefined}
              emptyAction={emptyAction('guruhlar')}
            />
          )}

          {tab === 'kafedralar' && (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                Kafedra — bino ichidagi tashkiliy birlik. Monitoringda kameralar avval bino, so&apos;ngra kafedra bo&apos;yicha
                filtrlanadi, shuning uchun har bir kafedrani o&apos;z binosiga biriktirish ma&apos;qul.
              </p>
              <DataTable
                {...common}
                ariaLabel="Kafedralar"
                columns={departmentColumns}
                rows={shownDepartments}
                rowKey={(d) => d.id}
                onRowClick={canOpenAttendance ? (d) => navigate(situationPaths.kafedra(d.id)) : undefined}
                defaultSort={{ key: 'name', dir: 'asc' }}
                emptyTitle={query ? 'Kafedra topilmadi' : "Hozircha kafedra qo'shilmagan"}
                emptyAction={emptyAction('kafedralar')}
              />
            </>
          )}
        </>
      )}

      <AddBuildingModal
        open={addOpen === 'binolar'}
        onClose={() => setAddOpen(null)}
        onSave={(building) => {
          setBuildings((prev) => [...prev, building]);
          toast.success(`«${building.name}» qo'shildi`);
        }}
      />
      <AddBuildingModal
        open={!!editingBuilding}
        building={editingBuilding}
        onClose={() => setEditingBuilding(null)}
        onSave={(building) => {
          setBuildings((prev) => prev.map((b) => (b.id === building.id ? building : b)));
          setEditingBuilding(null);
          toast.success('Saqlandi');
        }}
      />
      <AddDepartmentModal
        open={addOpen === 'kafedralar'}
        buildings={buildings}
        onClose={() => setAddOpen(null)}
        onAdd={(department) => {
          setDepartments((prev) => [...prev, department]);
          toast.success(`«${department.name}» qo'shildi`);
        }}
      />
      <AddFacultyModal
        open={addOpen === 'fakultetlar'}
        onClose={() => setAddOpen(null)}
        onAdd={(faculty) => {
          setFaculties((prev) => [...prev, faculty]);
          toast.success(`«${faculty.name}» qo'shildi`);
        }}
      />
      <AddGroupModal
        open={addOpen === 'guruhlar'}
        faculties={faculties}
        onClose={() => setAddOpen(null)}
        onAdd={(group) => {
          setGroups((prev) => [...prev, group]);
          toast.success(`«${group.name}» qo'shildi`);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `${capitalize(DELETE_META[deleteTarget.kind].noun)}ni o'chirasizmi?` : ''}
        message={
          deleteTarget &&
          (() => {
            const { lost, kept } = deleteConsequences(
              deleteTarget,
              deleteTarget.kind === 'faculty' ? groups.filter((g) => g.faculty === deleteTarget.item.name).length : 0,
            );
            return (
              <div className="flex flex-col gap-2">
                <p>
                  <span className="font-medium text-fg">«{deleteTarget.item.name}»</span> butunlay o&apos;chiriladi. Bu amalni
                  qaytarib bo&apos;lmaydi.
                </p>
                <p className="font-medium text-danger">Birga o&apos;chadi:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {lost.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="font-medium text-fg">Saqlanib qoladi:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {kept.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            );
          })()
        }
        confirmLabel="O'chirish"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </Page>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
