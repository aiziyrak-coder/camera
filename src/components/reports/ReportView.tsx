import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { TrendChart } from '../analytics/TrendChart';
import CountTrendChart from './CountTrendChart';
import {
  Avatar,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ProgressBar,
  StatTile,
  cn,
  focusRing,
  toneForRate,
  type DataTableColumn,
} from '../../ui';
import { formatCell, type HisobotPerson, type HisobotReport } from '../../lib/hisobotApi';

interface ReportViewProps {
  data: HisobotReport;
  /** Kesim qatorini bosish (chuqurroq filtr). null — bosilmaydi. */
  onDrill: ((rowId: string) => void) | null;
}

/** Tanlangan mezon: plitkalar -> trend -> kesim -> odamlar (eng yomoni birinchi). */
export default function ReportView({ data, onDrill }: ReportViewProps) {
  const navigate = useNavigate();
  const body = data.report;
  const label = data.criteria.find((c) => c.key === data.criterion)?.label ?? '';
  const points = body.trend.points;
  const hasTrend = points.length > 1 && points.some((p) => p.value !== null && p.value !== 0);

  const columns = useMemo<DataTableColumn<HisobotPerson>[]>(
    () => [
      {
        key: 'rank',
        header: '№',
        width: '3rem',
        align: 'right',
        hideOnMobile: true,
        cell: (_row, index) => <span className="tabular-nums text-subtle">{index + 1}</span>,
      },
      {
        key: 'full_name',
        header: 'F.I.Sh.',
        sortValue: (row) => row.full_name,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={row.full_name} src={row.photo_url} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-fg">{row.full_name}</span>
              <span className="block truncate text-xs text-muted">{row.unit || '—'}</span>
            </span>
          </span>
        ),
      },
      ...body.columns.map<DataTableColumn<HisobotPerson>>((col) => ({
        key: col.key,
        header: col.label,
        align: 'right',
        sortValue: (row) => row.values[col.key] ?? null,
        sortFirst: col.better === 'up' ? 'asc' : 'desc',
        cell: (row) => {
          const value = row.values[col.key];
          const bad = col.unit === '%' ? value !== null && value !== undefined && value < 75 : false;
          return (
            <span className={cn('tabular-nums', col.key === body.sort_key && 'font-semibold', bad && 'text-danger')}>
              {formatCell(value, col.unit === '%' ? '%' : '')}
            </span>
          );
        },
      })),
    ],
    [body.columns, body.sort_key],
  );

  const breakdown = body.breakdown;
  const maxValue = breakdown ? Math.max(1, ...breakdown.rows.map((r) => r.value ?? 0)) : 1;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {body.note && (
        <div className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-fg" role="note">
          <Info size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          {body.note}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {body.tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={typeof tile.value === 'number' ? tile.value.toLocaleString('ru-RU') : tile.value}
            unit={tile.unit || undefined}
            hint={tile.hint ?? undefined}
            tone={tile.tone}
          />
        ))}
      </div>

      {hasTrend && (
        <Card>
          <CardHeader title="Kunlar bo'yicha" subtitle={label} />
          <div className="mt-3">
            {body.trend.unit === '%' ? (
              <TrendChart points={points.map((p) => ({ date: p.date, rate: p.value }))} rateLabel={label} height={240} ariaLabel={`${label} — kunlar bo'yicha`} />
            ) : (
              <CountTrendChart points={points} label={label} />
            )}
          </div>
        </Card>
      )}

      {breakdown && breakdown.rows.length > 1 && (
        <Card>
          <CardHeader title={breakdown.title} subtitle={onDrill ? 'Batafsil ko\'rish uchun qatorni bosing' : undefined} />
          <ul className="mt-3 divide-y divide-border">
            {breakdown.rows.map((row) => {
              const pct = breakdown.unit === '%';
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{row.name}</span>
                    <span className="block truncate text-xs text-muted">
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
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">
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
                      className={cn('flex w-full items-center gap-3 rounded-control px-1 py-2.5 text-left hover:bg-surface-2', focusRing)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-1 py-2.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {body.columns.length > 0 && (
        <Card padding="none">
          <div className="p-4 pb-3">
            <CardHeader
              title="Odamlar"
              subtitle={
                body.people_total > body.people.length
                  ? `Eng muammoli ${body.people.length} tasi (jami ${body.people_total}) — to'liq ro'yxat Excel'da`
                  : `${body.people_total} kishi · eng muammolisi birinchi`
              }
            />
          </div>
          <DataTable
            columns={columns}
            rows={body.people}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/shaxs/${row.id}`)}
            defaultSort={body.sort_key ? { key: body.sort_key, dir: body.worst_desc ? 'desc' : 'asc' } : null}
            maxHeight="36rem"
            dense
            emptyTitle="Bu mezon bo'yicha hech kim yo'q"
            emptyDescription="Tanlangan davr va filtrlarda qayd etilgan holat topilmadi."
            ariaLabel={`${label} — odamlar`}
          />
        </Card>
      )}

      {body.columns.length === 0 && (!breakdown || breakdown.rows.length === 0) && (
        <EmptyState title="Bu davrda signal yo'q" description="Tanlangan davrda bu mezon bo'yicha qayd etilgan holat topilmadi." compact />
      )}
    </div>
  );
}
