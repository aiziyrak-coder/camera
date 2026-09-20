import { ProgressBar, cn, formatNumber, TONE_SOLID } from '../../ui';
import type { Counts } from '../../lib/situationApi';
import { countSegments } from '../../lib/studentAttendance';

interface Item {
  key: string;
  label: string;
  short: string;
  value: number;
  tone: keyof typeof TONE_SOLID;
  /** Qo'shimcha izoh (tooltipda). */
  hint?: string;
}

/** Counts → ko'rsatiladigan qatorlar. "Hali kelmagan" faqat bugun (0 bo'lsa
 *  yashiriladi), "Ma'lumot yo'q" — faqat bor bo'lsa. */
function countItems(counts: Counts): Item[] {
  const items: Item[] = [
    // Math.max — countSegments bilan bir xil: buzuq ma'lumotda "-1 keldi" chiqmasin.
    { key: 'keldi', label: 'Keldi', short: 'keldi', value: Math.max(0, counts.present - counts.late), tone: 'success' },
    { key: 'kech', label: 'Kech keldi', short: 'kech', value: counts.late, tone: 'warning' },
    { key: 'kelmadi', label: 'Kelmadi', short: 'kelmadi', value: counts.absent, tone: 'danger' },
  ];
  if (counts.notYet > 0) {
    items.push({ key: 'kutilmoqda', label: 'Hali kelmagan', short: 'kutilmoqda', value: counts.notYet, tone: 'neutral' });
  }
  if (counts.noData + counts.dayOff > 0) {
    items.push({
      key: 'nomalum',
      label: "Ma'lumot yo'q",
      short: "noma'lum",
      value: counts.noData + counts.dayOff,
      tone: 'neutral',
      // Ikki xil sabab bitta qatorga qo'shiladi — tooltipda ajratib beriladi,
      // aks holda "dam olish" kuni "ma'lumot yo'qolgan"dek tuyulardi.
      hint: counts.dayOff > 0 ? `kamera tanimagan ${counts.noData} · dam olish ${counts.dayOff}` : undefined,
    });
  }
  return items;
}

/** Rangli nuqta + son + yorliq qatori (kartalar ostida). */
export function CountsLegend({
  counts,
  className,
  size = 'sm',
  compact = false,
}: {
  counts: Counts;
  className?: string;
  size?: 'sm' | 'md';
  /** Qisqa yorliqlar (tor kartalar uchun). */
  compact?: boolean;
}) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3.5 gap-y-1', size === 'md' ? 'text-[13px]' : 'text-xs', className)}>
      {countItems(counts).map((item) => (
        <li key={item.key} className="inline-flex items-center gap-1.5 text-muted" title={`${item.label}: ${item.value}${item.hint ? ` (${item.hint})` : ''}`}>
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              TONE_SOLID[item.tone],
              item.key === 'nomalum' && 'opacity-50',
            )}
            aria-hidden="true"
          />
          <span className="font-semibold tabular-nums text-fg">{formatNumber(item.value)}</span>
          {compact ? item.short : item.label}
        </li>
      ))}
    </ul>
  );
}

/** Bitta chiziqda holatlar ulushi. */
export function CountsBar({ counts, size = 'sm', className }: { counts: Counts; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return <ProgressBar segments={countSegments(counts)} size={size} className={className} />;
}
