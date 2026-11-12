/* Yuzlar bazasi — asosiy sahifa. */
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, QrCode as QrIcon, Search, UserRound, Users } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { useFaculties } from '../lib/useFaculties';
import { invalidateServerPageCache, useServerPage } from '../lib/useServerPage';
import type { StudentStaffRecord } from '../types';
import { Alert, Badge, Button, Empty, PageHead, Photo, Segmented, Select, Spinner, cn, formatNumber, useToast } from '../kit';
import PersonPanel from './PersonPanel';
import { EnrollLinkModal } from './EnrollLink';

type PersonType = 'talaba' | 'xodim';
type FaceFilter = '' | 'tasdiqlangan' | 'yoq' | 'tasdiq_kutmoqda';

interface Coverage {
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  percent: number | null;
  awaitingApproval?: number;
}

interface Overview {
  talaba: Coverage;
  xodim: Coverage;
}

const PAGE_SIZE = 24;

const FACE_FILTERS: { value: FaceFilter; label: string }[] = [
  { value: '', label: 'Hammasi' },
  { value: 'tasdiqlangan', label: 'Yuzi bor' },
  { value: 'yoq', label: 'Yuzi yo‘q' },
  { value: 'tasdiq_kutmoqda', label: 'Tasdiq kutmoqda' },
];

export function faceStatus(p: StudentStaffRecord): { tone: 'ok' | 'warn' | 'plain'; label: string } {
  if (p.awaitingApproval) return { tone: 'warn', label: 'Tasdiq kutmoqda' };
  if (p.biometricsStatus === 'tasdiqlangan') return { tone: 'ok', label: 'Yuzi bor' };
  if (p.biometricsStatus === 'kutilmoqda') return { tone: 'warn', label: 'Jarayonda' };
  return { tone: 'plain', label: 'Yuzi yo‘q' };
}

