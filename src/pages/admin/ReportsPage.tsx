import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, Download, GraduationCap, Printer, UserRound } from 'lucide-react';
import {
  Button,
  ErrorState,
  Page,
  SkeletonCard,
  SkeletonTiles,
  Tabs,
  buttonClasses,
  formatUzRange,
  useToast,
  type TabItem,
} from '../../ui';
import CriteriaPanel from '../../components/reports/CriteriaPanel';
import ReportFilters from '../../components/reports/ReportFilters';
import ReportView from '../../components/reports/ReportView';
import TabelView from '../../components/reports/TabelView';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { useApiResource } from '../../lib/useApiResource';
import { formatUzMonth } from '../../lib/uzDate';
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
  type HisobotView,
} from '../../lib/hisobotApi';
import { tabelExcelFilename, tabelExcelHref, tabelPaths, type TabelReport } from '../../lib/tabelApi';

/** Hisobotlar: Xodimlar | Talabalar — ikki alohida bo'lim.
 *
 * Ikki ko'rinish bor. "Tahlil" — ko'rsatkichlar, trend va ro'yxatlar.
 * "Oylik tabel" — buyurtmachi imzolaydigan hujjat: qatorlar odamlar,
 * ustunlar oyning kunlari. Bo'lim va qamrov filtrlari ikkalasida bir
 * xil ishlaydi; farqi shundaki, tabelda erkin sana oralig'i o'rnida
 * OY tanlanadi. Butun holat URL'da — havolani ulashish mumkin. */

const SECTIONS: TabItem<HisobotSection>[] = [
  { id: 'xodimlar', label: 'Xodimlar', icon: UserRound },
  { id: 'talabalar', label: 'Talabalar', icon: GraduationCap },
];

const VIEWS: TabItem<HisobotView>[] = [
  { id: 'tahlil', label: 'Tahlil', icon: ChartNoAxesColumn },
  { id: 'tabel', label: 'Oylik tabel', icon: CalendarDays },
];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readState(params), [params]);
  const { token } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const kind = SECTION_KIND[state.section];
  const tabel = state.view === 'tabel';
  const options = useApiResource<HisobotFilterOptions>(hisobotPaths.filters(kind));
  // Faqat ko'rinayotgan hisobot so'raladi — ikkinchisi tekin trafik.
  const report = useApiResource<HisobotReport>(tabel ? null : hisobotPaths.report(state));
  const sheet = useApiResource<TabelReport>(tabel ? tabelPaths.data(state) : null);
  // Bo'lim almashganda eski bo'lim ma'lumoti ko'rinmasin.
  const data = report.data && report.data.kind === kind ? report.data : null;
  const sheetData = sheet.data && sheet.data.month === state.month ? sheet.data : null;
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
  const peopleWord = state.section === 'xodimlar' ? 'xodim' : 'talaba';

  async function exportExcel() {
    if (!tabel && !criterion) return;
    setExporting(true);
    try {
      const path = tabel ? tabelPaths.excel(state) : hisobotPaths.export(state, criterion);
      const blob = await api.blob(path, token);
      downloadBlob(
        blob,
        tabel ? tabelExcelFilename(state) : `hisobot-${state.section}-${criterion}-${state.from}_${state.to}.xlsx`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Excel faylni yuklab bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  const subtitle = tabel
    ? sheetData
      ? `${sheetData.scope} · ${sheetData.monthLabel || formatUzMonth(state.month)} · ${sheetData.totals?.people?.toLocaleString('ru-RU') ?? sheetData.people.length} ${peopleWord}`
      : formatUzMonth(state.month)
    : data
      ? `${data.scope} · ${formatUzRange(data.period.from, data.period.to)} · ${data.population.total.toLocaleString('ru-RU')} ${peopleWord}`
      : undefined;

  const ready = tabel ? Boolean(sheetData) : Boolean(data);

  return (
    <Page
      title="Hisobotlar"
      subtitle={subtitle}
      actions={
        <span className="flex gap-2 print-hide">
          <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!ready}>
            Chop etish
          </Button>
          {/* Tabelda — oddiy havola: faylni server tuzadi, o'ng tugma bilan
              nusxalash ham ishlaydi. Bosilganda tokenli so'rov ketadi. */}
          {tabel ? (
            <a
              href={tabelExcelHref(state)}
              data-tabel-excel
              className={buttonClasses({ variant: 'secondary', size: 'md' })}
              onClick={(event) => {
                event.preventDefault();
                void exportExcel();
              }}
              aria-disabled={!ready || exporting}
            >
              <Download size={16} aria-hidden="true" />
              Excel
            </a>
          ) : (
            <Button variant="secondary" icon={Download} onClick={exportExcel} loading={exporting} disabled={!data}>
              Excel
            </Button>
          )}
        </span>
      }
      toolbar={
        <div className="flex flex-col gap-4 print-hide">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs tabs={SECTIONS} value={state.section} onChange={(section) => update({ section })} ariaLabel="Hisobot bo'limi" />
            <Tabs
              tabs={VIEWS}
              value={state.view}
              onChange={(view) => update({ view })}
              variant="segmented"
              size="sm"
              ariaLabel="Hisobot ko'rinishi"
              className="sm:ms-auto"
            />
          </div>
          <ReportFilters state={state} options={filterOptions} onChange={update} onReset={reset} />
        </div>
      }
    >
      {tabel ? (
        <section className="min-w-0" aria-busy={sheet.loading} aria-label="Oylik tabel">
          {sheet.error && !sheetData ? (
            <ErrorState title="Tabelni yuklab bo'lmadi" message={sheet.error} onRetry={sheet.reload} />
          ) : !sheetData ? (
            <SkeletonCard />
          ) : (
            <div className={sheet.loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
              <TabelView data={sheetData} section={state.section} />
            </div>
          )}
        </section>
      ) : (
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
      )}
    </Page>
  );
}
