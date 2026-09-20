import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, GraduationCap, Printer, UserRound } from 'lucide-react';
import { Button, ErrorState, Page, SkeletonCard, SkeletonTiles, Tabs, formatUzRange, useToast, type TabItem } from '../../ui';
import CriteriaPanel from '../../components/reports/CriteriaPanel';
import ReportFilters from '../../components/reports/ReportFilters';
import ReportView from '../../components/reports/ReportView';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { useApiResource } from '../../lib/useApiResource';
import {
  SECTION_KIND,
  drillPatch,
  hisobotPaths,
  readState,
  writeState,
  type HisobotFilterOptions,
  type HisobotReport,
  type HisobotSection,
  type HisobotState,
} from '../../lib/hisobotApi';

/** Hisobotlar: Xodimlar | Talabalar — ikki alohida bo'lim.
 *
 * Yuqorida: bo'lim, davr va bo'limga xos filtrlar (talaba: fakultet -> kurs
 * -> guruh; xodim: bo'linma turi -> bo'linma) va ism qidiruvi. Chapda:
 * mezonlar (davomat, kechikish, forma...) — har biri qisqa ko'rsatkich bilan.
 * O'ngda: tanlangan mezon bo'yicha plitkalar, trend, kesim va odamlar.
 * Butun holat URL'da — havolani ulashish mumkin. */

const SECTIONS: TabItem<HisobotSection>[] = [
  { id: 'xodimlar', label: 'Xodimlar', icon: UserRound },
  { id: 'talabalar', label: 'Talabalar', icon: GraduationCap },
];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readState(params), [params]);
  const { token } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const kind = SECTION_KIND[state.section];
  const options = useApiResource<HisobotFilterOptions>(hisobotPaths.filters(kind));
  const report = useApiResource<HisobotReport>(hisobotPaths.report(state));
  // Bo'lim almashganda eski bo'lim ma'lumoti ko'rinmasin.
  const data = report.data && report.data.kind === kind ? report.data : null;
  const filterOptions = options.data;

  const update = useCallback(
    (patch: Partial<HisobotState>) => setParams((prev) => writeState(prev, patch), { replace: true }),
    [setParams],
  );
  const reset = useCallback(
    () => update({ faculty: '', course: '', group: '', unitKind: '', unit: '', q: '' }),
    [update],
  );

  const criterion = data?.criterion ?? state.criterion;
  const canDrill = data ? drillPatch(state, '_') !== null : false;

  async function exportExcel() {
    if (!criterion) return;
    setExporting(true);
    try {
      const blob = await api.blob(hisobotPaths.export(state, criterion), token);
      downloadBlob(blob, `hisobot-${state.section}-${criterion}-${state.from}_${state.to}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Excel faylni yuklab bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Page
      title="Hisobotlar"
      subtitle={
        data
          ? `${data.scope} · ${formatUzRange(data.period.from, data.period.to)} · ${data.population.total.toLocaleString('ru-RU')} ${state.section === 'xodimlar' ? 'xodim' : 'talaba'}`
          : undefined
      }
      actions={
        <span className="flex gap-2 print-hide">
          <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!data}>
            Chop etish
          </Button>
          <Button variant="secondary" icon={Download} onClick={exportExcel} loading={exporting} disabled={!data}>
            Excel
          </Button>
        </span>
      }
      toolbar={
        <div className="flex flex-col gap-4 print-hide">
          <Tabs tabs={SECTIONS} value={state.section} onChange={(section) => update({ section })} ariaLabel="Hisobot bo'limi" />
          <ReportFilters state={state} options={filterOptions} onChange={update} onReset={reset} />
        </div>
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 print-hide lg:sticky lg:top-4 lg:self-start">
          <CriteriaPanel
            criteria={data?.criteria ?? null}
            value={criterion}
            onChange={(key) => update({ criterion: key })}
            loading={report.loading}
          />
        </aside>
        <section className="min-w-0" aria-busy={report.loading} aria-label="Hisobot">
          {report.error && !data ? (
            <ErrorState title="Hisobotni yuklab bo'lmadi" message={report.error} onRetry={report.reload} />
          ) : !data ? (
            <div className="flex flex-col gap-5">
              <SkeletonTiles count={4} />
              <SkeletonCard />
            </div>
          ) : (
            <div className={report.loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
              <ReportView
                data={data}
                onDrill={canDrill ? (rowId) => {
                  const patch = drillPatch(state, rowId);
                  if (patch) update(patch);
                } : null}
              />
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
