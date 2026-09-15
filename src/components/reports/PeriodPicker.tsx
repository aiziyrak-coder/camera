import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import SegmentedControl from '../ui/SegmentedControl';
import { PERIOD_PRESETS, resolvePreset, validateRange, type PeriodPreset } from '../../lib/reportPeriods';
import { todayInTashkent } from '../../lib/uzDate';

export interface PeriodValue {
  preset: PeriodPreset;
  from: string;
  to: string;
}

const OPTIONS: { value: PeriodPreset; label: string }[] = [...PERIOD_PRESETS, { value: 'custom', label: 'Oraliq' }];

export default function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (next: PeriodValue) => void }) {
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
  }, [value.from, value.to]);

  const error = value.preset === 'custom' ? validateRange(draftFrom, draftTo) : null;
  const today = todayInTashkent();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        options={OPTIONS}
        value={value.preset}
        size="sm"
        ariaLabel="Hisobot davri"
        onChange={(preset) => {
          if (preset === 'custom') onChange({ preset, from: value.from, to: value.to });
          else onChange({ preset, ...resolvePreset(preset) });
        }}
      />
      {value.preset === 'custom' && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!error) onChange({ preset: 'custom', from: draftFrom, to: draftTo });
          }}
        >
          <CalendarRange size={15} className="text-slate-400" aria-hidden="true" />
          <label className="sr-only" htmlFor="report-from">
            Boshlanish sanasi
          </label>
          <input
            id="report-from"
            type="date"
            value={draftFrom}
            max={today}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-sm outline-none focus:border-indigo-300"
          />
          <span className="text-slate-400">—</span>
          <label className="sr-only" htmlFor="report-to">
            Tugash sanasi
          </label>
          <input
            id="report-to"
            type="date"
            value={draftTo}
            max={today}
            onChange={(e) => setDraftTo(e.target.value)}
            className="rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-sm outline-none focus:border-indigo-300"
          />
          <button type="submit" disabled={!!error} className="btn-glass !py-1 disabled:cursor-not-allowed disabled:opacity-50">
            Ko&apos;rsatish
          </button>
          {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}
