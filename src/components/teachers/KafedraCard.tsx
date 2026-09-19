import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { ProgressBar, ProgressRing, cn, focusRing } from '../../ui';
import type { KafedraStat } from '../../lib/situationApi';
import { kafedraSegments } from '../../lib/teachersApi';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'danger' }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-base font-semibold tabular-nums text-fg', value > 0 && tone === 'warning' && 'text-warning', value > 0 && tone === 'danger' && 'text-danger')}>{value}</p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** Kafedra kartasi: nom, bino, xodimlar davomati halqasi va bugungi darslar. */
export function KafedraCard({ kafedra, to }: { kafedra: KafedraStat; to: string }) {
  const k = kafedra;
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-w-0 flex-col gap-4 rounded-card border bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop sm:p-5',
        k.unassigned ? 'border-dashed border-border-strong' : 'border-border',
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('line-clamp-2 text-[15px] font-semibold leading-snug text-fg group-hover:text-primary', k.unassigned && 'text-muted')}>{k.name}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <Building2 size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{k.building ?? (k.unassigned ? "Lavozimi kafedra nomiga mos kelmagan xodimlar" : 'Bino belgilanmagan')}</span>
          </p>
        </div>
        <ProgressRing value={k.rate} size={56} ariaLabel={`${k.name}: davomat`} sublabel="keldi" />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-muted">Xodimlar</span>
          <span className="tabular-nums text-muted">
            <span className="font-semibold text-fg">{k.present}</span> / {k.staffTotal}
          </span>
        </div>
        <ProgressBar size="sm" segments={kafedraSegments(k)} />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-border pt-3">
        <Stat label="Kech keldi" value={k.late} tone="warning" />
        <Stat label="Darslar" value={k.lessonsToday} />
        <Stat label="Kechikkan" value={k.teacherLateLessons} tone="warning" />
        <Stat label="Kelmagan" value={k.teacherMissedLessons} tone="danger" />
      </div>
    </Link>
  );
}
