import { useState } from 'react';
import { Archive, FileText, Loader2, Trash2 } from 'lucide-react';
import Badge from '../Badge';
import Pagination from '../Pagination';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import SegmentedControl from '../ui/SegmentedControl';
import { SkeletonCards } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';
import type { Report } from '../../types';

type Filter = 'all' | Report['period'];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: 'Kunlik', label: 'Kunlik' },
  { value: 'Haftalik', label: 'Haftalik' },
  { value: 'Oylik', label: 'Oylik' },
];

export default function ArchiveList({ onOpen, opening }: { onOpen: (id: string) => void; opening: string | null }) {
  const { token } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [deleting, setDeleting] = useState<Report | null>(null);
  const { items, page, setPage, totalPages, total, pageSize, loading, error, reload } = useServerPage<Report>(
    '/api/reports',
    { period: filter === 'all' ? undefined : filter },
    9,
    { debounceMs: 0 },
  );

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/reports/${deleting.id}`, token);
      toast.success(`"${deleting.periodLabel}" hisoboti o'chirildi`);
      setDeleting(null);
      invalidateServerPageCache('/api/reports');
      reload();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "O'chirib bo'lmadi");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Arxiv filtri" size="sm" />
        <p className="text-xs text-slate-500">Saqlangan hisobot ochilganda saqlash paytidagi ma&apos;lumot ko&apos;rsatiladi.</p>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && items.length === 0 ? (
        <SkeletonCards count={6} className="xl:grid-cols-3" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Archive size={18} />}
          title="Arxiv bo'sh"
          description="«Tahlil» bo'limida davrni tanlab, «Arxivga saqlash» tugmasini bosing — hisobot shu yerda paydo bo'ladi."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((report) => {
              const metrics = report.kpis?.length
                ? report.kpis.slice(0, 3).map((kpi) => ({ label: kpi.label, value: kpi.display }))
                : report.stats.slice(0, 3);
              return (
                <article key={report.id} className="flex flex-col rounded-2xl border border-white/70 bg-white/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="indigo">{report.period}</Badge>
                        {!report.hasAnalytics && <Badge tone="slate">Eski format</Badge>}
                      </div>
                      <h4 className="truncate text-sm font-bold text-slate-900" title={report.periodLabel}>
                        {report.periodLabel}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {report.createdBy ? `${report.createdBy} · ` : ''}
                        {report.generatedAt}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleting(report)}
                      aria-label={`${report.periodLabel} hisobotini o'chirish`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="rounded-lg bg-white/70 px-2 py-1.5">
                        <dt className="truncate text-[10px] text-slate-500" title={metric.label}>
                          {metric.label}
                        </dt>
                        <dd className="text-sm font-bold tabular-nums text-slate-900">{metric.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    onClick={() => onOpen(report.id)}
                    disabled={opening !== null}
                    className="btn-glass mt-3 flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {opening === report.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    Ochish
                  </button>
                </article>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Hisobotni o'chirish"
        message={deleting ? `"${deleting.periodLabel}" hisobotini arxivdan o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
