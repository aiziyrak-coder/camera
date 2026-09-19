import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, Users } from 'lucide-react';
import { ProgressRing, cn, focusRing, formatNumber } from '../../ui';
import type { Counts, FacultyCounts, GroupStat } from '../../lib/situationApi';
import { CountsBar, CountsLegend } from './CountsBreakdown';

const CARD =
  'group flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop sm:p-5';

function rateHint(counts: Counts): string {
  if (counts.total === 0) return "Talaba yo'q";
  if (counts.rate === null) return "Ma'lumot yo'q";
  return `${formatNumber(counts.present)} / ${formatNumber(counts.present + counts.absent + counts.notYet)} keldi`;
}

/** Fakultet kartasi (/talabalar): nom, foiz halqasi, holatlar va chiziq. */
export function FacultyCard({ faculty, to }: { faculty: FacultyCounts; to: string }) {
  return (
    <Link to={to} className={cn(CARD, focusRing)} aria-label={`${faculty.name} — davomat ${faculty.rate ?? '—'}%`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1 text-base font-semibold leading-6 text-fg">
            <span className="truncate">{faculty.name}</span>
            <ChevronRight size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <Users size={14} aria-hidden="true" />
            {formatNumber(faculty.total)} talaba
            {faculty.enrolled < faculty.total && (
              <span className="text-subtle">· {formatNumber(faculty.enrolled)} yuzi bor</span>
            )}
          </p>
        </div>
        <ProgressRing value={faculty.rate} size={64} sublabel="davomat" ariaLabel={`Davomat ${faculty.rate ?? '—'}%`} />
      </div>
      <CountsBar counts={faculty} className="mt-4" />
      <CountsLegend counts={faculty} className="mt-3" />
    </Link>
  );
}

/** Guruh kartasi (fakultet sahifasi): nom, kurs, talabalar soni, halqa. */
export function GroupCard({ group, to, showCourse = false }: { group: GroupStat; to: string; showCourse?: boolean }) {
  const empty = group.total === 0;
  return (
    <Link to={to} className={cn(CARD, 'p-4 sm:p-4', focusRing)} aria-label={`${group.name} — davomat ${group.rate ?? '—'}%`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-6 text-fg">{group.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {showCourse && group.course && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap size={13} aria-hidden="true" />
                {group.course}-kurs ·
              </span>
            )}
            <span>{empty ? "Talaba yo'q" : `${formatNumber(group.total)} talaba`}</span>
          </p>
        </div>
        <ProgressRing value={group.rate} size={48} ariaLabel={`Davomat ${group.rate ?? '—'}%`} />
      </div>
      <CountsBar counts={group} size="xs" className="mt-3" />
      <CountsLegend counts={group} compact className="mt-2.5 gap-x-2.5" />
      <p className="sr-only">{rateHint(group)}</p>
    </Link>
  );
}
