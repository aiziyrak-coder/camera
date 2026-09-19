import { Badge, ProgressRing, cn } from '../../ui';
import type { KafedraTeacher } from '../../lib/situationApi';

/** Bugungi darslar: "3 dars · 2 vaqtida · 1 kech · 0 yo'q". */
export function TodayLessons({ t, className }: { t: KafedraTeacher; className?: string }) {
  if (t.lessonsScheduled === 0) return <span className={cn('text-xs text-subtle', className)}>Darsi yo'q</span>;
  const pending = t.lessonsScheduled - t.lessonsOnTime - t.lessonsLate - t.lessonsMissed;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <span className="text-xs font-medium text-fg">{t.lessonsScheduled} dars:</span>
      {t.lessonsOnTime > 0 && (
        <Badge tone="success" title="O'z vaqtida">
          {t.lessonsOnTime} vaqtida
        </Badge>
      )}
      {t.lessonsLate > 0 && <Badge tone="warning">{t.lessonsLate} kech</Badge>}
      {t.lessonsMissed > 0 && <Badge tone="danger">{t.lessonsMissed} yo'q</Badge>}
      {pending > 0 && <Badge tone="neutral">{pending} kutilmoqda</Badge>}
    </span>
  );
}

/** PersonCard pastidagi qism: bugungi darslar + davrdagi o'z vaqtida halqasi. */
export function TeacherCardMeta({ t }: { t: KafedraTeacher }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border pt-2">
      <div className="min-w-0">
        <TodayLessons t={t} />
        <p className="mt-1 text-[11px] text-muted">
          Faollik: <span className="font-medium tabular-nums text-fg">{t.avgActivityScore === null ? '—' : `${Math.round(t.avgActivityScore)}%`}</span>
        </p>
      </div>
      <ProgressRing value={t.onTimeRate} size={38} thickness={4} ariaLabel="Davrda darsga o'z vaqtida" />
    </div>
  );
}
