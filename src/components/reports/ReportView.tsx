import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { TrendChart } from '../analytics/TrendChart';
import CountTrendChart from './CountTrendChart';
import {
  Avatar,
  CodeText,
  DataTable,
  DocumentFooter,
  DocumentHeader,
  EmptyState,
  IntelPanel,
  ProgressBar,
  StatTile,
  StatusLamp,
  cn,
  focusRing,
  formatUzRange,
  toneForRate,
  type DataTableColumn,
  type IntelStatus,
  type SortState,
} from '../../ui';
import { branding } from '../../lib/branding';
import {
  buildReference,
  formatCell,
  printScopeNote,
  type HisobotPerson,
  type HisobotReport,
} from '../../lib/hisobotApi';

interface ReportViewProps {
  data: HisobotReport;
  /** Kesim qatorini bosish (chuqurroq filtr). null — bosilmaydi. */
  onDrill: ((rowId: string) => void) | null;
  /** Hujjat raqami (sahifa holatidan). Berilmasa — hisobotning o'zidan. */
  reference?: string;
}

/** "Tuzildi:" tamg'asi — qaysi daqiqadagi ma'lumot bosilganini aytadi. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** Hisobot: avval hujjat blanki, keyin gap bilan javob, 4 ta plitka va
 *  ASOSIY jadval; grafik va taqsimot — jadvaldan keyin (ikkinchi
 *  darajali). Ctrl+P bosilganda sahifa toza hujjatga aylanadi
 *  (src/index.css). */
