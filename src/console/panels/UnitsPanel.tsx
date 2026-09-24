import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { cn, nextSort, sortRows, type SortState } from '../../ui';
import { RAG_LETTER, RAG_SOLID, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import {
  getGroups,
  getKafedra,
  type FacultyCounts,
  type GroupStat,
  type KafedraStat,
  type KafedraTeacher,
} from '../../lib/situationApi';
import { hhmm, unitKindLabel } from '../../lib/teachersApi';
import { attendanceMeta } from '../../ui/status';
import Panel from '../Panel';
import { EASE, reducedMotion } from '../motion';
import { filterUnits, pct, rowsForScope, staffUnitRows, studentUnitRows, worstFirst, type UnitRow } from '../attendance';
import { SCOPES, SCOPE_LABEL, type Scope } from '../consoleFilter';

/**
 * BO'LINMALAR paneli — "qayerda muammo bor?" degan savolga javob.
 *
 * Yig'ilgan holatda ro'yxat ataylab YOMONI BIRINCHI: rahbar eng past
 * bo'linmani izlab pastga tushmasin. Kattalashtirilganda o'sha ro'yxat
 * to'liq ochiladi — qidiruv, xodim/talaba almashtirgichi va tartiblanadigan
 * ustunlar bilan.
 *
 * Bo'linma bosilganda uning ichidagilar SHU PANEL ichida ochiladi:
 * sahifa almashmaydi, konsoldan chiqilmaydi (konsolning asosiy qoidasi).
 * Orqaga qaytish — "Orqaga" tugmasi yoki Esc.
 */

const COLLAPSED_ROWS = 7;

/** Ulush ustuni — faqat `transform` bilan cho'ziladi. */
function RateBar({ rate, tone, delay = 0 }: { rate: number | null; tone: ReturnType<typeof rag>; delay?: number }) {
  const still = reducedMotion();
  return (
    <span className="block h-1 w-full overflow-hidden rounded-[1px] bg-slate-900/10">
      <motion.span
        className={cn('block h-full w-full origin-left rounded-[1px]', RAG_SOLID[tone])}
        initial={still ? false : { scaleX: 0 }}
        animate={{ scaleX: rate === null ? 0 : Math.min(1, Math.max(0, rate / 100)) }}
        transition={{ duration: still ? 0 : 0.55, ease: EASE, delay: still ? 0 : delay }}
      />
    </span>
  );
}

function UnitLine({
  row,
  index,
  onOpen,
  showKind,
}: {
  row: UnitRow;
  index: number;
  onOpen?: (row: UnitRow) => void;
  showKind?: boolean;
}) {
  const tone = rag(row.rate, RATE_RAG);
  const content = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.name}</span>
        {showKind && <span className="intel-micro hidden shrink-0 sm:block">{row.kindLabel}</span>}
        <span className="intel-code shrink-0 text-[11px] text-subtle">
          {row.present}/{row.total}
        </span>
        <span className={cn('intel-code w-11 shrink-0 text-end text-[13px] font-semibold', RAG_TEXT[tone])}>
          {pct(row.rate)}
        </span>
        <span className={cn('intel-code w-3 shrink-0 text-end text-[11px] font-bold', RAG_TEXT[tone])}>
          {RAG_LETTER[tone]}
        </span>
        {onOpen && <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-subtle" />}
      </div>
      <div className="mt-1">
        <RateBar rate={row.rate} tone={tone} delay={Math.min(index * 0.03, 0.35)} />
      </div>
    </>
  );

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: Math.min(index * 0.025, 0.3) }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="w-full px-3 py-1.5 text-start hover:bg-white/70"
          aria-label={`${row.name} — ichini ochish`}
        >
          {content}
        </button>
      ) : (
        <div className="px-3 py-1.5">{content}</div>
      )}
    </motion.li>
  );
}

