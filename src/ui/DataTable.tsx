import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, SearchX } from 'lucide-react';
import { cn, focusRing } from './cn';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { TONE_SOLID, type Tone } from './tones';
import { nextSort, sortRows, type SortDir, type SortState, type SortValue } from './tableSort';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Katak mazmuni. Berilmasa — `row[key]`. */
  cell?: (row: T, index: number) => ReactNode;
  /** Saralash qiymati. Berilsa ustun saralanadi. */
  sortValue?: (row: T) => SortValue;
  /** Birinchi bosishdagi yo'nalish (raqamlar uchun ko'pincha 'desc'). */
  sortFirst?: SortDir;
  align?: 'left' | 'center' | 'right';
  /** CSS kenglik ("8rem", "20%"). */
  width?: string;
  className?: string;
  /** Telefondagi kartada ko'rsatilmasin. */
  hideOnMobile?: boolean;
  /** Telefondagi kartadagi yorliq (standart: header). */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Tanlangan qator (Drawer ochiq bo'lsa). */
  selectedKey?: string | null;
  /** Qator chap chetidagi holat chizig'i. */
  rowTone?: (row: T) => Tone | null | undefined;
  loading?: boolean;
  loadingRows?: number;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /** Boshqariladigan saralash (server tomonida saralash uchun `manualSort` bilan). */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  defaultSort?: SortState | null;
  /** Qatorlar allaqachon saralangan (server) — lokal saralamaydi. */
  manualSort?: boolean;
  /** Jadval ichida aylantirish balandligi — sarlavha yopishib turadi. 'none' — cheklovsiz. */
  maxHeight?: string;
  dense?: boolean;
  /** Juft/toq qatorlar fonini almashtirish (uzun jadvallarni o'qish osonroq). */
  zebra?: boolean;
  /** Telefonda: 'cards' (standart) — har qator karta; 'scroll' — gorizontal aylantirish. */
  mobile?: 'cards' | 'scroll';
  /** Kartadagi sarlavha ustuni (standart: birinchi ustun). */
  mobileTitleKey?: string;
  ariaLabel?: string;
  /** Pastki qism (Pagination va h.k.). */
  footer?: ReactNode;
  className?: string;
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

function defaultCell<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined || value === '') return <span className="text-subtle">—</span>;
  return String(value);
}

