/* Yuzlar bazasi — jadval + o'ngda tanlangan odam paneli. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, QrCode as QrIcon, Rows3, Search, UserCheck, Users, X } from 'lucide-react';
import { useFaculties } from '../lib/useFaculties';
import { invalidateServerPageCache, useServerPage } from '../lib/useServerPage';
import type { StudentStaffRecord } from '../types';
import { useOverview } from '../shell';
import {
  Alert,
  Badge,
  Button,
  Empty,
  IconButton,
  PageHead,
  Photo,
  Segmented,
  Select,
  Skeleton,
  Stat,
  Tabs,
  cn,
  formatNumber,
  isTyping,
  layerOpen,
  type Tone,
} from '../kit';
import PersonPanel from './PersonPanel';
import { EnrollLinkModal } from './EnrollLink';

type PersonType = 'talaba' | 'xodim';
type FaceFilter = '' | 'tasdiqlangan' | 'yoq' | 'tasdiq_kutmoqda';
type View = 'jadval' | 'kartochka';

const PAGE_SIZE = 50;

const FACE_FILTERS: { value: FaceFilter; label: string }[] = [
  { value: '', label: 'Hammasi' },
  { value: 'tasdiqlangan', label: 'Yuzi bor' },
  { value: 'yoq', label: 'Yuzi yo‘q' },
  { value: 'tasdiq_kutmoqda', label: 'Kutmoqda' },
];

export function faceStatus(p: StudentStaffRecord): { tone: Tone; label: string } {
  if (p.awaitingApproval) return { tone: 'warn', label: 'Tasdiq kutmoqda' };
  if (p.biometricsStatus === 'tasdiqlangan') return { tone: 'ok', label: 'Yuzi bor' };
  if (p.biometricsStatus === 'kutilmoqda') return { tone: 'warn', label: 'Jarayonda' };
  return { tone: 'plain', label: 'Yuzi yo‘q' };
}

function readView(): View {
  try {
    return localStorage.getItem('yb-view') === 'kartochka' ? 'kartochka' : 'jadval';
  } catch {
    return 'jadval';
  }
}

export default function FacesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { faculties } = useFaculties();
  const { overview, reload: reloadOverview } = useOverview();
  const [type, setType] = useState<PersonType>(params.get('tur') === 'xodim' ? 'xodim' : 'talaba');
  const [face, setFace] = useState<FaceFilter>('');
  const [faculty, setFaculty] = useState('');
  const [course, setCourse] = useState('');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<StudentStaffRecord | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [view, setView] = useState<View>(readView);

  // Ctrl K dan kelgan qidiruv matni.
  const q = params.get('q');
  useEffect(() => {
    if (q !== null) {
      setSearch(q);
      setParams({}, { replace: true });
    }
  }, [q, setParams]);

  useEffect(() => {
    try {
      localStorage.setItem('yb-view', view);
    } catch {
      /* ixtiyoriy */
    }
  }, [view]);

  const list = useServerPage<StudentStaffRecord>(
    '/api/students-staff/search',
    {
      type,
      faculty: faculty || undefined,
      search: search.trim() || undefined,
      biometricsStatus: face || undefined,
      course: type === 'talaba' && course ? course : undefined,
    },
    PAGE_SIZE,
    { post: true },
  );

  const refresh = useCallback(() => {
    invalidateServerPageCache('/api/students-staff');
    list.reload();
    reloadOverview();
  }, [list, reloadOverview]);

  const stats = overview?.[type];
  const awaiting = stats?.awaitingApproval ?? 0;
  const hasFilters = Boolean(face || faculty || course || search.trim());

  // Klaviatura: ↑/↓ — ro'yxat bo'ylab, Esc — panelni yopish.
  const items = list.items;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || layerOpen() || !items.length) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k') return;
      e.preventDefault();
      const idx = selected ? items.findIndex((p) => p.id === selected.id) : -1;
      const next = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
      setSelected(items[next]);
      document.getElementById(`row-${items[next].id}`)?.scrollIntoView({ block: 'nearest' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selected]);

  const from = list.total ? (list.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(list.total, list.page * PAGE_SIZE);

  const facultyOptions = useMemo(() => faculties.map((f) => ({ value: f.name, label: f.name })), [faculties]);

  return (
    <div className="flex lg:h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHead
          title="Yuzlar bazasi"
          text="Kameralar taniydigan talaba va xodimlar"
          actions={
            <Button icon={QrIcon} onClick={() => setLinkOpen(true)}>
              Ro‘yxatdan o‘tish havolasi
            </Button>
          }
        >
          <Tabs
            value={type}
            onChange={(next) => {
              setType(next);
              setCourse('');
              setSelected(null);
            }}
            options={[
              { value: 'talaba', label: 'Talabalar', count: overview?.talaba.total ?? null },
              { value: 'xodim', label: 'Xodimlar', count: overview?.xodim.total ?? null },
            ]}
          />
        </PageHead>

        {/* Ko'rsatkichlar */}
        <div className="grid shrink-0 grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-4 [&>*]:bg-white [&>*:hover]:bg-side">
          <Stat label="Jami" value={stats ? formatNumber(stats.total) : '—'} onClick={() => setFace('')} />
          <Stat
            label="Yuzi bor"
            value={stats ? formatNumber(stats.confirmed) : '—'}
            meter={stats && stats.total ? stats.confirmed / stats.total : 0}
            meterTone="ok"
            sub={stats && stats.total ? `${Math.round((stats.confirmed / stats.total) * 100)}% qamrov` : undefined}
            onClick={() => setFace('tasdiqlangan')}
          />
          <Stat label="Yuzi yo‘q" value={stats ? formatNumber(stats.missing + stats.pending) : '—'} onClick={() => setFace('yoq')} />
          <Stat
            label={
              <span className="flex items-center gap-1.5">
                Tasdiq kutmoqda {awaiting > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
              </span>
            }
            value={stats ? formatNumber(awaiting) : '—'}
            sub={awaiting > 0 ? 'Ko‘rib chiqish →' : 'Navbat bo‘sh'}
            onClick={() => navigate('/tasdiqlash')}
          />
        </div>

        {/* Asboblar qatori */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 lg:px-6">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input
              className="input pl-8 pr-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism, familiya yoki JSHSHIR"
              aria-label="Qidirish"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink" aria-label="Tozalash">
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
          <Select value={faculty} onChange={setFaculty} placeholder="Barcha fakultetlar" options={facultyOptions} className="w-full sm:w-56" ariaLabel="Fakultet" />
          {type === 'talaba' && (
            <Select
              value={course}
              onChange={setCourse}
              placeholder="Barcha kurslar"
              options={[1, 2, 3, 4, 5, 6].map((c) => ({ value: String(c), label: `${c}-kurs` }))}
              className="w-full sm:w-36"
              ariaLabel="Kurs"
            />
          )}
          <Segmented value={face} onChange={setFace} options={FACE_FILTERS} />
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setFace('');
                setFaculty('');
                setCourse('');
                setSearch('');
              }}
            >
              Tozalash
            </Button>
          )}
          <div className="ml-auto flex items-center rounded-lg border border-line p-0.5">
            <IconButton
              icon={Rows3}
              label="Jadval"
              size="sm"
              onClick={() => setView('jadval')}
              className={cn('h-6 w-7 rounded-md', view === 'jadval' && 'bg-sunk text-ink')}
            />
            <IconButton
              icon={LayoutGrid}
              label="Kartochkalar"
              size="sm"
              onClick={() => setView('kartochka')}
              className={cn('h-6 w-7 rounded-md', view === 'kartochka' && 'bg-sunk text-ink')}
            />
          </div>
        </div>

        {/* Ro'yxat */}
        <div className={cn('overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-auto', list.refreshing && 'opacity-60 transition-opacity')}>
          {list.error ? (
            <div className="p-6">
              <Alert>{list.error}</Alert>
            </div>
          ) : list.loading && items.length === 0 ? (
            <LoadingRows />
          ) : items.length === 0 ? (
            <Empty icon={Users} title="Hech kim topilmadi" text="Qidiruv yoki filtrlarni o‘zgartirib ko‘ring." />
          ) : view === 'jadval' ? (
            <PeopleTable items={items} type={type} selectedId={selected?.id} onSelect={setSelected} />
          ) : (
            <PeopleGrid items={items} selectedId={selected?.id} onSelect={setSelected} />
          )}
        </div>

        {/* Holat qatori */}
        <div className="sticky bottom-0 flex h-11 shrink-0 items-center gap-3 border-t border-line bg-white px-4 text-[12.5px] text-soft lg:px-6">
          <span className="tnum">
            {list.total ? (
              <>
                {formatNumber(from)}–{formatNumber(to)} / <b className="font-medium text-ink">{formatNumber(list.total)}</b> kishi
              </>
            ) : (
              '0 kishi'
            )}
          </span>
          <span className="hidden text-faint md:inline">
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> bilan yurish
          </span>
          <div className="ml-auto flex items-center gap-1">
            <IconButton icon={ChevronLeft} label="Oldingi sahifa" size="sm" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)} />
            <span className="tnum min-w-[64px] text-center">
              {list.page} / {list.totalPages}
            </span>
            <IconButton icon={ChevronRight} label="Keyingi sahifa" size="sm" disabled={list.page >= list.totalPages} onClick={() => list.setPage(list.page + 1)} />
          </div>
        </div>
      </div>

      {selected && (
        <PersonPanel
          person={selected}
          onClose={() => setSelected(null)}
          onChanged={(next) => {
            setSelected(next);
            refresh();
          }}
        />
      )}
      {linkOpen && <EnrollLinkModal onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function subtitle(p: StudentStaffRecord): string {
  return p.type === 'talaba' ? p.group || p.reportedGroup || p.groupOrPosition : p.position || p.groupOrPosition;
}

function PeopleTable({
  items,
  type,
  selectedId,
  onSelect,
}: {
  items: StudentStaffRecord[];
  type: PersonType;
  selectedId?: string;
  onSelect: (p: StudentStaffRecord) => void;
}) {
  return (
    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[13px]">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="[&>th]:h-9 [&>th]:border-b [&>th]:border-line [&>th]:px-3 [&>th]:text-[11.5px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-faint">
          <th className="w-[40%] !pl-4 lg:!pl-6">F.I.Sh.</th>
          <th>Fakultet</th>
          {type === 'talaba' ? (
            <>
              <th className="w-20">Kurs</th>
              <th>Guruh</th>
            </>
          ) : (
            <th>Lavozim</th>
          )}
          <th className="w-40">Holat</th>
          <th className="w-36 !pr-4 lg:!pr-6">Yuz kiritilgan</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => {
          const status = faceStatus(p);
          const active = p.id === selectedId;
          return (
            <tr
              key={p.id}
              id={`row-${p.id}`}
              onClick={() => onSelect(p)}
              className={cn(
                'cursor-pointer [&>td]:h-12 [&>td]:whitespace-nowrap [&>td]:border-b [&>td]:border-line/70 [&>td]:px-3',
                active ? 'bg-sunk' : 'hover:bg-side',
              )}
              aria-selected={active}
            >
              <td className="!pl-4 lg:!pl-6">
                <div className="flex items-center gap-3">
                  <Photo src={p.biometricPhotoUrl || p.hemisPhotoUrl} name={p.fullName} className="h-8 w-8 shrink-0 rounded-md" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{p.fullName}</p>
                    {p.selfRegistered && <p className="text-[11.5px] text-faint">O‘zi ro‘yxatdan o‘tgan</p>}
                  </div>
                </div>
              </td>
              <td className="max-w-[220px] truncate text-soft">{p.faculty || '—'}</td>
              {type === 'talaba' ? (
                <>
                  <td className="tnum text-soft">{p.course ? `${p.course}-kurs` : '—'}</td>
                  <td className="text-soft">{p.group || p.reportedGroup || '—'}</td>
                </>
              ) : (
                <td className="max-w-[240px] truncate text-soft">{subtitle(p) || '—'}</td>
              )}
              <td>
                <Badge tone={status.tone}>{status.label}</Badge>
              </td>
              <td className="tnum whitespace-nowrap !pr-4 text-[12.5px] text-faint lg:!pr-6">{p.confirmedLabel || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PeopleGrid({ items, selectedId, onSelect }: { items: StudentStaffRecord[]; selectedId?: string; onSelect: (p: StudentStaffRecord) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:p-6 xl:grid-cols-5 2xl:grid-cols-7">
      {items.map((p) => {
        const status = faceStatus(p);
        return (
          <button
            key={p.id}
            id={`row-${p.id}`}
            type="button"
            onClick={() => onSelect(p)}
            className={cn(
              'group overflow-hidden rounded-xl border bg-white text-left transition-all',
              p.id === selectedId ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-[#d4d4d8]',
            )}
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-sunk">
              {p.biometricPhotoUrl || p.hemisPhotoUrl ? (
                <Photo src={p.biometricPhotoUrl || p.hemisPhotoUrl} name={p.fullName} className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#d4d4d8]">
                  <UserCheck size={40} strokeWidth={1.25} aria-hidden />
                </div>
              )}
              <Badge tone={status.tone} className="absolute bottom-2 left-2 border-transparent bg-white/95">
                {status.label}
              </Badge>
            </div>
            <div className="px-3 py-2.5">
              <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink">{p.fullName}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-faint">{subtitle(p) || '—'}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="px-4 lg:px-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 border-b border-line/70">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
