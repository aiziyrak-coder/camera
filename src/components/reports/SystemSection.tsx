import { formatCount } from '../../lib/uzDate';
import type { SystemAnalytics } from '../../types';

function Progress({ label, done, total, percent, hint }: { label: string; done: number; total: number; percent: number | null; hint?: string }) {
  const tone = percent === null ? 'bg-slate-300' : percent >= 90 ? 'bg-emerald-500' : percent >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="rounded-xl bg-white/70 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900">
          {percent === null ? '—' : `${percent}%`}
          <span className="ml-1.5 text-xs font-medium text-slate-400">
            {formatCount(done)} / {formatCount(total)}
          </span>
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/80"
        role="progressbar"
        aria-valuenow={percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function SystemSection({ system }: { system: SystemAnalytics }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Progress
        label="Aloqadagi kameralar"
        done={system.camerasLive}
        total={system.camerasActive}
        percent={system.liveRate}
        hint={`Jami ${formatCount(system.camerasTotal)} ta kamera, shundan faol ${formatCount(system.camerasActive)} ta`}
      />
      {system.coverage.map((row) => (
        <Progress
          key={row.type}
          label={`${row.label}: yuzi tasdiqlangan`}
          done={row.confirmed}
          total={row.total}
          percent={row.percent}
          hint="Yuzi tasdiqlanmagan odamni kameralar tanimaydi — uning davomati avtomatik yozilmaydi"
        />
      ))}
    </div>
  );
}