/** Jadval: saralash, qator bosish (klaviatura bilan ham), yopishqoq sarlavha,
 *  yuklanish/bo'sh/xato holatlari; telefonda — kartalar ro'yxati. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  rowTone,
  loading = false,
  loadingRows = 6,
  error,
  onRetry,
  emptyTitle = "Ma'lumot topilmadi",
  emptyDescription,
  emptyAction,
  sort: controlledSort,
  onSortChange,
  defaultSort = null,
  manualSort = false,
  maxHeight = 'min(70vh, 48rem)',
  dense = false,
  zebra = false,
  mobile = 'cards',
  mobileTitleKey,
  ariaLabel,
  footer,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | null>(defaultSort);
  // Aylantirilganda yopishqoq sarlavha ostida soya — mazmun ostidan o'tayotgani ko'rinadi.
  const [scrolled, setScrolled] = useState(false);
  const sort = controlledSort !== undefined ? controlledSort : internalSort;

  function toggleSort(column: DataTableColumn<T>) {
    const next = nextSort(sort, column.key, column.sortFirst);
    if (controlledSort === undefined) setInternalSort(next);
    onSortChange?.(next);
  }

  const sortedRows = useMemo(() => {
    if (manualSort || !sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    return sortRows(rows, column.sortValue, sort.dir);
  }, [rows, columns, sort, manualSort]);

  const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const showEmpty = !loading && !error && sortedRows.length === 0;

  function rowKeyDown(event: KeyboardEvent<HTMLElement>, row: T) {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  }

  const titleColumn = columns.find((c) => c.key === mobileTitleKey) ?? columns[0];
  const mobileColumns = columns.filter((c) => c !== titleColumn && !c.hideOnMobile);

  const tableView = (
    <div
      data-table-scroll=""
      className={cn('overflow-auto', mobile === 'cards' && 'hidden md:block')}
      style={maxHeight !== 'none' ? { maxHeight } : undefined}
      onScroll={(event) => {
        const next = event.currentTarget.scrollTop > 0;
        if (next !== scrolled) setScrolled(next);
      }}
    >
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label={ariaLabel} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const active = sort?.key === column.key;
              const SortIcon = active ? (sort?.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 text-xs font-semibold text-muted transition-shadow',
                    scrolled && 'shadow-[0_8px_12px_-10px_rgb(16_24_40/0.25)]',
                    dense ? 'px-3 py-2' : 'px-4 py-2.5',
                    ALIGN[column.align ?? 'left'],
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-fg', active && 'text-fg', focusRing, JUSTIFY[column.align ?? 'left'])}
                    >
                      {column.header}
                      <SortIcon size={13} aria-hidden="true" className={active ? 'text-primary' : 'opacity-40'} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {onRowClick && (
              <th aria-hidden="true" className={cn('sticky top-0 z-10 w-8 border-b border-border bg-surface-2 transition-shadow', scrolled && 'shadow-[0_8px_12px_-10px_rgb(16_24_40/0.25)]')} />
            )}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: loadingRows }).map((_, r) => (
              <tr key={`sk-${r}`}>
                {columns.map((column, c) => (
                  <td key={column.key} className={cn(cellPad, 'border-b border-border')}>
                    <Skeleton className={cn('h-3.5', c === 0 ? 'w-3/4' : 'w-1/2', column.align === 'right' && 'ml-auto')} />
                  </td>
                ))}
                {onRowClick && <td className="border-b border-border" />}
              </tr>
            ))}
          {!loading &&
            sortedRows.map((row, index) => {
              const key = rowKey(row, index);
              const tone = rowTone?.(row);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => rowKeyDown(event, row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={onRowClick ? selected : undefined}
                  className={cn(
                    'group transition-colors',
                    zebra && 'even:bg-surface-2/50',
                    onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-primary-soft/60 focus-visible:outline-none',
                    selected && 'bg-primary-soft/70 hover:bg-primary-soft',
                  )}
                >
                  {columns.map((column, c) => (
                    <td
                      key={column.key}
                      className={cn(
                        cellPad,
                        'relative border-b border-border align-middle text-fg group-last:border-b-0',
                        ALIGN[column.align ?? 'left'],
                        column.align === 'right' && 'tabular-nums',
                        column.className,
                      )}
                    >
                      {c === 0 && tone && <span className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r', TONE_SOLID[tone])} aria-hidden="true" />}
                      {column.cell ? column.cell(row, index) : defaultCell(row, column.key)}
                    </td>
                  ))}
                  {onRowClick && (
                    <td className="border-b border-border pr-3 text-subtle group-last:border-b-0">
                      <ChevronRight size={16} aria-hidden="true" className="-translate-x-1 opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );

  const cardsView = mobile === 'cards' && (
    <ul data-table-cards="" className="divide-y divide-border md:hidden" aria-label={ariaLabel} aria-busy={loading || undefined}>
      {loading &&
        Array.from({ length: Math.min(loadingRows, 4) }).map((_, r) => (
          <li key={`sk-${r}`} className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </li>
        ))}
      {!loading &&
        sortedRows.map((row, index) => {
          const key = rowKey(row, index);
          const tone = rowTone?.(row);
          const content = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 font-medium text-fg">{titleColumn.cell ? titleColumn.cell(row, index) : defaultCell(row, titleColumn.key)}</div>
                {onRowClick && <ChevronRight size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />}
              </div>
              {mobileColumns.length > 0 && (
                <dl className="mt-2 flex flex-col gap-1 text-[13px]">
                  {mobileColumns.map((column) => (
                    <div key={column.key} className="flex min-w-0 items-center justify-between gap-3">
                      <dt className="shrink-0 text-muted">{column.mobileLabel ?? column.header}</dt>
                      <dd className="min-w-0 truncate text-right tabular-nums text-fg">{column.cell ? column.cell(row, index) : defaultCell(row, column.key)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={key} className="relative">
              {tone && <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r', TONE_SOLID[tone])} aria-hidden="true" />}
              {onRowClick ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onRowClick(row)}
                  onKeyDown={(event) => rowKeyDown(event, row)}
                  className={cn('block w-full p-4 text-left transition-colors hover:bg-surface-2', selectedKey === key && 'bg-primary-soft/70', focusRing)}
                >
                  {content}
                </div>
              ) : (
                <div className="p-4">{content}</div>
              )}
            </li>
          );
        })}
    </ul>
  );

  return (
    <div className={cn('min-w-0 overflow-hidden rounded-card border border-border bg-surface shadow-card', className)}>
      {error ? (
        <ErrorState variant="block" message={error} onRetry={onRetry} />
      ) : (
        <>
          {tableView}
          {cardsView}
          {showEmpty && (
            <EmptyState icon={SearchX} title={emptyTitle} description={emptyDescription} action={emptyAction} compact bordered={false} />
          )}
        </>
      )}
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </div>
  );
}
