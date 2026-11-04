import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, CodeText, EmptyState, ErrorState, IntelPanel, Select, SkeletonTable, TONE_SOFT, TONE_TEXT, cn, focusRing } from '../../ui';
import { RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { useApiResource } from '../../lib/useApiResource';
import type { HisobotState } from '../../lib/hisobotApi';
import {
  CELL_META,
  FILTER_LABELS,
  SORT_LABELS,
  cellTitle,
  isDayCell,
  lessonGridPath,
  type LessonCellStatus,
  type LessonGrid as LessonGridData,
  type LessonGridFilter,
  type LessonGridSort,
  type LessonGridRow,
} from '../../lib/lessonGridApi';
import PersonReportDrawer from './PersonReportDrawer';

/**
 * Darslar bo'yicha davomat jadvali — hisobotning pastki qismi.
 *
 * Har qator — bitta odam, har ustun — juftlik (bitta kun) yoki kun.
 * Katakda belgi: ✓ keldi, K kech keldi, ✗ kelmadi, — o'lchanmadi.
 * Tepadagi "aqlli filtr" tugmalari sonlari bilan: bosilsa faqat o'sha
 * holatdagilar qoladi. Ism bosilsa — odamning barcha kunlardagi hisoboti.
 */

const PAGE_SIZE = 50;
const FILTER_ORDER: LessonGridFilter[] = ['hammasi', 'kelmadi', 'kech_keldi', 'toliq', 'olchanmadi'];
const FILTER_TONE: Record<LessonGridFilter, string> = {
  hammasi: 'text-fg',
  kelmadi: TONE_TEXT.danger,
  kech_keldi: TONE_TEXT.warning,
  toliq: TONE_TEXT.success,
  olchanmadi: TONE_TEXT.neutral,
};
const LEGEND: LessonCellStatus[] = ['keldi', 'kech_keldi', 'kelmadi', 'olchanmadi', 'kutilmoqda'];

export default function LessonGrid({ state }: { state: HisobotState }) {
  const staff = state.section === 'xodimlar';
  const [status, setStatus] = useState<LessonGridFilter>('hammasi');
  const [sort, setSort] = useState<LessonGridSort>('guruh');
  const [page, setPage] = useState(1);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);

  // Yuqoridagi filtr (davr, fakultet, guruh, ism) o'zgarsa — birinchi sahifa.
  const filterKey = [state.section, state.from, state.to, state.faculty, state.course, state.group,
    state.unitKind, state.unit, state.q].join('|');
  useEffect(() => setPage(1), [filterKey, status, sort]);

  const resource = useApiResource<LessonGridData>(lessonGridPath(state, { status, sort, page, pageSize: PAGE_SIZE }));
  const data = resource.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <IntelPanel
      title={staff ? "O'qituvchilar: darslarga kelishi" : "Darslar bo'yicha davomat"}
      code={data ? `${data.total.toLocaleString('ru-RU')} kishi` : undefined}
    >
      <div className="flex flex-col gap-3">
        {/* Aqlli filtr: holat tugmalari (sonlari bilan) va tartib. */}
        <div className="print-hide flex flex-wrap items-center gap-2" role="group" aria-label="Holat bo'yicha filtr">
          {FILTER_ORDER.map((key) => {
            const active = status === key;
            const count = data?.counts[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 border px-2.5 py-1 text-[13px]',
                  focusRing,
                  active ? 'border-primary bg-primary-soft text-fg' : 'border-border bg-surface text-muted hover:text-fg',
                )}
              >
                <span>{staff && key === 'toliq' ? "Hammasiga vaqtida" : FILTER_LABELS[key]}</span>
                {count !== undefined && (
                  <CodeText className={cn('text-[12px] font-semibold', FILTER_TONE[key])}>{count}</CodeText>
                )}
              </button>
            );
          })}
          <Select
            value={sort}
            onChange={(value) => setSort(value as LessonGridSort)}
            options={(Object.keys(SORT_LABELS) as LessonGridSort[]).map((key) => ({ value: key, label: SORT_LABELS[key] }))}
            ariaLabel="Tartib"
            size="sm"
            className="sm:ms-auto sm:w-56"
          />
        </div>

        {data && <Summary data={data} staff={staff} />}

        {resource.error && !data ? (
          <ErrorState title="Jadvalni yuklab bo'lmadi" message={resource.error} onRetry={resource.reload} />
        ) : !data ? (
          <SkeletonTable />
        ) : data.rows.length === 0 ? (
          <EmptyState
            title={data.total === 0 && status === 'hammasi' ? "Bu davrda dars topilmadi" : "Tanlovga mos odam yo'q"}
            description={
              status === 'hammasi'
                ? "Davr yoki filtrni o'zgartirib ko'ring. Dars jadvali HEMIS'dan har kuni yangilanadi."
                : "Boshqa holatni tanlang yoki \"Hammasi\" ni bosing."
            }
          />
        ) : (
          <div className={cn(resource.loading && 'opacity-70 transition-opacity')}>
            <Table data={data} staff={staff} onOpen={(row) => setPerson({ id: row.id, name: row.full_name })} />
            <div className="print-hide mt-2 flex flex-wrap items-center gap-3">
              <Legend />
              {pages > 1 && (
                <span className="ms-auto flex items-center gap-2 text-[13px] text-muted">
                  <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Oldingi sahifa" />
                  <span>
                    {page} / {pages}
                  </span>
                  <Button variant="secondary" size="sm" icon={ChevronRight} disabled={page >= pages}
                          onClick={() => setPage((p) => Math.min(pages, p + 1))} aria-label="Keyingi sahifa" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      <PersonReportDrawer
        person={person}
        onClose={() => setPerson(null)}
        defaultTo={state.to}
      />
    </IntelPanel>
  );
}

function Summary({ data, staff }: { data: LessonGridData; staff: boolean }) {
  const t = data.totals;
  const tone = rag(t.rate, RATE_RAG);
  return (
    <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-muted">
      <span>
        Darslar: <CodeText className="font-semibold text-fg">{t.lessons}</CodeText>
      </span>
      <span>
        {staff ? 'Vaqtida yoki kechikib keldi' : 'Qatnashdi'}:{' '}
        <CodeText className="font-semibold text-success">{t.attended}</CodeText>
      </span>
      <span>
        Kech keldi: <CodeText className="font-semibold text-warning">{t.late}</CodeText>
      </span>
      <span>
        {staff ? 'Kelmadi' : 'Qoldirdi'}: <CodeText className="font-semibold text-danger">{t.absent}</CodeText>
      </span>
      <span title="Dars kamera ko'rmaydigan xonada bo'lgan yoki tahlil hali yetib kelmagan">
        O&apos;lchanmadi: <CodeText className="font-semibold">{t.unmeasured}</CodeText>
      </span>
      {t.rate !== null && (
        <span>
          Davomat (o&apos;lchangan darslardan):{' '}
          <CodeText className={cn('font-semibold', RAG_TEXT[tone])}>{t.rate}%</CodeText>
        </span>
      )}
      {data.without_lessons > 0 && (
        <span className="text-subtle">Bu davrda darsi yo&apos;q: {data.without_lessons} kishi</span>
      )}
    </p>
  );
}

function Table({ data, staff, onOpen }: { data: LessonGridData; staff: boolean; onOpen: (row: LessonGridRow) => void }) {
  return (
    <div className="max-w-full overflow-x-auto border border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[12px] text-muted">
            <th scope="col" className="sticky left-0 z-10 min-w-[220px] border-b border-border bg-surface-2 px-3 py-2 font-medium">
              F.I.Sh.
            </th>
            {data.columns.map((col) => (
              <th key={col.key} scope="col" className="border-b border-l border-border px-2 py-2 text-center font-medium">
                <span className="block whitespace-nowrap text-fg">{col.label}</span>
                {col.sub && <span className="block text-[11px] text-subtle">{col.sub}</span>}
              </th>
            ))}
            <th scope="col" className="border-b border-l border-border px-2 py-2 text-right font-medium" title="Qatnashgan / jami darslar">
              Jami
            </th>
            <th scope="col" className="border-b border-l border-border px-2 py-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const tone = rag(row.totals.rate, RATE_RAG);
            return (
              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className={cn('block max-w-[260px] truncate text-left font-medium text-primary hover:underline', focusRing)}
                    title="Barcha kunlardagi hisobotini ko'rish"
                  >
                    {row.full_name}
                  </button>
                  <span className="block max-w-[260px] truncate text-[11px] text-muted">{row.unit}</span>
                </th>
                {data.columns.map((col) => {
                  const cell = row.cells[col.key];
                  if (!cell) {
                    return (
                      <td key={col.key} className="border-l border-border px-2 py-1.5 text-center text-subtle" title="Darsi yo'q">
                        ·
                      </td>
                    );
                  }
                  const meta = CELL_META[cell.status];
                  return (
                    <td key={col.key} className="border-l border-border px-1 py-1 text-center" title={cellTitle(cell, staff)}>
                      <span
                        className={cn(
                          'inline-flex min-w-[2.25rem] items-center justify-center px-1.5 py-0.5 text-[12px] font-semibold',
                          TONE_SOFT[meta.tone],
                        )}
                      >
                        {isDayCell(cell) ? `${cell.attended}/${cell.lessons}` : meta.mark}
                      </span>
                    </td>
                  );
                })}
                <td className="border-l border-border px-2 py-1.5 text-right">
                  <CodeText>
                    {row.totals.attended}/{row.totals.lessons}
                  </CodeText>
                </td>
                <td className="border-l border-border px-2 py-1.5 text-right">
                  <CodeText className={cn('font-semibold', RAG_TEXT[tone])}>
                    {row.totals.rate === null ? '—' : `${row.totals.rate}%`}
                  </CodeText>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Belgilar">
      {LEGEND.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className={cn('inline-flex min-w-[1.5rem] justify-center px-1 text-[11px] font-semibold', TONE_SOFT[CELL_META[key].tone])}>
            {CELL_META[key].mark}
          </span>
          {CELL_META[key].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-flex min-w-[1.5rem] justify-center text-subtle">·</span>Darsi yo&apos;q
      </li>
    </ul>
  );
}