/** Kattalashtirilganda: bo'linma ichi (kafedra xodimlari yoki fakultet guruhlari). */
function UnitInside({ row, date, onBack }: { row: UnitRow; date: string; onBack: () => void }) {
  const [teachers, setTeachers] = useState<KafedraTeacher[] | null>(null);
  const [groups, setGroups] = useState<GroupStat[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTeachers(null);
    setGroups(null);
    setError(false);
    const fail = (err: unknown) => {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(true);
    };
    if (row.type === 'xodim' && row.id) {
      getKafedra(row.id, { date }, { signal: controller.signal })
        .then((detail) => setTeachers(detail.teachers))
        .catch(fail);
    } else {
      // Fakultetsiz (id null) guruhlarni serverda filtrlab bo'lmaydi —
      // ro'yxat olinib, mijozda o'sha fakultet bo'yicha ajratiladi.
      getGroups(row.id ? { date, facultyId: row.id } : { date }, { signal: controller.signal })
        .then((list) => setGroups(list.filter((group) => group.facultyId === row.id)))
        .catch(fail);
    }
    return () => controller.abort();
  }, [row.id, row.type, date]);

  const tone = rag(row.rate, RATE_RAG);
  const rows: Array<{ key: string; title: string; note: string; rate: number | null; letter: string }> = teachers
    ? teachers.map((teacher) => ({
        key: teacher.id,
        title: teacher.fullName,
        note: `${teacher.position || '—'} · ${attendanceMeta(teacher.status).label}${teacher.checkIn ? ` ${hhmm(teacher.checkIn)}` : ''}`,
        rate: teacher.onTimeRate,
        letter: RAG_LETTER[rag(teacher.onTimeRate, RATE_RAG)],
      }))
    : groups
      ? worstFirst(
          groups.map((group) => ({
            key: `g:${group.name}`,
            id: group.name,
            name: group.name,
            type: 'talaba' as const,
            kindLabel: 'Guruh',
            rate: group.rate,
            present: group.present,
            late: group.late,
            absent: group.absent,
            total: group.total,
            notYet: group.notYet,
            noData: group.noData,
            dayOff: group.dayOff,
          })),
        ).map((group) => ({
          key: group.key,
          title: group.name,
          note: `${group.present} / ${group.total} talaba`,
          rate: group.rate,
          letter: RAG_LETTER[rag(group.rate, RATE_RAG)],
        }))
      : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/70 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="glass glass-hover flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[12px]"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Orqaga
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.name}</span>
        <span className="intel-micro">{row.kindLabel}</span>
        <span className={cn('intel-code text-[14px] font-semibold', RAG_TEXT[tone])}>{pct(row.rate)}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((item, index) => {
          const itemTone = rag(item.rate, RATE_RAG);
          return (
            <motion.li
              key={item.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE, delay: Math.min(index * 0.02, 0.3) }}
              className="flex items-center gap-2 border-b border-white/60 px-3 py-1.5 last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{item.title}</span>
                <span className="block truncate text-[11px] text-muted">{item.note}</span>
              </span>
              <span className={cn('intel-code w-11 text-end text-[12.5px] font-semibold', RAG_TEXT[itemTone])}>
                {pct(item.rate)}
              </span>
              <span className={cn('intel-code w-3 text-end text-[11px] font-bold', RAG_TEXT[itemTone])}>{item.letter}</span>
            </motion.li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-[12px] text-subtle">
            {error ? 'Ma’lumot olinmadi' : teachers || groups ? 'Ro‘yxat bo‘sh' : 'Yuklanmoqda…'}
          </li>
        )}
      </ul>
    </div>
  );
}

const COLUMNS: Array<{ key: string; label: string; value: (row: UnitRow) => number | string | null; firstDir: 'asc' | 'desc'; className: string }> = [
  { key: 'name', label: 'Nomi', value: (row) => row.name, firstDir: 'asc', className: 'flex-1 text-start' },
  { key: 'present', label: 'Keldi', value: (row) => row.present, firstDir: 'desc', className: 'w-16 text-end' },
  { key: 'total', label: 'Jami', value: (row) => row.total, firstDir: 'desc', className: 'w-14 text-end' },
  { key: 'rate', label: 'Foiz', value: (row) => row.rate, firstDir: 'asc', className: 'w-16 text-end' },
];

