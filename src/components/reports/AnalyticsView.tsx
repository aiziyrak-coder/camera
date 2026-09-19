import { forwardRef, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Info, ShieldAlert, Users } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValue,
  ProgressBar,
  SkeletonCard,
  SkeletonTiles,
  StatTile,
  TONE_SOFT,
  cn,
  focusRing,
  formatNumber,
  formatPercent,
  useChartTheme,
  type Tone,
} from '../../ui';
import { legacyRedirect } from '../../layouts/legacyRoutes';
import type { AttendancePopulation, ReportAnalytics, ReportInsight } from '../../types';

/** "Tahlil" tabi — /api/reports/analytics: xulosalar, KPI (oldingi davr
 *  bilan), davomat, xavfsizlik va darslar. Grafiklar `data-pdf-chart`
 *  bilan belgilangan — PDF hisobot aynan shu grafiklarni rasm qilib oladi
 *  (lib/reportPdf.ts). */

const INSIGHT_META: Record<ReportInsight['level'], { tone: Tone; icon: typeof Info; label: string }> = {
  critical: { tone: 'danger', icon: AlertOctagon, label: 'Shoshilinch' },
  warning: { tone: 'warning', icon: AlertTriangle, label: 'Diqqat' },
  info: { tone: 'info', icon: Info, label: "Ma'lumot" },
  ok: { tone: 'success', icon: CheckCircle2, label: 'Yaxshi' },
};

/** Backend eski /admin/... havola bersa ham yangi manzilga olib boradi. */
function insightHref(href: string): string {
  if (!href.startsWith('/admin')) return href;
  const url = new URL(href, 'http://local');
  return legacyRedirect(url.pathname, url.search, url.hash);
}

