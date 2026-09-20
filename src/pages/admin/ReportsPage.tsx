import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, Download, GraduationCap, Loader2, Printer, TriangleAlert, UserRound } from 'lucide-react';
import {
  Button,
  ErrorState,
  Page,
  SkeletonCard,
  SkeletonTiles,
  Tabs,
  buttonClasses,
  cn,
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
  /* Tabel javobida `kind` maydoni yo'q, shuning uchun qaysi BO'LIM uchun
     kelganini o'zimiz eslab qolamiz. Ilgari faqat oy solishtirilardi:
     xodimlardan talabalarga o'tilganda oy o'zgarmagani uchun ekranda
     xodimlarning qatorlari "Guruh" ustuni bilan turib qolardi — imzoga
     ketadigan hujjat uchun jiddiy xato. (Eski so'rov useApiResource'da
     bekor qilinadi, shuning uchun javob kelganda joriy bo'lim aynan
     shu javobning bo'limi bo'ladi.) */
  const [sheetSection, setSheetSection] = useState(state.section);
  useEffect(() => {
    if (sheet.data) setSheetSection(state.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat yangi javob kelganda
  }, [sheet.data]);
  const sheetData =
    sheet.data && sheet.data.month === state.month && sheetSection === state.section ? sheet.data : null;
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
    // Ikki marta bosilganda ikkita so'rov ketmasin: 300 qatorli tabelni
    // server sekundlab tuzadi, foydalanuvchi esa "ishlamadi" deb yana
    // bosadi.
    if (exporting) return;
    setExporting(true);
    try {
      const path = tabel ? tabelPaths.excel(state) : hisobotPaths.export(state, criterion);
      const blob = await api.blob(path, token);
      const filename = tabel
        ? tabelExcelFilename(state)
        : `hisobot-${state.section}-${criterion}-${state.from}_${state.to}.xlsx`;
      downloadBlob(blob, filename);
      // Yuklab olish brauzerda jimgina ketadi — hech qanday belgi
      // bo'lmasa, foydalanuvchi "hech nima bo'lmadi" deb o'ylardi.
      toast.success(`${filename} yuklab olindi`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Excel faylni yuklab bo'lmadi — qaytadan urinib ko'ring");
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
          {/* Yangilanayotgan varaqni chop etib qo'yish mumkin emas:
              eski sonlar qog'ozga tushib, imzolanib ketardi. */}
          <Button
            variant="secondary"
            icon={Printer}
            onClick={() => window.print()}
            disabled={!ready || (tabel ? sheet.loading : report.loading)}
          >
            Chop etish
          </Button>
          {/* Tabelda — oddiy havola: faylni server tuzadi, o'ng tugma bilan
              nusxalash ham ishlaydi. Bosilganda tokenli so'rov ketadi. */}
          {tabel ? (
            <a
              href={tabelExcelHref(state)}
              data-tabel-excel
              className={cn(
                buttonClasses({ variant: 'secondary', size: 'md' }),
                (!ready || exporting) && 'pointer-events-none opacity-60',
              )}
              onClick={(event) => {
                event.preventDefault();
                // `aria-disabled` bosishni to'xtatmaydi: tabel hali
                // yuklanmaganida yoki fayl tuzilayotganida bosilsa,
                // ikkinchi (va noto'g'ri filtrli) so'rov ketardi.
                if (!ready || exporting) return;
                void exportExcel();
              }}
              aria-disabled={!ready || exporting}
              aria-busy={exporting}
              tabIndex={!ready || exporting ? -1 : undefined}
            >
              {exporting ? (
                <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              {exporting ? 'Tayyorlanmoqda…' : 'Excel'}
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
              {/* Yangilash xatosi ilgari jimgina yutilardi: ekranda eski
                  oyning tabeli turaverardi va uni chop etish mumkin edi. */}
              {sheet.error && <StaleWarning message={sheet.error} onRetry={sheet.reload} />}
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
                {report.error && <StaleWarning message={report.error} onRetry={report.reload} />}
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

/** Ma'lumot ekranda turibdi, lekin oxirgi yangilash xato bilan tugadi —
 *  eskirgan sonlar chop etilib ketmasligi uchun ochiq aytiladi. */
function StaleWarning({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p
      role="alert"
      className="print-hide mb-3 flex flex-wrap items-center gap-2 rounded-card border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-fg"
    >
      <TriangleAlert size={15} aria-hidden="true" className="shrink-0" />
      <span>Ko&apos;rsatilayotgan ma&apos;lumot eskirgan bo&apos;lishi mumkin: {message}</span>
      <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
        Qayta urinish
      </button>
    </p>
  );
}
