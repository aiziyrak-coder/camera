import { useEffect, useState } from 'react';
import { DateRangePicker, SearchInput, Select, Toolbar, type DateRangeValue } from '../../ui';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import {
  PERIOD_PRESETS,
  activeFilterCount,
  courseOptions,
  groupOptions,
  unitOptions,
  type HisobotFilterOptions,
  type HisobotState,
} from '../../lib/hisobotApi';

interface ReportFiltersProps {
  state: HisobotState;
  options: HisobotFilterOptions | null;
  onChange: (patch: Partial<HisobotState>) => void;
  onReset: () => void;
}

/** Yuqoridagi filtrlar: davr + bo'limga xos aholi filtrlari + ism qidiruvi.
 *  Talaba: fakultet -> kurs -> guruh. Xodim: bo'linma turi -> bo'linma. */
export default function ReportFilters({ state, options, onChange, onReset }: ReportFiltersProps) {
  const [query, setQuery] = useState(state.q);
  const debounced = useDebouncedValue(query, 350);

  // URL'dan kelgan qiymat (masalan "Tozalash") maydonni ham yangilasin.
  useEffect(() => setQuery(state.q), [state.q]);
  useEffect(() => {
    if (debounced !== state.q) onChange({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat debounced qiymat o'zgarganda
  }, [debounced]);

  const period: DateRangeValue = { preset: state.preset, from: state.from, to: state.to };
  const students = state.section === 'talabalar';

  return (
    <Toolbar activeCount={activeFilterCount(state)} onReset={onReset}>
      <DateRangePicker
        value={period}
        presets={PERIOD_PRESETS}
        onChange={(v) => onChange({ preset: v.preset, from: v.from, to: v.to })}
        showSummary={false}
      />
      {students ? (
        <>
          <Select
            label="Fakultet:"
            value={state.faculty}
            onChange={(faculty) => onChange({ faculty })}
            placeholder="Hammasi"
            highlightActive
            options={(options?.faculties ?? []).map((f) => ({ value: f.id, label: `${f.name} (${f.count})` }))}
          />
          <Select
            label="Kurs:"
            value={state.course}
            onChange={(course) => onChange({ course })}
            placeholder="Hammasi"
            highlightActive
            options={courseOptions(options, state.faculty).map((c) => ({ value: String(c), label: `${c}-kurs` }))}
          />
          <Select
            label="Guruh:"
            value={state.group}
            onChange={(group) => onChange({ group })}
            placeholder="Hammasi"
            highlightActive
            options={groupOptions(options, state.faculty, state.course).map((g) => ({ value: g, label: g }))}
          />
        </>
      ) : (
        <>
          <Select
            label="Turi:"
            value={state.unitKind}
            onChange={(unitKind) => onChange({ unitKind })}
            placeholder="Hammasi"
            highlightActive
            options={(options?.unit_kinds ?? []).map((k) => ({ value: k.id, label: k.label }))}
          />
          <Select
            label="Bo'linma:"
            value={state.unit}
            onChange={(unit) => onChange({ unit })}
            placeholder="Hammasi"
            highlightActive
            className="sm:max-w-xs"
            options={unitOptions(options, state.unitKind).map((u) => ({ value: u.id, label: `${u.name} (${u.count})` }))}
          />
        </>
      )}
      <SearchInput value={query} onChange={setQuery} placeholder="F.I.Sh. bo'yicha qidirish" className="sm:w-56" />
    </Toolbar>
  );
}
