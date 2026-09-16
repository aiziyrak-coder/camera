import { ArrowLeft, Camera as CameraIcon, Clock, ScanFace } from 'lucide-react';
import Pagination from '../Pagination';
import SearchInput from '../ui/SearchInput';
import SegmentedControl from '../ui/SegmentedControl';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonTable } from '../ui/Skeleton';
import type { ReportCriterion, ReportPersonRow } from '../../types';

/** 2-daraja: kartadagi raqam ortidagi odamlar.
 *
 * Har qatorda "isbot" belgilari bor — qachon kelgani (check-in) va uni
 * oxirgi marta qaysi kamera ko'rgani. Ismni bosish uchinchi darajaga,
 * ya'ni odamning to'liq kesimiga olib boradi. */
function initialsAvatar(row: ReportPersonRow) {
  if (row.photoUrl) {
    return (
      <img
        src={row.photoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
        loading="lazy"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">
      {row.initials}
    </span>
  );
}

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
  onBack,
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
  onBack: () => void;
}) {
  const current = criterion.buckets.find((item) => item.key === bucket) ?? criterion.buckets[0];

  return (
    <section className="glass p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-indigo-600"
          >
            <ArrowLeft size={14} />
            Kriteriyalar
          </button>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">{criterion.title}</h3>
            <p className="text-[11px] text-slate-500">
              {current?.label} — {total} ta odam
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            ariaLabel="Ro'yxat turini tanlash"
            value={bucket}
            onChange={onBucketChange}
            options={criterion.buckets.map((item) => ({
              value: item.key,
              label: item.label,
              count: item.count,
            }))}
          />
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Ism bo'yicha qidirish..."
            ariaLabel="Ro'yxatdan qidirish"
          />
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={onRetry} />}

      {loading && people.length === 0 ? (
        <SkeletonTable rows={6} columns={5} />
      ) : people.length === 0 ? (
        <EmptyState
          compact
          icon={<ScanFace size={18} />}
          title="Bu ro'yxat bo'sh"
          description="Tanlangan davr va kriteriya bo'yicha odam topilmadi."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Ism</th>
                <th className="px-4 py-3">Kafedra / bo&apos;lim</th>
                <th className="px-4 py-3">Lavozim / guruh</th>
                <th className="px-4 py-3">Davomat</th>
                <th className="px-4 py-3">Isbot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {people.map((person) => (
                <tr
                  key={person.id}
                  onClick={() => onOpenPerson(person)}
                  className="cursor-pointer transition-colors hover:bg-white/50"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {initialsAvatar(person)}
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{person.fullName}</span>
                        {person.biometricsStatus !== 'tasdiqlangan' && (
                          <span className="text-[10px] font-semibold text-rose-500">
                            yuzi ro&apos;yxatga kiritilmagan
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{person.faculty}</td>
                  <td className="px-4 py-2.5 text-slate-600">{person.unit}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    <span className="text-emerald-600">{person.presentDays}</span> keldi ·{' '}
                    <span className="text-amber-600">{person.lateDays}</span> kechikdi ·{' '}
                    <span className="text-rose-600">{person.absentDays}</span> kelmadi
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {person.firstCheckIn && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} className="text-indigo-500" />
                          {person.firstCheckIn}
                        </span>
                      )}
                      {person.visits > 0 ? (
                        <span className="flex items-center gap-1">
                          <CameraIcon size={11} className="text-indigo-500" />
                          {person.visits} ta ko&apos;rinish
                          {person.lastSeenCamera ? ` · ${person.lastSeenCamera}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">kamerada ko&apos;rinmagan</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onChange={onPageChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}
