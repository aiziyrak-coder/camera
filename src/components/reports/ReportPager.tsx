import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, formatNumber } from '../../ui';

/** Jadval ostidagi sahifalash (DataTable `footer`). */
export default function ReportPager({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <span className="tabular-nums">
        {formatNumber(from)}–{formatNumber(to)} / {formatNumber(total)} ta
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Oldingi sahifa" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} />
          <span className="px-2 font-medium tabular-nums text-fg">
            {page} / {totalPages}
          </span>
          <IconButton icon={ChevronRight} label="Keyingi sahifa" size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)} />
        </div>
      )}
    </div>
  );
}
