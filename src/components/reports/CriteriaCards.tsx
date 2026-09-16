import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { SkeletonBlock } from '../ui/Skeleton';
import type { ReportCriterion } from '../../types';

/** 1-daraja: kriteriya kartalari.
 *
 * Har karta bitta savolga javob beradi va raqamlari "chelak" bo'lib
 * ajratilgan — chelakni bosish o'sha raqam ORTIDAGI ro'yxatni ochadi.
 * Nol raqam izohsiz qolmaydi: `note` bo'lsa, u kartaning pastida
 * ko'rinadi, chunki "0 ta kelmadi" va "tizim qaramadi" bir xil emas. */
const TONE_TEXT: Record<string, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-rose-600',
  indigo: 'text-indigo-600',
  slate: 'text-slate-500',
};

const TONE_BG: Record<string, string> = {
  green: 'bg-emerald-50 hover:bg-emerald-100',
  amber: 'bg-amber-50 hover:bg-amber-100',
  red: 'bg-rose-50 hover:bg-rose-100',
  indigo: 'bg-indigo-50 hover:bg-indigo-100',
  slate: 'bg-slate-50 hover:bg-slate-100',
};

export default function CriteriaCards({
  criteria,
  loading,
  onOpen,
}: {
  criteria: ReportCriterion[];
  loading: boolean;
  onOpen: (criterion: ReportCriterion, bucketKey: string) => void;
}) {
  if (loading && criteria.length === 0) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3].map((key) => (
          <SkeletonBlock key={key} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {criteria.map((criterion) => {
        const openable = criterion.detail !== 'none';
        return (
          <div key={criterion.key} className="glass flex flex-col gap-3 p-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">{criterion.title}</h3>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-400">
                  {criterion.total} {criterion.unit}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{criterion.subtitle}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {criterion.buckets.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  disabled={!openable}
                  onClick={() => onOpen(criterion, bucket.key)}
                  title={openable ? `${bucket.label} — ro'yxatni ochish` : undefined}
                  className={`rounded-xl px-2 py-2 text-left transition disabled:cursor-default disabled:opacity-70 ${
                    TONE_BG[bucket.tone] ?? TONE_BG.slate
                  }`}
                >
                  <span className={`block text-lg font-extrabold tabular-nums ${TONE_TEXT[bucket.tone] ?? TONE_TEXT.slate}`}>
                    {bucket.count}
                  </span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {bucket.label}
                  </span>
                </button>
              ))}
            </div>

            {criterion.note ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-amber-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {criterion.note}
              </p>
            ) : (
              openable && (
                <button
                  type="button"
                  onClick={() => onOpen(criterion, criterion.buckets[0]?.key ?? '')}
                  className="flex items-center gap-1 self-start text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  {criterion.detail === 'events' ? 'Signallarni ochish' : "Ro'yxatni ochish"}
                  <ChevronRight size={12} />
                </button>
              )
            )}

            {!openable && !criterion.note && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Info size={12} />
                Bu kriteriya bo&apos;yicha batafsil ro&apos;yxat hozircha yo&apos;q
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
