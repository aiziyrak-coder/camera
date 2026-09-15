import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet, Loader2, RefreshCw, Save } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ErrorState from '../../components/ui/ErrorState';
import { SkeletonBlock, SkeletonCards } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import PeriodPicker, { type PeriodValue } from '../../components/reports/PeriodPicker';
import ReportView from '../../components/reports/ReportView';
import ArchiveList from '../../components/reports/ArchiveList';
import LegacyReportView from '../../components/reports/LegacyReportView';
import { ApiError, api, buildQuery, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import { downloadBlob } from '../../lib/download';
import { isFixedPreset, resolvePreset, validateRange } from '../../lib/reportPeriods';
import { invalidateServerPageCache } from '../../lib/useServerPage';
import type { ReportAnalytics, ReportDetail } from '../../types';

type Tab = 'tahlil' | 'arxiv';

const TABS: { value: Tab; label: string }[] = [
  { value: 'tahlil', label: 'Tahlil' },
  { value: 'arxiv', label: 'Arxiv' },
];

const CACHE_MS = 60_000;
const analyticsCache = new Map<string, { at: number; data: ReportAnalytics }>();

function readPeriod(params: URLSearchParams): PeriodValue {
  const raw = params.get('davr');
  if (raw === 'custom') {
    const fallback = resolvePreset('last7');
    return { preset: 'custom', from: params.get('from') ?? fallback.from, to: params.get('to') ?? fallback.to };
  }
  const preset = isFixedPreset(raw) ? raw : 'last7';
  return { preset, ...resolvePreset(preset) };
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Tarmoq xatosi — server bilan bog'lanib bo'lmadi";
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Hisobot tayyorlanmoqda">
      <div className="grid gap-3 md:grid-cols-2">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
      <SkeletonCards count={6} className="xl:grid-cols-3" />
      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { token, role, userName } = useAuth();
  const { can } = usePermissions();
  const canExport = can('exportData', role);
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const tab: Tab = params.get('tab') === 'arxiv' ? 'arxiv' : 'tahlil';
  const period = readPeriod(params);
  const rangeError = validateRange(period.from, period.to);

  const [analytics, setAnalytics] = useState<ReportAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastNonce = useRef(0);
  const [busy, setBusy] = useState<'save' | 'pdf' | 'xlsx' | null>(null);
  const [opened, setOpened] = useState<ReportDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (value === null) p.delete(key);
            else p.set(key, value);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (tab !== 'tahlil' || !token || rangeError) return;
    const key = `${period.from}|${period.to}`;
    const forced = lastNonce.current !== reloadNonce;
    lastNonce.current = reloadNonce;
    const cached = analyticsCache.get(key);
    if (cached && !forced) {
      setAnalytics(cached.data);
      setError(null);
      if (Date.now() - cached.at < CACHE_MS) return;
    }

    const controller = new AbortController();
    setLoading(true);
    api
      .get<ReportAnalytics>(`/api/reports/analytics${buildQuery({ from: period.from, to: period.to })}`, token, {
        signal: controller.signal,
      })
      .then((data) => {
        analyticsCache.set(key, { at: Date.now(), data });
        setAnalytics(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError(errorText(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, token, period.from, period.to, rangeError, reloadNonce]);

  const current =
    analytics && analytics.period.start === period.from && analytics.period.end === period.to ? analytics : null;

  async function saveToArchive() {
    if (!current) return;
    setBusy('save');
    try {
      await api.post<ReportDetail>('/api/reports', { from: period.from, to: period.to }, token);
      invalidateServerPageCache('/api/reports');
      toast.success(`"${current.period.label}" hisoboti arxivga saqlandi`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf(data: ReportAnalytics, title?: string) {
    setBusy('pdf');
    try {
      const { exportAnalyticsPdf } = await import('../../lib/reportPdf');
      await exportAnalyticsPdf(data, { preparedBy: userName, root: viewRef.current, title });
    } catch (err) {
      toast.error(`PDF tayyorlab bo'lmadi: ${err instanceof Error ? err.message : "noma'lum xato"}`);
    } finally {
      setBusy(null);
    }
  }

  async function exportXlsx() {
    setBusy('xlsx');
    try {
      const blob = await api.blob(`/api/reports/analytics.xlsx${buildQuery({ from: period.from, to: period.to })}`, token);
      downloadBlob(blob, `hisobot-${period.from}_${period.to}.xlsx`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function openReport(id: string) {
    setOpening(id);
    try {
      setOpened(await api.get<ReportDetail>(`/api/reports/${id}`, token));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setOpening(null);
    }
  }

  const exportButtons = (onPdf: () => void, withExcel: boolean, ready: boolean) =>
    canExport && (
      <>
        {withExcel && (
          <button
            type="button"
            onClick={exportXlsx}
            disabled={!ready || busy !== null}
            className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Excel
          </button>
        )}
        <button
          type="button"
          onClick={onPdf}
          disabled={!ready || busy !== null}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          PDF hisobot
        </button>
      </>
    );

  return (
    <section className="glass p-6">
      <PageHeader
        title="Hisobotlar"
        subtitle="Institut faoliyati tahlili: davomat, xavfsizlik, darslar va tizim holati"
        action={
          <SegmentedControl
            options={TABS}
            value={tab}
            ariaLabel="Hisobot bo'limi"
            onChange={(next) => {
              setOpened(null);
              updateParams({ tab: next === 'arxiv' ? 'arxiv' : null });
            }}
          />
        }
      />

      {tab === 'tahlil' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/50 p-3">
            <PeriodPicker
              value={period}
              onChange={(next) =>
                updateParams(
                  next.preset === 'custom'
                    ? { davr: 'custom', from: next.from, to: next.to }
                    : { davr: next.preset, from: null, to: null },
                )
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                disabled={loading || !!rangeError}
                aria-label="Ma'lumotni yangilash"
                title="Yangilash"
                className="btn-glass flex items-center !px-2.5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={saveToArchive}
                disabled={!current || busy !== null}
                className="btn-glass flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Arxivga saqlash
              </button>
              {exportButtons(() => current && exportPdf(current), true, !!current)}
            </div>
          </div>

          {current && (
            <p className="mb-5 text-xs text-slate-500">
              Davr: <span className="font-semibold text-slate-700">{current.period.label}</span> · {current.period.days} kun ·
              solishtiriladi: {current.previousPeriod.label} · ma&apos;lumot {current.generatedAt.slice(11)} holatiga
              {loading && <Loader2 size={12} className="ml-1.5 inline animate-spin" aria-label="Yangilanmoqda" />}
            </p>
          )}

          {rangeError ? (
            <ErrorState title="Davr noto'g'ri tanlangan" message={rangeError} />
          ) : error && !current ? (
            <ErrorState message={error} onRetry={() => setReloadNonce((n) => n + 1)} />
          ) : !current ? (
            <ReportSkeleton />
          ) : (
            <div ref={viewRef}>
              <ReportView analytics={current} />
            </div>
          )}
        </>
      ) : opened ? (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpened(null)}
                className="btn-glass flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                Arxiv
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{opened.periodLabel}</p>
                <p className="text-[11px] text-slate-500">
                  Saqlangan: {opened.generatedAt}
                  {opened.createdBy ? ` · ${opened.createdBy}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {opened.analytics &&
                exportButtons(() => opened.analytics && exportPdf(opened.analytics, `Tahliliy hisobot: ${opened.periodLabel}`), false, true)}
            </div>
          </div>
          {opened.analytics ? (
            <div ref={viewRef}>
              <ReportView analytics={opened.analytics} />
            </div>
          ) : (
            <LegacyReportView report={opened} />
          )}
        </>
      ) : (
        <ArchiveList onOpen={openReport} opening={opening} />
      )}
    </section>
  );
}
