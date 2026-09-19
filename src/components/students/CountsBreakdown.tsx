import { ProgressBar, cn, formatNumber, TONE_SOLID } from '../../ui';
import type { Counts } from '../../lib/situationApi';
import { countSegments } from '../../lib/studentAttendance';

interface Item {
  key: string;
  label: string;
  short: string;
  value: number;
  tone: keyof typeof TONE_SOLID;
}

/** Counts → ko'rsatiladigan qatorlar. "Hali kelmagan" faqat bugun (0 bo'lsa
 *  yashiriladi), "Ma'lumot yo'q" — faqat bor bo'lsa. */
function countItems(counts: Counts, options: { showZeroNotYet?: boolean } = {}): Item[] {
  const items: Item[] = [
    { key: 'keldi', label: 'Keldi', short: 'keldi', value: counts.present - counts.late, tone: 'success' },
    { key: 'kech', label: 'Kech keldi', short: 'kech', value: counts.late, tone: 'warning' },
    { key: 'kelmadi', label: 'Kelmadi', short: 'kelmadi', value: counts.absent, tone: 'danger' },
  ];
  if (counts.notYet > 0 || options.showZeroNotYet) {
    items.push({ key: 'kutilmoqda', label: 'Hali kelmagan', short: 'kutilmoqda', value: counts.notYet, tone: 'neutral' });
  }
  if (counts.noData + counts.dayOff > 0) {
    items.push({ key: 'nomalum', label: "Ma'lumot yo'q", short: "noma'lum", value: counts.noData + counts.dayOff, tone: 'neutral' });
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
        <li key={item.key} className="inline-flex items-center gap-1.5 text-muted" title={`${item.label}: ${item.value}`}>
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
