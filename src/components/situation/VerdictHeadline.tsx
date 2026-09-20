import type { ReactNode } from 'react';
import type { Counts } from '../../lib/situationApi';
import { CodeText, MicroLabel, Skeleton, cn } from '../../ui';
import { RAG_LABEL, RAG_LETTER, RAG_SOLID, RAG_TEXT, RATE_RAG, rag, ragHint } from '../../ui/rag';

/**
 * Sahifaning YAGONA asosiy hukmi: "institut hozir ishlayaptimi?".
 *
 * Rahbar ekranga qaraganda birinchi shu blokni ko'radi — katta foiz,
 * yonida svetofor ustuni va hukm SO'ZI. Rang yolg'iz qolmaydi: harf
 * (Y/S/Q) va so'z ham yozilgani uchun oq-qora bosmada ham o'qiladi.
 */

const n = (value: number) => value.toLocaleString('ru-RU');

/** Foiz faqat yuzi ro'yxatdan o'tganlar bo'yicha o'lchanadi. Qamrov
 *  to'liq bo'lmasa buni ochiq aytamiz: aks holda "92%" butun institut
 *  davomati bo'lib o'qiladi. */
export function coverageNote(counts: Counts): string | null {
  if (counts.total <= 0 || counts.enrolled >= counts.total) return null;
  return `Ro'yxatdagi ${n(counts.total)} kishidan ${n(counts.enrolled)} tasining yuzi ro'yxatdan o'tgan — foiz faqat shular bo'yicha`;
}

function Cell({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 border-s border-border ps-3 first:border-s-0 first:ps-0" title={title}>
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
  note,
}: {
  /** "Xodimlar" yoki "Talabalar" — hukm kim haqida ekani. */
  scopeLabel: string;
  counts: Counts | null;
  isToday: boolean;
  loading: boolean;
  /** Qo'shimcha izoh (masalan, yuz topshirish kampaniyasi haqida). */
  note?: ReactNode;
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
  const coverage = coverageNote(counts);

  return (
    <div className="flex min-w-0 flex-col">
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
            <MicroLabel>
              {scopeLabel} · {isToday ? 'hozirgi holat' : 'kun yakuni'}
            </MicroLabel>
          </span>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <Cell label="Keldi" value={`${n(counts.present)} / ${n(expected)}`} title="Kelgan / kutilgan" />
          <Cell label="Kech keldi" value={n(counts.late)} tone={counts.late > 0 ? 'text-warning' : 'text-fg'} />
          <Cell label="Kelmadi" value={n(counts.absent)} tone={counts.absent > 0 ? 'text-danger' : 'text-fg'} />
          <Cell
            label={isToday ? 'Hali kelmagan' : "Holati aniqlanmagan"}
            value={n(isToday ? counts.notYet : counts.noData)}
            tone="text-subtle"
            title={isToday ? "Yuzi ro'yxatdan o'tgan, lekin bugun hali kamerada ko'rinmagan" : "Kamera tanay olmagan — yuzi ro'yxatdan o'tmagan"}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
        <CodeText className="text-[11px] text-subtle">{ragHint(RATE_RAG)}</CodeText>
        {coverage && <span className="text-[12px] text-muted">{coverage}</span>}
      </div>
      {note && <div className="border-t border-border px-4 py-2 text-[12.5px] leading-relaxed text-muted">{note}</div>}
    </div>
  );
}
