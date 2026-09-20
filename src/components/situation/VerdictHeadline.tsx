import type { ReactNode } from 'react';
import type { Counts } from '../../lib/situationApi';
import { MicroLabel, Skeleton, cn } from '../../ui';
import { RAG_LABEL, RAG_LETTER, RAG_SOLID, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';

/**
 * Sahifaning YAGONA asosiy hukmi: katta foiz, svetofor ustuni va hukm
 * SO'ZI. Rang yolg'iz qolmaydi — harf (Y/S/Q) va so'z ham yoziladi.
 */

const n = (value: number) => value.toLocaleString('ru-RU');

function Cell({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 border-s border-border ps-3 first:border-s-0 first:ps-0">
      <MicroLabel className="intel-micro-wrap block">{label}</MicroLabel>
      <div className={cn('intel-code mt-1 text-[22px] font-semibold leading-none', tone ?? 'text-fg')}>{value}</div>
    </div>
  );
}

export function VerdictHeadline({
  scopeLabel,
  counts,
  isToday,
  loading,
}: {
  /** "Xodimlar" yoki "Talabalar" — hukm kim haqida ekani. */
  scopeLabel: string;
  counts: Counts | null;
  isToday: boolean;
  loading: boolean;
}) {
  if (loading || !counts) {
    return (
      <div className="flex items-center gap-6 px-4 py-5" aria-busy="true" aria-label="Yuklanmoqda">
        <Skeleton className="h-16 w-40" />
        <Skeleton className="h-10 flex-1" />
      </div>
    );
  }

  const expected = counts.present + counts.absent + counts.notYet;
  // Hech kim kutilmagan bo'lsa foiz "0%" emas, O'LCHANMAGAN: nol
  // davomat bilan o'lchovsizlikni chalkashtirish eng qo'pol xato.
  const measured = expected > 0 && counts.rate !== null;
  const tone = rag(measured ? counts.rate : null, RATE_RAG);

  return (
    <div className="flex min-w-0 flex-wrap items-stretch gap-x-6 gap-y-4 px-4 py-4">
      {/* Svetofor ustuni — blokning chap qirrasi. */}
      <span aria-hidden="true" className={cn('w-1.5 shrink-0 rounded-[1px]', RAG_SOLID[tone])} />

      <div className="flex min-w-0 shrink-0 items-end gap-3">
        <span className={cn('intel-code text-[58px] font-semibold leading-[0.85] tracking-tight', RAG_TEXT[tone])}>
          {measured ? `${Math.round((counts.rate ?? 0) * 10) / 10}%` : '—'}
        </span>
        <span className="flex flex-col gap-1 pb-1">
          <span className={cn('intel-code text-[15px] font-bold leading-none', RAG_TEXT[tone])}>{RAG_LETTER[tone]}</span>
          <span className={cn('text-[13px] font-semibold leading-none', RAG_TEXT[tone])}>{RAG_LABEL[tone]}</span>
          <MicroLabel>{scopeLabel}</MicroLabel>
        </span>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Keldi" value={`${n(counts.present)} / ${n(expected)}`} />
        <Cell label="Kech keldi" value={n(counts.late)} tone={counts.late > 0 ? 'text-warning' : 'text-fg'} />
        <Cell label="Kelmadi" value={n(counts.absent)} tone={counts.absent > 0 ? 'text-danger' : 'text-fg'} />
        <Cell
          label={isToday ? 'Hali yo’q' : 'Aniqlanmagan'}
          value={n(isToday ? counts.notYet : counts.noData)}
          tone="text-subtle"
        />
      </div>
    </div>
  );
}
