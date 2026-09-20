import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, RefreshCw, ScanFace } from 'lucide-react';
import {
  Button,
  CodeText,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  EmptyState,
  ErrorState,
  IconButton,
  IntelPanel,
  MicroLabel,
  Page,
  SkeletonCards,
  SkeletonTiles,
  Toolbar,
  formatNumber,
  formatPercent,
  formatUzDate,
  useShell,
  useUrlTab,
  type DataTableColumn,
  type TabItem,
} from '../../ui';
import { RATE_RAG, rag } from '../../ui/rag';
import { RagLegend, StatusBoard, type BoardItem } from '../../components/hisobot/board';
import { KpiReadout, RateCell, StaleNote, stamp, worstFirst } from '../../components/attendance/readout';
import { dayReference, unitCode } from '../../components/attendance/references';
import { branding } from '../../lib/branding';
import { getOverview, situationPaths, type FacultyCounts, type Overview } from '../../lib/situationApi';
import { enrolledPct, hasAttendanceData } from '../../lib/studentAttendance';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import { useViewDate } from '../../lib/viewDate';
import { LiveArrivals, type ArrivalItem } from '../../components/attendance/LiveArrivals';
import { QuickSearch } from '../../components/students/QuickSearch';
import { useAsyncData } from '../../components/students/useAsyncData';
import { EnrollmentCampaign } from '../../components/students/EnrollmentCampaign';

type ViewId = 'davomat' | 'yuz';
const VIEW_PARAM = 'korinish';

const REFRESH_MS = 60_000;
const FEED_SIZE = 10;

/** Ro'yxatdagi fakultetga barqaror xizmat kodi: FAK-01, FAK-02. Tartib —
 *  serverdan kelgan ro'yxat tartibi, shuning uchun ekranda saralash kodni
 *  ko'chirmaydi va havola ulashilganda kod o'zgarmaydi. */
function facultyCodes(faculties: FacultyCounts[]): Map<string, string> {
  return new Map(faculties.map((f, index) => [f.id ?? 'none', unitCode('FAK', index)]));
}

/** /talabalar — har bir fakultet bo'yicha talabalar davomati. Yuzlar hali kam bo'lsa
 *  (studentsDataAvailable=false) asosiy ko'rinish — "Yuz topshirish" kampaniyasi. */