export default function ReportView({ data, onDrill, reference }: ReportViewProps) {
  const navigate = useNavigate();
  const body = data.report;
  const label = data.criteria.find((c) => c.key === data.criterion)?.label ?? '';
  const points = body.trend.points;
  const hasTrend = points.length > 1 && points.some((p) => p.value !== null && p.value !== 0);
  const [sort, setSort] = useState<SortState | null>(
    body.sort_key ? { key: body.sort_key, dir: body.worst_desc ? 'desc' : 'asc' } : null,
  );
  const generatedAt = useMemo(stamp, [data]);
  const period = formatUzRange(data.period.from, data.period.to);
  // Sahifa kod bermasa, hisobotning o'zidan tuziladi — hujjat raqamsiz
  // chiqmasin (qog'ozdagi varaqni faqat shu kod bilan taniymiz).
  const docRef =
    reference ??
    buildReference({
      view: 'tahlil',
      section: data.kind === 'talaba' ? 'talabalar' : 'xodimlar',
      period: `${data.period.from.replace(/-/g, '')}-${data.period.to.replace(/-/g, '')}`,
      parts: [data.criterion, data.scope],
    });

  const status: { tone: IntelStatus; label: string } = body.blocked
    ? { tone: 'alert', label: 'Hisoblanmayapti' }
    : body.note
      ? { tone: 'warn', label: 'Izoh bilan' }
      : { tone: 'ok', label: 'Tayyor' };

  const columns = useMemo<DataTableColumn<HisobotPerson>[]>(
    () => [
      {
        key: 'rank',
        header: '№',
        width: '3rem',
        align: 'right',
        hideOnMobile: true,
        cell: (_row, index) => <span className="intel-code text-subtle">{index + 1}</span>,
      },
      {
        key: 'full_name',
        header: 'F.I.Sh.',
        sortValue: (row) => row.full_name,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={row.full_name} src={row.photo_url} size="sm" className="print-hide" />
            <span className="block min-w-0 truncate font-medium text-fg">{row.full_name}</span>
          </span>
        ),
      },
      {
        key: 'unit',
        header: data.kind === 'talaba' ? 'Guruhi' : "Bo'linmasi",
        sortValue: (row) => row.unit,
        cell: (row) => <span className="block min-w-0 truncate text-muted">{row.unit || '—'}</span>,
      },
      ...body.columns.map<DataTableColumn<HisobotPerson>>((col) => ({
        key: col.key,
        header: col.unit ? `${col.label}, ${col.unit}` : col.label,
        align: col.type === 'text' ? 'left' : 'right',
        sortValue: (row) => row.values[col.key] ?? null,
        sortFirst: col.better === 'up' ? 'asc' : 'desc',
        cell: (row) => {
          const value = row.values[col.key];
          const bad = col.unit === '%' ? typeof value === 'number' && value < 75 : false;
          return (
            <span className={cn(col.type !== 'text' && 'intel-code', col.key === body.sort_key && 'font-semibold', bad && 'text-danger')}>
              {formatCell(value, col.unit === '%' ? '%' : '')}
            </span>
          );
        },
      })),
    ],
    [body.columns, body.sort_key, data.kind],
  );

  // Saralash so'z bilan: "Hozir «Kechikish» ustuni bo'yicha kattadan kichikka".
  const sortSentence = useMemo(() => {
    if (!sort) return body.people_hint;
    const column = columns.find((c) => c.key === sort.key);
    const name = typeof column?.header === 'string' ? column.header : sort.key;
    const dir = sort.dir === 'desc' ? 'kattadan kichikka' : 'kichikdan kattaga';
    return `Hozir «${name}» ustuni bo'yicha ${dir} saralangan. Boshqa ustun nomini bossangiz tartib o'zgaradi.`;
  }, [sort, columns, body.people_hint]);

  const breakdown = body.breakdown;
  // Spread (`Math.max(...rows)`) uzun hisobotda argument limitidan oshib
  // ketardi; reduce xavfsiz va faqat satrlar o'zgarganda hisoblanadi.
  const maxValue = useMemo(
    () => (breakdown ? breakdown.rows.reduce((max, r) => Math.max(max, r.value ?? 0), 1) : 1),
    [breakdown],
  );

  const chart = hasTrend && (
    <IntelPanel title={body.trend.title} code={body.trend.unit === '%' ? '%' : 'TA'} bodyClassName="px-3 py-3">
      <p className="text-[13px] leading-5 text-muted">{body.trend.explain}</p>
      <p className="mt-1 text-[11px] text-subtle">Tik o&apos;q: {body.trend.axis}</p>
      <div className="mt-3">
        {body.trend.unit === '%' ? (
          <TrendChart points={points.map((p) => ({ date: p.date, rate: p.value }))} rateLabel={body.trend.axis} height={240} ariaLabel={body.trend.title} />
        ) : (
          <CountTrendChart points={points} label={body.trend.axis} />
        )}
      </div>
    </IntelPanel>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Qog'ozdagi sarlavha: muassasa, hisobot nomi, tanlov, davr va
          hujjat raqami — qog'ozdagi varaqni ekrandagi ko'rinish bilan
          solishtirish uchun. */}
      <header className="print-only mb-4 border-b border-border pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide">{branding.orgFullName}</p>
        <h2 className="mt-1 text-lg font-semibold">{label}</h2>
        <p className="mt-1 text-sm">
          Tanlov: {data.scope} · Davr: {period} · Ro&apos;yxatda:{' '}
          {data.population.total.toLocaleString('ru-RU')} kishi
        </p>
        <p className="intel-code mt-1 text-xs">
          {docRef} · Tuzildi: {generatedAt}
        </p>
      </header>

      {/* Ekrandagi hujjat blanki. */}
      <DocumentHeader
        className="print-hide"
        org={branding.orgFullName}
        title={label || 'Hisobot'}
        reference={docRef}
        generatedAt={generatedAt}
        readouts={[
          { label: 'Qamrov', value: data.scope, title: data.scope },
          { label: 'Davr', value: period },
          { label: "Ro'yxatda", value: `${data.population.total.toLocaleString('ru-RU')} kishi` },
          { label: 'Holat', value: <StatusLamp status={status.tone} label={status.label} /> },
        ]}
      />

      {/* 1. Javob — gap bilan. */}
      {body.summary.length > 0 && (
        <IntelPanel title="Qisqacha javob" bodyClassName="px-3 py-2.5">
          <p className="text-[15px] leading-6 text-fg">{body.summary[0]}</p>
          {body.summary.slice(1).map((line) => (
            <p key={line} className="mt-1.5 text-[13px] leading-5 text-muted">
              {line}
            </p>
          ))}
        </IntelPanel>
      )}

      {body.note && !body.summary.includes(body.note) && (
        <div className="flex items-start gap-2 border border-warning/50 bg-warning-soft px-3 py-2 text-[13px] text-fg" role="note">
          <Info size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          {body.note}
        </div>
      )}

      {/* 2. Eng ko'pi bilan 4 ta plitka. */}
      {!body.blocked && body.tiles.length > 0 && (
        <IntelPanel title="Asosiy ko'rsatkichlar" code={period} bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {body.tiles.slice(0, 4).map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={typeof tile.value === 'number' ? tile.value.toLocaleString('ru-RU') : tile.value}
                unit={tile.unit || undefined}
                hint={tile.hint ?? undefined}
                tone={tile.tone}
                animate={false}
              />
            ))}
          </div>
        </IntelPanel>
      )}

      {/* 3. ASOSIY jadval. */}
      {body.columns.length > 0 && (
        <IntelPanel
          title={body.people_title}
          code={`${body.people_total.toLocaleString('ru-RU')} qator`}
          bodyClassName="min-w-0"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-[13px] text-muted">
              {body.people_total > body.people.length
                ? `Eng muhim ${body.people.length} tasi ko'rsatilgan (jami ${body.people_total}) — to'liq ro'yxat Excel faylida`
                : `${body.people_total} kishi`}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-subtle print-hide">{sortSentence}</p>
            {/* Qog'ozda: plitkalar qancha odamni qamraganini va jadvalda
                nechta qator borligini hujjatning o'zi aytib turadi. */}
            <p className="print-only print-scope-note mt-1 text-xs">
              {printScopeNote(data.population.total, body.people.length, body.people_total)}
            </p>
          </div>
          <DataTable
            columns={columns}
            rows={body.people}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/shaxs/${row.id}`)}
            sort={sort}
            onSortChange={setSort}
            maxHeight="42rem"
            dense
            emptyTitle={body.empty?.title ?? "Ro'yxat bo'sh"}
            emptyDescription={body.empty?.description ?? "Tanlangan davr va filtrlarda qayd etilgan holat topilmadi."}
            ariaLabel={`${label} — odamlar ro'yxati`}
          />
        </IntelPanel>
      )}

      {body.columns.length === 0 && body.empty && (
        <EmptyState title={body.empty.title} description={body.empty.description} compact />
      )}

      {/* 4. Grafik va taqsimot — jadvaldan keyin. */}
      {chart}

      {breakdown && breakdown.rows.length > 1 && (
        <IntelPanel
          title={breakdown.title}
          code={breakdown.unit === '%' ? '%' : undefined}
          bodyClassName="px-3 py-2.5"
        >
          <p className="text-[12px] leading-4 text-muted">
            {[breakdown.subtitle, onDrill ? "batafsil ko'rish uchun qatorni bosing" : null].filter(Boolean).join(' · ')}
          </p>
          <ul className="mt-2 divide-y divide-border">
            {breakdown.rows.map((row) => {
              const pct = breakdown.unit === '%';
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{row.name}</span>
                    <span className="block truncate text-[11px] text-subtle">
                      {[row.headcount !== null ? `${row.headcount} kishi` : null, row.detail].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="w-28 shrink-0 sm:w-40">
                    <ProgressBar
                      value={pct ? row.value : row.value ?? 0}
                      max={pct ? 100 : maxValue}
                      tone={pct ? (row.value === null ? 'neutral' : toneForRate(row.value)) : 'warning'}
                      size="sm"
                      ariaLabel={row.name}
                    />
                  </span>
                  <span className="intel-code w-16 shrink-0 text-right text-[13px] font-semibold text-fg">
                    {formatCell(row.value, pct ? '%' : '')}
                  </span>
                </>
              );
              return (
                <li key={row.id || row.name}>
                  {onDrill ? (
                    <button
                      type="button"
                      onClick={() => onDrill(row.id)}
                      className={cn('flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface-2', focusRing)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-1 py-2">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </IntelPanel>
      )}

      <DocumentFooter
        className="print-hide"
        note={
          <>
            Xizmat uchun. Hujjat <CodeText>{docRef}</CodeText> raqami bilan tizimda tuzilgan. Ro&apos;yxatdagi F.I.Sh.
            ustiga bosilsa shaxs varaqasi ochiladi.
          </>
        }
      />
    </div>
  );
}