function ChartBox({ pdfKey, height = 220, label, children }: { pdfKey: string; height?: number; label: string; children: ReactNode }) {
  return (
    <div data-pdf-chart={pdfKey} className="-ml-2 w-[calc(100%+0.5rem)]" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function PopulationCard({ population, pdfKey }: { population: AttendancePopulation; pdfKey: string }) {
  const theme = useChartTheme();
  const hasData = population.records > 0;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={`Davomat — ${population.label}`}
        icon={Users}
        subtitle={`${formatNumber(population.enrolled)} / ${formatNumber(population.population)} yuzi tasdiqlangan · ${formatNumber(population.records)} kun-yozuv`}
      />
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-control bg-surface-2 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-fg">{formatPercent(population.rate, 1)}</p>
          <p className="text-[11px] text-muted">davomat</p>
        </div>
        <div className="rounded-control bg-surface-2 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-warning">{formatPercent(population.lateShare, 1)}</p>
          <p className="text-[11px] text-muted">kechikish ulushi</p>
        </div>
        <div className="rounded-control bg-surface-2 px-2 py-2">
          <p className="text-lg font-semibold tabular-nums text-fg">{population.avgArrival ?? '—'}</p>
          <p className="text-[11px] text-muted">o&apos;rtacha kelish</p>
        </div>
      </div>
      {hasData ? (
        <ChartBox pdfKey={pdfKey} label={`${population.label}: kunlar bo'yicha davomat`}>
          <BarChart data={population.byDay} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} />
            <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
            <Tooltip {...theme.tooltip} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
            <Bar dataKey="keldi" name="Keldi" stackId="a" fill={theme.attendance.keldi} maxBarSize={32} />
            <Bar dataKey="kechKeldi" name="Kech keldi" stackId="a" fill={theme.attendance.kechKeldi} maxBarSize={32} />
            <Bar dataKey="kelmadi" name="Kelmadi" stackId="a" fill={theme.attendance.kelmadi} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ChartBox>
      ) : (
        <EmptyState compact bordered={false} title="Bu davrda davomat yozuvi yo'q" />
      )}
      {!population.reliability.reliable && population.reliability.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-control bg-warning-soft px-3 py-2 text-xs text-fg">
          {population.reliability.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}
      {population.byFaculty.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-muted">Fakultetlar kesimida</p>
          <ul className="space-y-2">
            {population.byFaculty.map((row) => (
              <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-3 text-[13px]">
                <span className="truncate text-fg" title={row.name}>
                  {row.name}
                </span>
                <ProgressBar value={row.rate} size="sm" ariaLabel={`${row.name} davomati`} />
                <span className="text-right font-medium tabular-nums text-fg">{formatPercent(row.rate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const AnalyticsView = forwardRef<HTMLDivElement, { data: ReportAnalytics | null; loading: boolean; error: string | null; onRetry: () => void }>(
  function AnalyticsView({ data, loading, error, onRetry }, ref) {
    const theme = useChartTheme();

    if (error && !data) return <ErrorState variant="block" message={error} onRetry={onRetry} className="rounded-card border border-border bg-surface" />;
    if (!data) {
      return (
        <div className="space-y-5" aria-busy={loading}>
          <SkeletonTiles count={6} className="xl:grid-cols-3" />
          <div className="grid gap-5 xl:grid-cols-2">
            <SkeletonCard lines={8} />
            <SkeletonCard lines={8} />
          </div>
        </div>
      );
    }

    const { security, lessons } = data;
    const staffHistogram = data.attendance.staff.arrivalHistogram;

    return (
      <div ref={ref} className={cn('flex flex-col gap-5 transition-opacity', loading && 'opacity-60')}>
        {data.insights.length > 0 && (
          <Card>
            <CardHeader title="Qisqa xulosa" subtitle={`${data.period.label} · oldingi davr: ${data.previousPeriod.label}`} />
            <ul className="grid gap-2.5 lg:grid-cols-2">
              {data.insights.map((insight, index) => {
                const meta = INSIGHT_META[insight.level];
                const Icon = meta.icon;
                return (
                  <li key={`${insight.title}-${index}`} className="flex gap-3 rounded-control border border-border p-3">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-control', TONE_SOFT[meta.tone])}>
                      <Icon size={16} aria-label={meta.label} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{insight.title}</p>
                      <p className="mt-0.5 text-[13px] leading-5 text-muted">{insight.text}</p>
                      {insight.actionHref && insight.actionLabel && (
                        <Link
                          to={insightHref(insight.actionHref)}
                          className={cn('mt-1.5 inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary hover:underline', focusRing)}
                        >
                          {insight.actionLabel}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.kpis.map((kpi) => (
            <StatTile
              key={kpi.key}
              label={kpi.label}
              value={kpi.display}
              unit={kpi.unit && !kpi.display.endsWith(kpi.unit) ? kpi.unit : undefined}
              delta={kpi.delta !== null ? { value: kpi.delta, display: kpi.deltaDisplay ?? undefined, better: kpi.better } : null}
              hint={kpi.note ?? (kpi.previousDisplay ? `oldingi davr: ${kpi.previousDisplay}` : undefined)}
            />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <PopulationCard population={data.attendance.staff} pdfKey="attendance-staff" />
          <PopulationCard population={data.attendance.students} pdfKey="attendance-students" />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader title="Xodimlarning kelish vaqti" subtitle="15 daqiqalik oraliqlar bo'yicha" icon={Users} />
            {staffHistogram.some((bin) => bin.count > 0) ? (
              <ChartBox pdfKey="attendance-arrival" label="Xodimlarning kelish vaqti taqsimoti">
                <BarChart data={staffHistogram} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} />
                  <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip {...theme.tooltip} formatter={(value) => [formatNumber(Number(value)), 'Xodim']} />
                  <Bar dataKey="count" fill={theme.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartBox>
            ) : (
              <EmptyState compact bordered={false} title="Kelish vaqtlari qayd etilmagan" />
            )}
          </Card>

          <Card className="min-w-0">
            <CardHeader title="Xavfsizlik signallari" subtitle={`${formatNumber(security.total)} ta signal · ${formatNumber(security.serious)} ta jiddiy`} icon={ShieldAlert} />
            {security.total > 0 ? (
              <ChartBox pdfKey="security-days" label="Kunlar bo'yicha signallar">
                <BarChart data={security.byDay} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} />
                  <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip {...theme.tooltip} formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                  <Bar dataKey="past" name="Past" stackId="s" fill={theme.severity.past} maxBarSize={32} />
                  <Bar dataKey="orta" name="O'rta" stackId="s" fill={theme.severity.orta} maxBarSize={32} />
                  <Bar dataKey="yuqori" name="Yuqori" stackId="s" fill={theme.severity.yuqori} radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ChartBox>
            ) : (
              <EmptyState compact bordered={false} title="Bu davrda signal yo'q" />
            )}
            <KeyValue
              className="mt-4"
              layout="stacked"
              columns={4}
              items={[
                { label: 'Tasdiqlangan', value: formatNumber(security.confirmed) },
                { label: 'Rad etilgan', value: formatNumber(security.rejected) },
                { label: "Ko'rilmagan", value: formatNumber(security.unreviewed) },
                { label: 'Aniqlik', value: formatPercent(security.precision) },
              ]}
            />
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader
            title="Darslar"
            subtitle={`${formatNumber(lessons.sessions)} ta dars · ${formatNumber(lessons.analyzedSessions)} tasi tahlil qilingan`}
            icon={BookOpen}
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {lessons.byDay.some((day) => day.attention !== null) ? (
              <ChartBox pdfKey="lessons-attention" label="Darslardagi o'rtacha diqqat">
                <LineChart data={lessons.byDay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="label" tick={theme.axisTick} tickLine={false} axisLine={{ stroke: theme.grid }} />
                  <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} domain={[0, 100]} width={36} />
                  <Tooltip {...theme.tooltip} formatter={(value) => [formatPercent(Number(value), 1), 'Diqqat']} />
                  <Line type="monotone" dataKey="attention" stroke={theme.primary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ChartBox>
            ) : (
              <EmptyState compact bordered={false} title="Diqqat o'lchanmagan" description="Dars kameralarida AI tahlil yoqilganda grafik to'ladi." />
            )}
            <KeyValue
              items={[
                { label: "O'rtacha diqqat", value: formatPercent(lessons.avgAttention, 1) },
                { label: "O'qituvchi faolligi", value: formatPercent(lessons.avgTeacherActivity, 1) },
                { label: "O'qituvchi o'z vaqtida", value: formatPercent(lessons.teacherOnTimeRate, 1), hint: `${formatNumber(lessons.checkedSessions)} ta dars tekshirilgan` },
                { label: 'Uxlash holatlari', value: formatNumber(lessons.sleepIncidents) },
              ]}
            />
          </div>
        </Card>
      </div>
    );
  },
);

export default AnalyticsView;
