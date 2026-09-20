import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LayoutGrid, Rows3 } from 'lucide-react';
import {
  Badge,
  cn,
  CodeText,
  DataTable,
  EmptyState,
  ErrorState,
  IntelPanel,
  MicroLabel,
  Skeleton,
  Tabs,
  Toolbar,
  formatPercent,
  formatUzRange,
  rangeForPreset,
  useShell,
  type DataTableColumn,
} from '../../ui';
import { RATE_RAG, rag } from '../../ui/rag';
import { RagLegend, StatusBoard, type BoardItem } from '../hisobot/board';
import { KpiReadout, RateCell, RuledSection, worstFirst } from '../attendance/readout';
import { unitCode, unitKindPrefix } from '../attendance/references';
import { getAnalyticsUnits, getLessons, situationPaths, type KafedraStat, type UnitKind } from '../../lib/situationApi';
import { summarizeKafedras, summarizePunctuality, unitKindLabel } from '../../lib/teachersApi';
import { usePersistedState } from '../../lib/usePersistedState';
import { useUrlChoice } from './analyticsPeriod';
import { DeltaBadge } from '../analytics';
import { TeacherSearch } from './TeacherSearch';
import { useLoader, type Loader } from './useLoader';

/** Saqlangan eski qiymat `'cards'` ham shu yerga tushadi — taxta. */
type View = 'board' | 'table';
type KindFilter = 'kafedra' | 'dekanat' | 'bolim' | 'lavozim' | 'all';
const KIND_FILTER_IDS: readonly KindFilter[] = ['all', 'kafedra', 'dekanat', 'bolim', 'lavozim'];

const REFRESH_MS = 60_000;
const LESSON_PAGE_SIZE = 500;

