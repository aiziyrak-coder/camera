import { Link } from 'react-router-dom';
import { BookOpen, Building2 } from 'lucide-react';
import { Badge, ProgressBar, ProgressRing, TONE_TEXT, cn, focusRing } from '../../ui';
import { type KafedraStat } from '../../lib/situationApi';
import { kafedraSegments, unitKindLabel } from '../../lib/teachersApi';
import { DeltaBadge } from '../analytics';

function Stat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-lg font-semibold leading-tight tabular-nums', value > 0 ? TONE_TEXT[tone] : 'text-subtle')}>{value}</p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </div>
  );
}

export interface KafedraCardProps {
  kafedra: KafedraStat;
  to: string;
  /** Davomatning oldingi davrga nisbatan o'zgarishi (foiz punkti). */
  trend?: number | null;
  trendHint?: string;
}

/** Bo'linma kartasi: nom va tur, davomat halqasi, bugun keldi/kech/kelmadi,
 *  trend va (bo'lsa) bugungi darslar. */
export function KafedraCard({ kafedra: k, to, trend, trendHint }: KafedraCardProps) {
  const hasLessons = k.lessonsToday > 0;
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-w-0 flex-col gap-4 rounded-card border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop sm:p-5',
        k.unassigned ? 'border-dashed border-border-strong' : 'border-border',
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={k.unassigned ? 'warning' : k.kind === 'kafedra' ? 'primary' : k.kind === 'dekanat' ? 'info' : 'neutral'}>{unitKindLabel(k)}</Badge>
            <DeltaBadge value={trend} unit="pp" title={trendHint} />
          </div>
          <h3 className={cn('line-clamp-2 text-[15px] font-semibold leading-snug text-fg group-hover:text-primary', k.unassigned && 'text-muted')} title={k.name}>
            {k.name}
          </h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <Building2 size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">
              {k.staffTotal} xodim · {k.enrolled} yuzi bor{k.building ? ` · ${k.building}` : ''}
            </span>
          </p>
        </div>
        <ProgressRing value={k.rate} size={56} ariaLabel={`${k.name}: davomat`} sublabel="keldi" />
      </div>

      <ProgressBar size="sm" segments={kafedraSegments(k)} />

      {/* "Hali kelmagan"lar bu yerda umuman ko'rinmasdi: uch raqam qo'shilib
          halqa maxrajiga (keldi + kelmadi + hali kelmagan) teng chiqmas,
          odam esa sababini topolmasdi. */}
      <div className={cn('grid gap-2 border-t border-border pt-3', k.notYet > 0 ? 'grid-cols-4' : 'grid-cols-3')}>
        <Stat label="Keldi" value={k.present - k.late} tone="success" />
        <Stat label="Kech keldi" value={k.late} tone="warning" />
        <Stat label="Kelmadi" value={k.absent} tone="danger" />
        {k.notYet > 0 && <Stat label="Hali kelmagan" value={k.notYet} tone="warning" />}
      </div>

      {hasLessons && (
        <p className="-mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <BookOpen size={12} aria-hidden="true" />
          {k.lessonsToday} dars
          {k.teacherLateLessons > 0 && <Badge tone="warning">{k.teacherLateLessons} kechikkan</Badge>}
          {k.teacherMissedLessons > 0 && <Badge tone="danger">{k.teacherMissedLessons} kelinmagan</Badge>}
        </p>
      )}
    </Link>
  );
}