export default function FacesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { faculties } = useFaculties();
  const [type, setType] = useState<PersonType>('talaba');
  const [face, setFace] = useState<FaceFilter>('');
  const [faculty, setFaculty] = useState('');
  const [course, setCourse] = useState('');
  const [search, setSearch] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<StudentStaffRecord | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

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

  const loadOverview = useCallback(() => {
    api
      .get<Overview>('/api/students-staff/overview', token)
      .then(setOverview)
      .catch(() => undefined);
  }, [token]);

  useEffect(loadOverview, [loadOverview]);

  const refresh = useCallback(() => {
    invalidateServerPageCache('/api/students-staff');
    list.reload();
    loadOverview();
  }, [list, loadOverview]);

  const stats = overview?.[type];
  const awaiting = stats?.awaitingApproval ?? 0;

  async function approveAll() {
    setApprovingAll(true);
    try {
      const res = await api.post<{ approved: number }>(`/api/students-staff/biometrics/approve-all?type=${type}`, {}, token);
      toast(`${res.approved} ta yuz tasdiqlandi`);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Tasdiqlab bo‘lmadi', 'bad');
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <div>
      <PageHead
        title="Yuzlar bazasi"
        text="Ro‘yxatdan o‘tgan talaba va xodimlarning yuzlari"
        actions={
          <Button icon={QrIcon} onClick={() => setLinkOpen(true)}>
            Ro‘yxatdan o‘tish havolasi
          </Button>
        }
      />

      <Segmented
        value={type}
        onChange={(next) => {
          setType(next);
          setCourse('');
          setFace('');
        }}
        options={[
          { value: 'talaba', label: <>Talabalar{overview && <span className="ml-1.5 text-faint">{formatNumber(overview.talaba.total)}</span>}</> },
          { value: 'xodim', label: <>Xodimlar{overview && <span className="ml-1.5 text-faint">{formatNumber(overview.xodim.total)}</span>}</> },
        ]}
      />

      {/* Qamrov: necha kishining yuzi bor */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Jami" value={stats?.total} />
        <StatCard label="Yuzi bor" value={stats?.confirmed} tone="ok" percent={stats && stats.total ? stats.confirmed / stats.total : null} />
        <StatCard label="Yuzi yo‘q" value={stats ? stats.missing + stats.pending : undefined} tone="muted" />
      </div>

      {awaiting > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warn/20 bg-warn-tint px-4 py-3">
          <Clock size={20} className="shrink-0 text-warn" aria-hidden />
          <p className="min-w-0 flex-1 text-[15px] text-ink">
            <b>{formatNumber(awaiting)}</b> kishi yuzini yubordi va tasdiqingizni kutmoqda
          </p>
          <Button size="sm" onClick={() => setFace('tasdiq_kutmoqda')}>
            Ko‘rib chiqish
          </Button>
          <Button size="sm" variant="primary" loading={approvingAll} onClick={approveAll}>
            Hammasini tasdiqlash
          </Button>
        </div>
      )}

      {/* Qidiruv va filtrlar */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, familiya yoki JSHSHIR bo‘yicha qidirish"
            aria-label="Qidirish"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={faculty}
            onChange={setFaculty}
            placeholder="Barcha fakultetlar"
            options={faculties.map((f) => ({ value: f.name, label: f.name }))}
            className="w-full sm:w-56"
            ariaLabel="Fakultet"
          />
          {type === 'talaba' && (
            <Select
              value={course}
              onChange={setCourse}
              placeholder="Barcha kurslar"
              options={[1, 2, 3, 4, 5, 6].map((c) => ({ value: String(c), label: `${c}-kurs` }))}
              className="w-full sm:w-40"
              ariaLabel="Kurs"
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FACE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFace(f.value)}
            aria-pressed={face === f.value}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
              face === f.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-soft hover:border-faint hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ro'yxat */}
      <div className="mt-5">
        {list.error ? (
          <Alert>{list.error}</Alert>
        ) : list.loading && list.items.length === 0 ? (
          <Spinner />
        ) : list.items.length === 0 ? (
          <div className="card">
            <Empty icon={Users} title="Hech kim topilmadi" text="Qidiruv yoki filtrlarni o‘zgartirib ko‘ring." />
          </div>
        ) : (
          <>
            <p className="mb-3 text-[14px] text-soft">{formatNumber(list.total)} kishi</p>
            <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6', list.refreshing && 'opacity-60')}>
              {list.items.map((p) => (
                <PersonCard key={p.id} person={p} onOpen={() => setSelected(p)} />
              ))}
            </div>
            {list.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button size="sm" icon={ChevronLeft} disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>
                  Oldingi
                </Button>
                <span className="text-[14px] text-soft">
                  {list.page} / {list.totalPages}
                </span>
                <Button size="sm" disabled={list.page >= list.totalPages} onClick={() => list.setPage(list.page + 1)}>
                  Keyingi <ChevronRight size={15} aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <PersonPanel
          person={selected}
          onClose={() => setSelected(null)}
          onChanged={(next) => {
            if (next) setSelected(next);
            else setSelected(null);
            refresh();
          }}
        />
      )}
      {linkOpen && <EnrollLinkModal onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function StatCard({ label, value, tone, percent }: { label: string; value?: number; tone?: 'ok' | 'muted'; percent?: number | null }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[14px] text-soft">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-[28px] font-semibold tracking-tight', tone === 'ok' ? 'text-ok' : tone === 'muted' ? 'text-soft' : 'text-ink')}>
          {value === undefined ? '—' : formatNumber(value)}
        </span>
        {percent != null && <span className="text-[14px] text-faint">{Math.round(percent * 100)}%</span>}
      </div>
      {percent != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, percent * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function PersonCard({ person, onOpen }: { person: StudentStaffRecord; onOpen: () => void }) {
  const status = faceStatus(person);
  const sub = person.type === 'talaba' ? person.group || person.groupOrPosition : person.position || person.groupOrPosition;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group overflow-hidden text-left transition-shadow hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden bg-page">
        {person.biometricPhotoUrl || person.hemisPhotoUrl ? (
          <Photo src={person.biometricPhotoUrl || person.hemisPhotoUrl} name={person.fullName} className="h-full w-full transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-line">
            <UserRound size={56} aria-hidden />
          </div>
        )}
        <Badge tone={status.tone} className="absolute left-2 top-2 shadow-card">
          {status.label}
        </Badge>
      </div>
      <div className="px-3 py-2.5">
        <p className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">{person.fullName}</p>
        {sub && <p className="mt-0.5 truncate text-[13px] text-faint">{sub}</p>}
      </div>
    </button>
  );
}