export default function FacultiesPage() {
  const { date, today, isToday, withDate } = useViewDate();
  const { presentation } = useShell();
  const navigate = useNavigate();
  const overview = useAsyncData<Overview>(`ov|${date}`, (signal) => getOverview(date, { signal }), {
    refreshMs: isToday ? REFRESH_MS : undefined,
  });
  const data = overview.data;
  const [live, setLive] = useState<ArrivalItem[]>([]);
  useEffect(() => setLive([]), [date]);

  const reload = overview.reload;
  useLiveAttendance(
    useCallback(
      (m: LiveAttendanceMessage) => {
        if (m.personType !== 'talaba' || m.date !== date) return;
        setLive((prev) =>
          [{ personId: m.personId, fullName: m.fullName, unit: m.group, status: m.status, checkIn: m.checkIn }, ...prev.filter((p) => p.personId !== m.personId)].slice(0, FEED_SIZE),
        );
      },
      [date],
    ),
    isToday,
  );
  // Jonli xabarlar kelganda jami sonlar ham yangilansin (server keshi 15 s).
  // MUHIM: taymer har yangi xabarda qayta boshlanmaydi. Ilgari `live`
  // o'zgarishi taymerni nolga qaytarardi — ertalabki oqimda xabarlar 5 s dan
  // tez kelgani uchun jami sonlar umuman yangilanmay qolardi.
  const reloadTimer = useRef(0);
  useEffect(() => {
    if (!live.length || reloadTimer.current) return;
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = 0;
      reload();
    }, 5_000);
  }, [live, reload]);
  useEffect(
    () => () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  const arrivals = useMemo<ArrivalItem[]>(() => {
    const initial = (data?.lastArrivals ?? [])
      .filter((a) => a.type === 'talaba')
      .map((a) => ({ personId: a.id, fullName: a.fullName, photoUrl: a.photoUrl, unit: a.unit, status: a.status, checkIn: a.time }));
    const seen = new Set(live.map((l) => l.personId));
    return [...live, ...initial.filter((a) => !seen.has(a.personId))].slice(0, FEED_SIZE);
  }, [data, live]);

  const s = data?.students;
  const faculties = useMemo(
    () => data?.byFaculty.filter((f) => f.total > 0 || f.id !== null) ?? [],
    [data],
  );
  const codes = useMemo(() => facultyCodes(faculties), [faculties]);
  const available = data ? data.studentsDataAvailable : true;
  const views: TabItem<ViewId>[] = [
    { id: 'davomat', label: 'Davomat', icon: CalendarCheck },
    { id: 'yuz', label: 'Yuz topshirish', icon: ScanFace },
  ];
  const defaultView: ViewId = available ? 'davomat' : 'yuz';
  const [view, setView] = useUrlTab(views, { param: VIEW_PARAM, defaultTab: defaultView });

  const reference = dayReference('TAL-FAK', date);
  const generatedAt = useMemo(stamp, [date, data]);

  // Taxtadagi kataklar. Yuzi yetarli yig'ilmagan fakultetda foiz BOR, lekin
  // u guruhning kichik qismidan chiqqan — unga svetofor qo'yish yolg'on
  // hukm bo'lardi, shuning uchun qiymat "o'lchanmagan" deb uzatiladi va
  // sababi ikkinchi qatorda yoziladi.
  const board = useMemo<BoardItem[]>(
    () =>
      faculties.map((f) => {
        const measured = f.total > 0 && hasAttendanceData(f);
        const facePct = enrolledPct(f);
        return {
          id: f.id ?? 'none',
          code: codes.get(f.id ?? 'none') ?? 'FAK-00',
          name: f.name,
          value: measured ? f.rate : null,
          unit: '%',
          detail:
            f.total === 0
              ? "Fakultetda talaba yo'q"
              : measured
                ? `${formatNumber(f.present)} / ${formatNumber(f.present + f.absent + f.notYet)} keldi`
                : `Yuzi ro'yxatda ${formatPercent(facePct)} — davomat hali o'lchanmaydi`,
          headcount: f.total,
        };
      }),
    [faculties, codes],
  );
  const sortedBoard = useMemo(() => worstFirst(board), [board]);

  const columns: DataTableColumn<FacultyCounts>[] = [
    {
      key: 'code',
      header: 'Kod',
      width: '5.5rem',
      mono: true,
      sortValue: (f) => codes.get(f.id ?? 'none') ?? '',
      cell: (f) => <CodeText className="text-[12px] text-subtle">{codes.get(f.id ?? 'none')}</CodeText>,
    },
    {
      key: 'name',
      header: 'Fakultet',
      sortValue: (f) => f.name,
      cell: (f) => (
        <span className="block truncate text-[13px] font-medium text-fg" title={f.name}>
          {f.name}
        </span>
      ),
    },
    { key: 'total', header: 'Jami talaba', align: 'right', sortValue: (f) => f.total, sortFirst: 'desc', cell: (f) => formatNumber(f.total) },
    {
      key: 'faces',
      header: "Yuzi ro'yxatda",
      align: 'right',
      hideOnMobile: true,
      sortValue: (f) => enrolledPct(f),
      // Bu ULUSH ham foiz, lekin davomat emas — unga davomat svetofori
      // qo'yilmaydi. Yetarli emasligi matn bilan aytiladi.
      cell: (f) => (
        <span className={hasAttendanceData(f) ? undefined : 'font-semibold text-warning'} title="Kamera faqat yuzi ro'yxatdan o'tgan talabani taniy oladi">
          {formatPercent(enrolledPct(f))}
        </span>
      ),
    },
    { key: 'on', header: "O'z vaqtida", align: 'right', sortValue: (f) => Math.max(0, f.present - f.late), cell: (f) => formatNumber(Math.max(0, f.present - f.late)) },
    { key: 'late', header: 'Kech keldi', align: 'right', sortValue: (f) => f.late, cell: (f) => formatNumber(f.late) },
    { key: 'absent', header: 'Kelmadi', align: 'right', sortValue: (f) => f.absent, cell: (f) => formatNumber(f.absent) },
    // Bugun — "hali kelmagan"; o'tgan kunda esa u bo'lmaydi (server
    // pending=false), o'rniga yozuvsiz + dam olish kunlari ko'rsatiladi.
    isToday
      ? { key: 'notYet', header: 'Hali kelmagan', align: 'right' as const, sortValue: (f: FacultyCounts) => f.notYet, cell: (f: FacultyCounts) => formatNumber(f.notYet) }
      : {
          key: 'noData',
          header: "Ma'lumot yo'q",
          align: 'right' as const,
          hideOnMobile: true,
          sortValue: (f: FacultyCounts) => f.noData + f.dayOff,
          cell: (f: FacultyCounts) => (
            <span title={f.dayOff > 0 ? `Kamera tanimagan ${f.noData} · dam olish kuni ${f.dayOff}` : 'Kamera tanimagan'}>
              {formatNumber(f.noData + f.dayOff)}
            </span>
          ),
        },
    {
      key: 'rate',
      header: 'Kelganlar ulushi',
      align: 'right',
      width: '9rem',
      sortValue: (f) => (f.total > 0 && hasAttendanceData(f) ? f.rate : null),
      sortFirst: 'asc',
      cell: (f) => (
        <RateCell
          value={f.total > 0 && hasAttendanceData(f) ? f.rate : null}
          digits={1}
          note={f.total === 0 ? "talaba yo'q" : 'yuzlar yetarli emas'}
        />
      ),
    },
  ];

  return (
    <Page
      title="Talabalar"
      subtitle={
        view === 'yuz'
          ? "Kamera talabani tanishi uchun uning yuzi oldindan ro'yxatdan o'tishi kerak. Bu yerda — kim topshirgan, kim yo'q"
          : `Har bir fakultetda ${isToday ? 'bugun' : 'shu kuni'} nechta talaba kelgani · ${formatUzDate(date, { weekday: true })}`
      }
      breadcrumbs={[{ label: 'Talabalar' }]}
      actions={<IconButton icon={RefreshCw} label="Yangilash" variant="secondary" onClick={overview.reload} loading={overview.refreshing} />}
      tabs={data ? views : undefined}
      defaultTab={defaultView}
      tabParam={VIEW_PARAM}
      toolbar={
        !presentation && view === 'davomat' ? (
          <Toolbar>
            <QuickSearch date={date} withDate={withDate} />
          </Toolbar>
        ) : undefined
      }
    >
      {overview.loading ? (
        <>
          <SkeletonTiles count={5} className="xl:grid-cols-5" />
          <SkeletonCards count={4} />
        </>
      ) : overview.error && !data ? (
        <ErrorState variant="block" message={overview.error} onRetry={overview.reload} />
      ) : data && s && view === 'yuz' ? (
        <EnrollmentCampaign today={today} withDate={withDate} />
      ) : data && s ? (
        <div className="flex min-w-0 flex-col gap-3">
          {/* 1. Hujjat blanki — nima, qaysi kun, qancha odam, umumiy hukm. */}
          <DocumentHeader
            org={branding.orgFullName}
            title="Talabalar davomati — fakultetlar kesimi"
            reference={reference}
            generatedAt={generatedAt}
            readouts={[
              { label: 'Qamrov', value: `${faculties.length} ta fakultet` },
              { label: 'Kun', value: formatUzDate(date, { weekday: true }) },
              { label: "Ro'yxatda", value: `${formatNumber(s.total)} talaba` },
              {
                label: 'Umumiy holat',
                value: formatPercent(s.rate, 1),
                title: s.rate === null ? "Bu kunda davomat o'lchanmadi" : undefined,
              },
            ]}
          />

          {!available && (
            <div role="status" className="print-hide flex flex-col gap-3 border border-warning/50 bg-warning-soft px-3 py-2 text-[13px] text-fg sm:flex-row sm:items-center">
              <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />
              <p className="flex-1">
                <span className="font-semibold">Talabalarning atigi {formatPercent(data.studentsEnrolledPct, 1)} qismi yuzini ro&apos;yxatdan o&apos;tkazgan.</span> Kamera
                qolganlarini taniy olmaydi, shuning uchun quyidagi foizlar {formatNumber(data.students.total)} emas, faqat{' '}
                {formatNumber(s.enrolled)} talaba bo&apos;yicha hisoblangan — butun institut holatini aks ettirmaydi.
              </p>
              <Button size="sm" icon={ScanFace} onClick={() => setView('yuz')}>
                Yuz topshirishga o&apos;tish
              </Button>
            </div>
          )}
          {overview.error && <StaleNote message={overview.error} onRetry={overview.reload} />}

          {/* 2. Asosiy ko'rsatkichlar. Faqat BIRINCHI ko'rsatkich foiz —
              qolganlari xom son, ularga svetofor qo'yilmaydi. */}
          <IntelPanel title="Asosiy ko'rsatkichlar" code={reference}>
            <KpiReadout
              className="lg:grid-cols-5"
              items={[
                {
                  label: 'Kelgan talabalar ulushi',
                  value: formatPercent(s.rate, 1),
                  rate: s.rate,
                  hint:
                    // rate null bo'lsa asos ham 0 — "Kutilgan 0 talabadan 0 tasi
                    // keldi" degan ma'nosiz izoh o'rniga sababi yoziladi.
                    s.rate === null
                      ? "Bu kunda birorta talaba kutilmagan — davomat o'lchanmadi"
                      : `Kutilgan ${formatNumber(s.present + s.absent + s.notYet)} talabadan ${formatNumber(s.present)} tasi keldi`,
                },
                // Math.max — CountsLegend bilan bir xil: late > present bo'lib qolsa "-1" chiqmasin.
                { label: "O'z vaqtida keldi", value: formatNumber(Math.max(0, s.present - s.late)), unit: 'talaba' },
                { label: 'Kech keldi', value: formatNumber(s.late), unit: 'talaba' },
                { label: 'Kelmadi', value: formatNumber(s.absent), unit: 'talaba' },
                // O'tgan kunda plitka `noData + dayOff` ni ko'rsatadi: ilgari dam
                // olish kunidagi talabalar hech bir plitkaga tushmay, beshta
                // plitka yig'indisi ro'yxatdagi jami talabaga teng chiqmasdi.
                {
                  label: isToday ? 'Hali kelmagan' : "Ma'lumot yo'q",
                  value: formatNumber(isToday ? s.notYet : s.noData + s.dayOff),
                  unit: 'talaba',
                  hint: isToday
                    ? s.noData
                      ? `Yuzi ro'yxatdan o'tgan, hali ko'rinmagan · yana ${formatNumber(s.noData)} talabaning yuzi ro'yxatda yo'q`
                      : "Yuzi ro'yxatdan o'tgan, bugun hali ko'rinmagan"
                    : s.dayOff > 0
                      ? `Kamera tanimagan ${formatNumber(s.noData)} · dam olish kuni ${formatNumber(s.dayOff)}`
                      : "Kamera tanimagan — odatda yuzi ro'yxatda yo'qligi uchun",
                },
              ]}
            />
          </IntelPanel>

          {faculties.length === 0 ? (
            <EmptyState
              title="Fakultetlar kiritilmagan"
              description="Fakultetlar «Tashkiliy tuzilma» bo'limida qo'shiladi. Shundan keyin bu yerda har biri bo'yicha davomat ko'rinadi."
            />
          ) : (
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-3">
                {/* 3. Holat taxtasi — "qayerda muammo bor?" */}
                <IntelPanel
                  title="Fakultetlar holati"
                  code={`${faculties.length} ta`}
                  right={<MicroLabel>Yomoni birinchi</MicroLabel>}
                >
                  <StatusBoard items={sortedBoard} onOpen={(id) => navigate(withDate(situationPaths.faculty(id === 'none' ? null : id)))} />
                  <RagLegend />
                </IntelPanel>

                {/* 4. Batafsil jadval — "qancha?" */}
                <IntelPanel title="Fakultetlar — batafsil" code={`${faculties.length} qator`}>
                  <DataTable
                    ariaLabel="Fakultetlar"
                    columns={columns}
                    rows={faculties}
                    rowKey={(f) => f.id ?? 'none'}
                    onRowClick={(f) => navigate(withDate(situationPaths.faculty(f.id)))}
                    rowRag={(f) => (f.total > 0 && hasAttendanceData(f) ? rag(f.rate, RATE_RAG) : 'yoq')}
                    dense
                  />
                </IntelPanel>
              </div>

              <LiveArrivals items={arrivals} live={isToday} linkFor={(id) => withDate(situationPaths.person(id))} className="self-start" />
            </div>
          )}

          <DocumentFooter
            note={`Xizmat uchun. Hujjat ${reference} raqami bilan tizimda tuzilgan; sonlar ${formatUzDate(date, { weekday: true })} kuni uchun. Foiz faqat yuzi ro'yxatdan o'tgan talabalar bo'yicha hisoblanadi.`}
          />
        </div>
      ) : null}
    </Page>
  );
}