/** "Bo'linmalar" tabi: tur bo'yicha filtr, holat taxtasi / zich jadval, 7 kunlik trend. */
export function UnitsTab({ loader, date, isToday, withDate }: { loader: Loader<KafedraStat[]>; date: string; isToday: boolean; withDate: (path: string) => string }) {
  const { presentation } = useShell();
  const navigate = useNavigate();
  const [view, setView] = usePersistedState<View>('oqituvchilar.view', 'board');
  // Bo'linma turi URL'da (`?tur=`), localStorage'da emas: ilgari havolani
  // ulashgan odam "Kafedralar" ni ko'rib turardi, qabul qiluvchi esa o'z
  // brauzeridagi eski tanlovni — ikkalasi boshqa ro'yxat ko'rardi.
  // AnalyticsTab o'z filtri uchun `?turi=` dan foydalanadi, shuning uchun
  // nom boshqa: tab almashganda tanlovlar bir-birini buzmaydi.
  const [kind, setKind] = useUrlChoice<KindFilter>('tur', KIND_FILTER_IDS, 'all');
  // Bo'linmalar ro'yxatidagi `lessonsToday` — darslar bor-yo'qligining
  // tekin manbasi. Jadval kiritilmagan kunda 500 ta darsni so'ramaymiz;
  // jadval paydo bo'lishi bilan so'rov o'zi qayta tiklanadi.
  const scheduledLessons = useMemo(() => (loader.data ?? []).reduce((sum, u) => sum + u.lessonsToday, 0), [loader.data]);
  const lessons = useLoader(
    scheduledLessons > 0 ? `l:${date}` : null,
    (signal) => getLessons({ date, pageSize: LESSON_PAGE_SIZE }, { signal }),
    { refreshMs: isToday ? REFRESH_MS : undefined },
  );
  // Trend: tanlangan kungacha 7 kun vs undan oldingi 7 kun.
  const week = useMemo(() => rangeForPreset('last7', date), [date]);
  const trends = useLoader(`tr:${week.from}:${week.to}`, (signal) => getAnalyticsUnits({ from: week.from, to: week.to, kind: 'all' }, { signal }));
  const trendById = useMemo(() => new Map((trends.data ?? []).map((u) => [u.id, u.trend])), [trends.data]);
  // O'tgan kunni ko'rayotganda "oxirgi 7 kun" yolg'on bo'lardi — haqiqiy oraliq yoziladi.
  // Trend so'rovi yiqilganda har bir qator "—" ko'rsatardi va bu "ma'lumot
  // yo'q" dan farq qilmasdi — sabab endi tooltipda aytiladi.
  const trendFailed = Boolean(trends.error && !trends.data);
  const trendHint = trendFailed
    ? "O'zgarishni hisoblab bo'lmadi — trend so'rovi yiqildi"
    : `${formatUzRange(week.from, week.to)} davomati undan oldingi 7 kunga nisbatan`;

  const all = useMemo(() => loader.data ?? [], [loader.data]);
  const counts = useMemo(() => {
    const c: Record<UnitKind, number> = { kafedra: 0, dekanat: 0, bolim: 0, lavozim: 0 };
    for (const u of all) c[u.kind] = (c[u.kind] ?? 0) + 1;
    return c;
  }, [all]);
  // Xizmat kodi TURDAN va serverdan kelgan tartibdan chiqadi: KAF-03 filtr
  // almashganda ham, saralashdan keyin ham o'sha bo'linma bo'lib qoladi.
  const codes = useMemo(() => {
    const seen: Record<string, number> = {};
    const map = new Map<string, string>();
    for (const u of all) {
      const prefix = unitKindPrefix(u.kind);
      const index = seen[prefix] ?? 0;
      seen[prefix] = index + 1;
      map.set(u.id, unitCode(prefix, index));
    }
    return map;
  }, [all]);
  const rows = useMemo(() => (kind === 'all' ? all : all.filter((u) => u.kind === kind)), [all, kind]);
  const summary = useMemo(() => summarizeKafedras(rows), [rows]);
  const punctuality = useMemo(() => (lessons.data ? summarizePunctuality(lessons.data.items) : null), [lessons.data]);
  // Bir sahifada 500 ta dars keladi: undan ko'p bo'lsa foiz kunning
  // HAMMASIDAN emas, birinchi sahifadan chiqadi — buni aytib qo'yamiz.
  const lessonsCapped = Boolean(lessons.data && lessons.data.total > lessons.data.items.length);
  // Dars ko'rsatkichlari ko'rsatilayotgan bo'linmalarga bog'liq: filtr ostidagi
  // bo'linmalarda dars bo'lmasa ular chizilmaydi.
  const hasLessons = summary.lessons > 0;
  // Foiz AYNAN taxtadagi foiz bilan bir xil formulada: present /
  // (present + absent + notYet). Jami xodimga bo'lish yuzi ro'yxatdan
  // o'tmagan ~80 xodimni "kelmagan" qilib ko'rsatardi.
  const staffRate = summary.rate;
  const effectiveView: View = presentation || view !== 'table' ? 'board' : 'table';

  /** Bo'linma → taxta katagi. Ikkinchi qatorda foizning MAXRAJI ham,
   *  hali kelmaganlar ham yoziladi: uch raqam qo'shilib maxrajga teng
   *  chiqmasa odam sababini topolmasdi. */
  const board = useMemo<BoardItem[]>(
    () =>
      rows.map((k) => {
        const decided = k.present + k.absent + k.notYet;
        return {
          id: k.id,
          code: codes.get(k.id) ?? 'BOL-00',
          name: k.name,
          value: decided > 0 ? k.rate : null,
          unit: '%',
          detail: [
            unitKindLabel(k),
            decided > 0 ? `${k.present} / ${decided} keldi` : "Holati aniqlangan xodim yo'q",
            k.late > 0 ? `${k.late} kech` : null,
            k.absent > 0 ? `${k.absent} kelmadi` : null,
            k.notYet > 0 ? `${k.notYet} hali kelmagan` : null,
            k.noData > 0 ? `${k.noData} yuzi ro'yxatda yo'q` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          headcount: k.staffTotal,
        };
      }),
    [rows, codes],
  );
  const sortedBoard = useMemo(() => worstFirst(board), [board]);

  const columns: DataTableColumn<KafedraStat>[] = [
    {
      key: 'code',
      header: 'Kod',
      width: '5.5rem',
      mono: true,
      sortValue: (k) => codes.get(k.id) ?? '',
      cell: (k) => <CodeText className="text-[12px] text-subtle">{codes.get(k.id)}</CodeText>,
    },
    {
      key: 'name',
      header: "Bo'linma",
      sortValue: (k) => `${k.unassigned ? 1 : 0}${k.name}`,
      cell: (k) => (
        <div className="min-w-0">
          {/* Bo'linma nomlari uzun ("Patologik fiziologiya va patologik
              anatomiya") — kesiladi, to'lig'i tooltipda. */}
          <p className={cn('truncate text-[13px] font-medium', k.unassigned ? 'text-muted' : 'text-fg')} title={k.name}>
            {k.name}
          </p>
          <p className="intel-micro truncate">{unitKindLabel(k)}</p>
        </div>
      ),
    },
    { key: 'staffTotal', header: 'Jami xodim', align: 'right', sortValue: (k) => k.staffTotal, sortFirst: 'desc' },
    {
      key: 'decided',
      // O'tgan kunni ko'rayotganda "Bugun" yolg'on sarlavha edi.
      header: isToday ? 'Bugun keldi' : 'Shu kuni keldi',
      align: 'right',
      width: '8rem',
      sortValue: (k) => k.present,
      sortFirst: 'desc',
      // Maxraj AYNAN foiz maxraji: "10 / 20" yonida 83% turishi mumkin emas.
      cell: (k) => (
        <CodeText className="text-[13px]">
          {k.present} <span className="text-subtle">/ {k.present + k.absent + k.notYet}</span>
        </CodeText>
      ),
    },
    { key: 'late', header: 'Kech keldi', align: 'right', sortValue: (k) => k.late, sortFirst: 'desc' },
    { key: 'absent', header: 'Kelmadi', align: 'right', sortValue: (k) => k.absent, sortFirst: 'desc' },
    {
      key: 'notYet',
      header: 'Hali kelmagan',
      align: 'right',
      hideOnMobile: true,
      sortValue: (k) => k.notYet,
      sortFirst: 'desc',
    },
    {
      key: 'rate',
      header: isToday ? 'Bugun ishga kelgani' : 'Shu kuni ishga kelgani',
      align: 'right',
      width: '9rem',
      sortValue: (k) => k.rate,
      sortFirst: 'asc',
      cell: (k) => <RateCell value={k.present + k.absent + k.notYet > 0 ? k.rate : null} note="holati aniq xodim yo'q" />,
    },
    {
      key: 'trend',
      header: "O'zgarish",
      align: 'right',
      hideOnMobile: true,
      sortValue: (k) => trendById.get(k.id) ?? null,
      cell: (k) => (
        <DeltaBadge value={trendById.get(k.id)} unit="pp" emptyLabel={trendFailed ? 'xato' : '—'} title={trendHint} />
      ),
    },
    { key: 'lessonsToday', header: isToday ? 'Bugungi darslar' : 'Shu kungi darslar', align: 'right', hideOnMobile: true, sortValue: (k) => k.lessonsToday, sortFirst: 'desc' },
    {
      key: 'lessonIssues',
      header: "O'qituvchi kech kirgan / kirmagan",
      align: 'right',
      hideOnMobile: true,
      sortValue: (k) => k.teacherLateLessons + k.teacherMissedLessons,
      sortFirst: 'desc',
      cell: (k) =>
        k.teacherLateLessons + k.teacherMissedLessons === 0 ? (
          <span className="text-subtle">0</span>
        ) : (
          <span className="inline-flex gap-1">
            {k.teacherLateLessons > 0 && <Badge tone="warning">{k.teacherLateLessons} kech</Badge>}
            {k.teacherMissedLessons > 0 && <Badge tone="danger">{k.teacherMissedLessons} yo'q</Badge>}
          </span>
        ),
    },
  ];

  const kindTabs = [
    { id: 'all' as const, label: 'Hammasi', count: all.length || null },
    { id: 'kafedra' as const, label: 'Kafedralar', count: counts.kafedra || null },
    { id: 'dekanat' as const, label: 'Dekanatlar', count: counts.dekanat || null },
    { id: 'bolim' as const, label: "Bo'limlar", count: counts.bolim || null },
    // Lavozimi bor, lekin bo'linmasi yozilmagan xodimlar (productionda 139 ta).
    // Bu tab bo'lmasa kafedra + dekanat + bo'lim "Hammasi" ga teng chiqmaydi
    // va o'sha odamlar faqat "Hammasi" da ko'rinib, ko'zdan qochadi.
    { id: 'lavozim' as const, label: "Bo'linmasi yozilmagan", count: counts.lavozim || null },
  ];

  return (
    <>
      <Toolbar
        end={
          !presentation && (
            <Tabs
              variant="segmented"
              size="sm"
              value={effectiveView}
              onChange={setView}
              ariaLabel="Ko'rinish"
              tabs={[
                { id: 'board' as const, label: 'Taxta', icon: LayoutGrid },
                { id: 'table' as const, label: 'Jadval', icon: Rows3 },
              ]}
            />
          )
        }
      >
        <Tabs variant="segmented" size="sm" value={kind} onChange={setKind} ariaLabel="Bo'linma turi" tabs={kindTabs} />
        <TeacherSearch />
      </Toolbar>

      <IntelPanel
        title="Asosiy ko'rsatkichlar"
        code={`${rows.length} bo'linma`}
        right={<MicroLabel>{isToday ? 'Bugun' : formatUzRange(date, date)}</MicroLabel>}
      >
        <KpiReadout
          className={hasLessons ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}
          items={[
            {
              label: 'Xodimlar keldi',
              value: loader.loading ? '…' : summary.present,
              // Maxraj AYNAN foiz maxraji (holati aniqlangan xodimlar). Ilgari
              // bu yerda jami xodim turardi: "10 / 20" yozilib, yonidagi
              // foiz 83,3% (10 / 12) ni ko'rsatardi — ikki xil maxraj.
              unit: `/ ${summary.decided}`,
              rate: staffRate,
              hint:
                staffRate === null
                  ? undefined
                  : `Holati aniq ${summary.decided} xodimdan ${formatPercent(staffRate)} keldi${
                      summary.noData ? ` · yana ${summary.noData} xodimning yuzi ro'yxatdan o'tmagan — foizga kirmaydi` : ''
                    }`,
            },
            {
              label: 'Kech kelgan xodimlar',
              value: loader.loading ? '…' : summary.late,
              unit: 'kishi',
              hint: `Bundan tashqari ${summary.absent} kishi umuman kelmagan`,
            },
            ...(hasLessons
              ? [
                  {
                    label: "Darsga o'z vaqtida kirgan",
                    value: formatPercent(punctuality?.rate),
                    rate: punctuality?.rate ?? null,
                    hint: punctuality
                      ? `Tekshirilgan ${punctuality.onTime + punctuality.late + punctuality.missed} darsdan ${punctuality.onTime} tasiga o'qituvchi o'z vaqtida kirgan${
                          kind === 'all' ? '' : ' · barcha bo‘linmalar bo‘yicha'
                        }${lessonsCapped ? ` · bu kunda ${lessons.data?.total} dars bor, foiz birinchi ${LESSON_PAGE_SIZE} tasidan hisoblangan` : ''}`
                      : undefined,
                  },
                  {
                    label: "Kech kirgan yoki kirilmagan darslar",
                    value: summary.lateLessons + summary.missedLessons,
                    unit: 'dars',
                    hint: `${isToday ? 'Bugungi' : 'Shu kungi'} ${summary.lessons} darsdan: ${summary.lateLessons} tasiga kech kirgan · ${summary.missedLessons} tasiga umuman kirmagan`,
                  },
                ]
              : []),
          ]}
        />
      </IntelPanel>

      {loader.error && !loader.data ? (
        <ErrorState variant="block" message={loader.error} onRetry={loader.reload} />
      ) : loader.loading ? (
        <div className="flex flex-col gap-px bg-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-none" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={kind === 'all' ? "Bo'linmalar yo'q" : `${kindTabs.find((t) => t.id === kind)?.label} topilmadi`}
          description="Bo'linmalar ro'yxati alohida kiritilmaydi — u xodimlar reestridagi lavozim va bo'lim yozuvlaridan avtomatik yig'iladi."
        />
      ) : effectiveView === 'board' ? (
        <IntelPanel
          title="Bo'linmalar holati"
          code={`${rows.length} ta`}
          right={<MicroLabel>Yomoni birinchi</MicroLabel>}
          bodyClassName="flex flex-col"
        >
          <RuledSection title={kindTabs.find((t) => t.id === kind)?.label ?? 'Hammasi'} code={`${rows.length} ta`}>
            <StatusBoard items={sortedBoard} onOpen={(id) => navigate(withDate(situationPaths.kafedra(id)))} />
          </RuledSection>
          <RagLegend />
        </IntelPanel>
      ) : (
        <IntelPanel title="Bo'linmalar — batafsil" code={`${rows.length} qator`}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(k) => k.id}
            onRowClick={(k) => navigate(withDate(situationPaths.kafedra(k.id)))}
            rowRag={(k) => (k.present + k.absent + k.notYet > 0 ? rag(k.rate, RATE_RAG) : 'yoq')}
            ariaLabel="Bo'linmalar"
            dense
          />
        </IntelPanel>
      )}
    </>
  );
}
