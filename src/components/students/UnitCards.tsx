import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, ScanFace, Users } from 'lucide-react';
import { ProgressBar, ProgressRing, cn, focusRing, formatNumber, formatPercent } from '../../ui';
import { enrollTone, enrolledPct, hasAttendanceData } from '../../lib/studentAttendance';
import type { Counts, FacultyCounts, GroupStat } from '../../lib/situationApi';
import { CountsBar, CountsLegend } from './CountsBreakdown';

const CARD =
  'group flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop sm:p-5';

function rateHint(counts: Counts): string {
  if (counts.total === 0) return "Talaba yo'q";
  if (counts.rate === null) return "Ma'lumot yo'q";
  return `${formatNumber(counts.present)} / ${formatNumber(counts.present + counts.absent + counts.notYet)} keldi`;
}

/** Yuzlar yetarli bo'lmagan birlik uchun: davomat o'rniga yuz topshirish progressi. */
function EnrollStrip({ counts, compact }: { counts: Pick<Counts, 'total' | 'enrolled'>; compact?: boolean }) {
  const pct = enrolledPct(counts);
  return (
    <div className={cn('rounded-control border border-dashed border-border bg-surface-2/60', compact ? 'mt-3 p-2.5' : 'mt-4 p-3')}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
          <ScanFace size={14} className="text-primary" aria-hidden="true" />
          Yuz topshirish
        </span>
        <span className="font-semibold tabular-nums text-fg">{formatPercent(pct)}</span>
      </div>
      <ProgressBar value={pct ?? 0} tone={enrollTone(pct)} size="xs" className="mt-2" />
      {!compact && (
        <p className="mt-2 text-xs text-muted">
          {formatNumber(counts.total - counts.enrolled)} talabaning yuzi yo&apos;q — davomat hali ishonchli emas
        </p>
      )}
    </div>
  );
}

/** Fakultet kartasi (/talabalar): nom, foiz halqasi, holatlar va chiziq.
 *  Yuzlar yetarli bo'lmasa — yuz topshirish progressi (`enrollTo` ga havola). */
export function FacultyCard({ faculty, to, enrollTo }: { faculty: FacultyCounts; to: string; enrollTo?: string }) {
  if (faculty.total > 0 && !hasAttendanceData(faculty)) {
    return (
      <Link to={enrollTo ?? to} className={cn(CARD, focusRing)} aria-label={`${faculty.name} — yuz topshirish ${enrolledPct(faculty) ?? 0}%`}>
        <h3 className="flex items-center gap-1 text-base font-semibold leading-6 text-fg">
          <span className="truncate">{faculty.name}</span>
          <ChevronRight size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
          <Users size={14} aria-hidden="true" />
          {formatNumber(faculty.total)} talaba · {formatNumber(faculty.enrolled)} yuzi bor
        </p>
        <EnrollStrip counts={faculty} />
      </Link>
    );
  }
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
  const ready = empty || hasAttendanceData(group);
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
        {ready && <ProgressRing value={group.rate} size={48} ariaLabel={`Davomat ${group.rate ?? '—'}%`} />}
      </div>
      {ready ? (
        <>
          <CountsBar counts={group} size="xs" className="mt-3" />
          <CountsLegend counts={group} compact className="mt-2.5 gap-x-2.5" />
        </>
      ) : (
        <EnrollStrip counts={group} compact />
      )}
      <p className="sr-only">{rateHint(group)}</p>
    </Link>
  );
}