export interface UnitsPanelProps {
  units: KafedraStat[] | null;
  faculties: FacultyCounts[] | null;
  scope: Scope;
  setScope: (scope: Scope) => void;
  date: string;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
  /** Tashqaridan (Ctrl+K) "shu bo'linma ichini och" so'rovi. */
  openRequest?: { id: string; nonce: number } | null;
}

export default function UnitsPanel({ units, faculties, scope, setScope, date, expanded, onExpand, area, openRequest = null }: UnitsPanelProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [open, setOpen] = useState<UnitRow | null>(null);

  const rows = useMemo(() => {
    const staff = staffUnitRows(units, unitKindLabel);
    const students = studentUnitRows(faculties);
    return worstFirst(rowsForScope(staff, students, scope));
  }, [units, faculties, scope]);

  // Panel yopilganda ichki holat tozalanadi — qayta ochilganda
  // ro'yxat boshidan boshlanadi (yarim ochiq holat qolmaydi).
  useEffect(() => {
    if (!expanded) {
      setOpen(null);
      setQuery('');
    }
  }, [expanded]);

  useEffect(() => {
    if (!openRequest) return;
    const staff = staffUnitRows(units, unitKindLabel);
    const found = staff.find((row) => row.id === openRequest.id);
    if (found) setOpen(found);
    // Faqat yangi so'rovda — ro'yxat yangilanishi ochiq bo'linmani almashtirmasin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  const visible = useMemo(() => {
    const found = filterUnits(rows, query);
    if (!sort) return found;
    const column = COLUMNS.find((col) => col.key === sort.key);
    return column ? sortRows(found, column.value, sort.dir) : found;
  }, [rows, query, sort]);

  const showKind = scope === 'hammasi';

  return (
    <Panel
      id="units"
      title="Bo'linmalar"
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={<span className="intel-code text-[11px] text-muted">{rows.length}</span>}
      full={
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key="inside"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="h-full"
            >
              <UnitInside row={open} date={date} onBack={() => setOpen(null)} />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/70 px-3 py-2">
                <label className="glass flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[4px] px-2.5 sm:max-w-xs">
                  <Search size={14} aria-hidden="true" className="shrink-0 text-subtle" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Bo'linma nomi"
                    aria-label="Bo'linma qidirish"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
                  />
                </label>
                <div className="flex items-center gap-1" role="group" aria-label="Kim">
                  {SCOPES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setScope(item)}
                      aria-pressed={scope === item}
                      className={cn(
                        'h-8 rounded-[4px] px-2.5 text-[12px] transition-colors',
                        scope === item ? 'bg-primary text-primary-fg' : 'glass glass-hover',
                      )}
                    >
                      {SCOPE_LABEL[item]}
                    </button>
                  ))}
                </div>
                <span className="intel-micro ms-auto">{visible.length} ta</span>
              </div>

              <div className="flex shrink-0 items-center gap-2 border-b border-white/60 px-3 py-1">
                {COLUMNS.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => setSort((current) => nextSort(current, column.key, column.firstDir))}
                    className={cn(
                      'intel-micro shrink-0 hover:!text-fg',
                      column.className,
                      sort?.key === column.key && '!text-fg',
                    )}
                  >
                    {column.label}
                    {sort?.key === column.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ))}
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                {visible.map((row, index) => (
                  <UnitLine key={row.key} row={row} index={index} onOpen={setOpen} showKind={showKind} />
                ))}
                {visible.length === 0 && (
                  <li className="px-3 py-8 text-center text-[12px] text-subtle">
                    {rows.length === 0 ? 'Ma’lumot yo‘q' : 'Topilmadi'}
                  </li>
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      }
    >
      <ul className="h-full overflow-hidden py-1">
        {worstFirst(rows)
          .slice(0, COLLAPSED_ROWS)
          .map((row, index) => (
            <UnitLine key={row.key} row={row} index={index} showKind={showKind} />
          ))}
        {rows.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-subtle">Ma’lumot yo‘q</li>}
      </ul>
    </Panel>
  );
}
