import { useEffect, useMemo, useState } from 'react';
import {
  POSITION_GROUP_LABEL,
  getOrgTree,
  type OrgTree,
  type PeopleStatusKey,
  type PersonType,
  type PositionGroup,
  type StatusCounts,
} from '../../lib/situationApi';
import { todayInTashkent } from '../../lib/uzDate';
import { IntelPanel, Select } from '../../ui';
import StatusCounters, { COUNTER_META, type CounterKey } from '../situation/StatusCounters';
import StatusPeopleTable from '../situation/StatusPeopleTable';
import CountPicker, { type CountOption } from '../situation/CountPicker';
import PdfButton from '../situation/PdfButton';

/**
 * Hisobot — institutning umumiy (jonli) holati. Nazoratdagi guruh ko'rinishi
 * bilan bir xil sanoqlar, lekin butun institut bo'yicha va filtrlar bilan:
 * fakultet, kurs, guruh, qidiruv, sana. Har son bosiladi — pastdagi ro'yxat
 * aynan o'sha odamlarni ko'rsatadi. Bugun bo'lsa har REFRESH_MS da yangilanadi.
 */

const REFRESH_MS = 30_000;
const KEYS: CounterKey[] = ['hammasi', 'kelgan', 'kech_keldi', 'kelmadi', 'kutilmoqda', 'malumot_yoq', 'yuzsiz'];
const FIELD: Record<string, keyof StatusCounts> = {
  hammasi: 'hammasi',
  kelgan: 'kelgan',
  kech_keldi: 'kechKeldi',
  kelmadi: 'kelmadi',
  kutilmoqda: 'kutilmoqda',
  malumot_yoq: 'malumotYoq',
  yuzsiz: 'yuzsiz',
};

/** Sahifaning umumiy filtri (HisobotPage, ReportFilters): sana, fakultet,
 *  kurs, guruh va ism qidiruvi hamma ko'rinishda bitta joyda — ilgari bu
 *  ko'rinishning o'z filtrlari bo'lib, boshqalarida boshqacha edi (2026-11-04). */
export interface StatusFilters {
  date: string;
  faculty: string;
  course: string;
  group: string;
  q: string;
}

export default function InstituteStatusView({ type, filters }: { type: PersonType; filters: StatusFilters }) {
  const { date, faculty, course, group } = filters;
  const search = filters.q;
  const [status, setStatus] = useState<CounterKey>('hammasi');
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [tick, setTick] = useState(0);
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [unit, setUnit] = useState('');
  const [positionGroup, setPositionGroup] = useState<PositionGroup | ''>('');
  const [position, setPosition] = useState('');
  const isToday = date === todayInTashkent();
  const students = type === 'talaba';

  useEffect(() => {
    if (students) return;
    const controller = new AbortController();
    getOrgTree(date, { signal: controller.signal }).then(setTree).catch(() => undefined);
    return () => controller.abort();
  }, [date, students]);

  const unitOptions = useMemo<CountOption[]>(() => {
    let section = '';
    return (tree?.units ?? [])
      .filter((u) => u.total > 0)
      .map((u) => {
        if (u.depth === 0) section = u.kindLabel;
        return { value: u.id, label: u.name, present: u.present, absent: u.absent + u.notYet, noData: u.noData, indent: u.depth, section };
      });
  }, [tree]);
  const positionOptions = useMemo<CountOption[]>(
    () =>
      (tree?.positions ?? [])
        .filter((p) => !positionGroup || p.group === positionGroup)
        .map((p) => ({ value: p.name, label: p.name, present: p.present, absent: p.absent + p.notYet, noData: p.noData })),
    [tree, positionGroup],
  );

  useEffect(() => {
    if (!isToday) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isToday]);

  const query = {
    date,
    type,
    facultyId: faculty || undefined,
    course: course ? Number(course) : undefined,
    group: students ? group || undefined : undefined,
    orgUnitId: !students ? unit || undefined : undefined,
    positionGroup: !students ? positionGroup || undefined : undefined,
    position: !students ? position || undefined : undefined,
    search: search.trim() || undefined,
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!students && (
        <div className="print-hide flex flex-wrap items-center gap-2 border border-border bg-surface px-3 py-2">
          <CountPicker label="Tuzilma" value={unit} onChange={setUnit} options={unitOptions} />
          <Select
            label="Toifa"
            value={positionGroup}
            onChange={(v) => { setPositionGroup(v as PositionGroup | ''); setPosition(''); }}
            options={(Object.keys(POSITION_GROUP_LABEL) as PositionGroup[]).map((k) => ({
              value: k,
              label: `${POSITION_GROUP_LABEL[k]} (${tree?.positionGroups[k] ?? 0})`,
            }))}
            placeholder="hammasi"
            size="sm"
            highlightActive
          />
          <CountPicker label="Lavozim" value={position} onChange={setPosition} options={positionOptions} />
        </div>
      )}

      <IntelPanel
        title={students ? 'Talabalar — umumiy holat' : 'Xodimlar — umumiy holat'}
        right={
          <span className="print-hide flex items-center gap-2">
            {isToday && <span className="text-[11px] font-semibold text-success">● jonli</span>}
            <PdfButton path="/api/situation/pdf/people" params={{ ...query, status }} filename={`${type}-${status}-${date}`} />
            {!students && (
              <PdfButton path="/api/situation/pdf/tuzilma" params={{ date }} filename={`tuzilma-${date}`} label="Tuzilma PDF" />
            )}
          </span>
        }
      >
        <StatusCounters
          items={KEYS.map((key) => ({ key, value: counts ? counts[FIELD[key]] : null }))}
          active={status}
          onPick={setStatus}
        />
      </IntelPanel>

      <IntelPanel title={COUNTER_META[status].label} code={counts ? `${counts[FIELD[status]]} ta` : undefined}>
        <StatusPeopleTable
          query={query}
          status={status as PeopleStatusKey}
          refreshKey={tick}
          onLoaded={(page) => setCounts(page.counts)}
        />
      </IntelPanel>
    </div>
  );
}
