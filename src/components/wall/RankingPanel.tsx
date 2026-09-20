import { Timer, Trophy } from 'lucide-react';
import type { WallUnit } from '../../lib/wallApi';
import { cn, TONE_SOLID, TONE_TEXT, toneForRate } from '../../ui';
import { WallPanel } from './primitives';

function UnitBar({ unit, rank }: { unit: WallUnit; rank: number | null }) {
  const tone = toneForRate(unit.rate);
  const pct = unit.rate ?? 0;
  return (
    <li className="min-w-0 shrink-0">
      <div className="flex items-baseline gap-[0.5em] text-[0.85em]">
        <span className="w-[1.2em] shrink-0 tabular-nums text-muted">{rank ?? '·'}</span>
        <span className="min-w-0 flex-1 truncate text-fg">{unit.name}</span>
        <span className="shrink-0 tabular-nums text-muted">
          {unit.present}/{unit.total}
        </span>
        <span className={cn('w-[3em] shrink-0 text-right font-semibold tabular-nums', TONE_TEXT[tone])}>
          {unit.rate === null ? '—' : `${Math.round(unit.rate)}%`}
        </span>
      </div>
      <div className="ml-[1.7em] mt-[0.2em] h-[0.3em] overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full transition-[width] duration-1000 ease-out', TONE_SOLID[tone])}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </li>
  );
}

function Group({ title, units, startRank }: { title: string; units: WallUnit[]; startRank?: (i: number) => number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-[0.4em] shrink-0 text-[0.75em] font-medium text-muted">{title}</div>
      {units.length === 0 ? (
        <div className="text-[0.8em] text-muted">Bugun hali ma'lumot yo'q</div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-[0.2em] overflow-hidden">
          {units.map((u, i) => (
            <UnitBar key={u.id} unit={u} rank={startRank ? startRank(i) : null} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function RankingPanel({
  top,
  bottom,
  chronic,
}: {
  top: WallUnit[];
  bottom: WallUnit[];
  chronic: number | null;
}) {
  // Kichik institutda top va bottom kesishishi mumkin — pastkilarni takrorlamaymiz.
  const topIds = new Set(top.map((u) => u.id));
  const bottomOnly = bottom.filter((u) => !topIds.has(u.id));
  return (
    <WallPanel area="D" title="Bo'linmalar reytingi" icon={<Trophy />} aside={<span>bugungi davomat</span>}>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.6em]">
        <Group title="Eng yaxshi 5" units={top} startRank={(i) => i + 1} />
        {/* Bu ro'yxat — eng pastdagilar; "1, 2, 3" raqamlari uni yaxshi
            o'rin kabi ko'rsatardi, shuning uchun raqamlanmaydi. */}
        {bottomOnly.length > 0 && <Group title="Diqqat talab — eng past" units={bottomOnly} />}
        <div className="flex shrink-0 items-center gap-[0.8em] rounded-[0.8em] bg-warning-soft px-[0.9em] py-[0.6em]">
          <Timer className="h-[1.6em] w-[1.6em] shrink-0 text-warning" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[0.9em] font-medium text-fg">Takror kech keladigan xodimlar</div>
            <div className="text-[0.7em] text-muted">so'nggi 14 kunda ≥3 marta kech/kelmagan xodimlar</div>
          </div>
          <div className="text-[2em] font-semibold tabular-nums text-warning">{chronic ?? '—'}</div>
        </div>
      </div>
    </WallPanel>
  );
}
