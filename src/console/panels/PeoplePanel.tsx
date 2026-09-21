import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Search } from 'lucide-react';
import { Avatar, cn } from '../../ui';
import { attendanceMeta } from '../../ui/status';
import { RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { getPerson, type LastArrival, type PersonProfile } from '../../lib/situationApi';
import { getTeachersDay, hhmm, searchPeople } from '../../lib/teachersApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { addDays, UZ_WEEKDAYS_SHORT, weekdayIndex } from '../../lib/uzDate';
import type { StudentStaffRecord } from '../../types';
import Panel from '../Panel';
import { EASE, rowIn } from '../motion';
import { pct } from '../attendance';
import { includesStaff, includesStudents, type Scope } from '../consoleFilter';

/**
 * ODAMLAR paneli — konsolning "nafasi".
 *
 * Yig'ilgan holatda bugungi kelganlar oqimi: eng yangisi tepada, har
 * qator umumiy `rowIn` harakati bilan kiradi. Ro'yxat ataylab KESILGAN —
 * konsolda siljish yo'q, shuning uchun panel o'lchamiga sig'adigani
 * ko'rsatiladi, qolgani kattalashtirilganda ochiladi.
 *
 * Kattalashtirilganda — xodim va talabalar bo'ylab qidiruv. Odam
 * tanlansa, uning oxirgi kunlari SHU PANEL ichida ochiladi: sahifa
 * almashmaydi.
 */

const COLLAPSED_ROWS = 8;
const RECENT_DAYS = 14;
const MIN_QUERY = 2;

/** Bugungi holat: kelganlar oqimidan va (xodimlar uchun) kun ro'yxatidan. */
interface DayStatus {
  status: string;
  time: string | null;
}

function ArrivalRow({ arrival }: { arrival: LastArrival }) {
  const meta = attendanceMeta(arrival.status);
  return (
    <motion.li
      layout="position"
      variants={rowIn}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex items-center gap-2 border-b border-white/60 px-3 py-1.5 last:border-0"
    >
      <Avatar name={arrival.fullName} src={arrival.photoUrl} size="xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px]">{arrival.fullName}</span>
        <span className="block truncate text-[10.5px] text-muted">{arrival.unit}</span>
      </span>
      <span className={cn('intel-micro shrink-0', meta.tone === 'warning' && '!text-warning')}>{meta.label}</span>
      <span className="intel-code shrink-0 text-[11px] text-muted">{hhmm(arrival.time)}</span>
    </motion.li>
  );
}

/** Tanlangan odamning oxirgi kunlari — panel ichida. */
function PersonInside({ id, date, onBack }: { id: string; date: string; onBack: () => void }) {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError(false);
    getPerson(id, { from: addDays(date, -(RECENT_DAYS - 1)), to: date }, { signal: controller.signal })
      .then(setProfile)
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(true);
      });
    return () => controller.abort();
  }, [id, date]);

  const days = useMemo(() => [...(profile?.calendar ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [profile]);
  const tone = rag(profile?.totals.rate ?? null, RATE_RAG);

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
        {profile && <Avatar name={profile.person.fullName} src={profile.person.photoUrl} size="sm" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{profile?.person.fullName ?? 'Yuklanmoqda…'}</span>
          <span className="block truncate text-[11px] text-muted">
            {profile ? `${profile.person.unit}${profile.person.group ? ` · ${profile.person.group}` : ''}` : ''}
          </span>
        </span>
        <span className={cn('intel-code text-[16px] font-semibold', RAG_TEXT[tone])}>
          {pct(profile?.totals.rate ?? null)}
        </span>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {days.map((day, index) => {
          const meta = attendanceMeta(day.status);
          return (
            <motion.li
              key={day.date}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE, delay: Math.min(index * 0.02, 0.24) }}
              className="flex items-center gap-2 border-b border-white/60 px-3 py-1.5 last:border-0"
            >
              <span className="intel-code w-[86px] shrink-0 text-[12px]">{day.date}</span>
              <span className="intel-micro w-8 shrink-0">
                {UZ_WEEKDAYS_SHORT[weekdayIndex(day.date.slice(0, 7), Number(day.date.slice(8, 10)))]}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[12px]',
                  meta.tone === 'success' && 'text-success',
                  meta.tone === 'warning' && 'text-warning',
                  meta.tone === 'danger' && 'text-danger',
                  meta.tone === 'neutral' && 'text-subtle',
                )}
              >
                {meta.label}
              </span>
              <span className="intel-code shrink-0 text-[11px] text-muted">{hhmm(day.checkIn)}</span>
            </motion.li>
          );
        })}
        {days.length === 0 && (
          <li className="px-3 py-8 text-center text-[12px] text-subtle">
            {error ? 'Ma’lumot olinmadi' : profile ? 'Kun yo‘q' : 'Yuklanmoqda…'}
          </li>
        )}
      </ul>
    </div>
  );
}

export interface PeoplePanelProps {
  arrivals: LastArrival[];
  scope: Scope;
  date: string;
  live: boolean;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}

export default function PeoplePanel({ arrivals, scope, date, live, expanded, onExpand, area }: PeoplePanelProps) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<StudentStaffRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [staffDay, setStaffDay] = useState<Record<string, DayStatus>>({});
  const debounced = useDebouncedValue(query.trim(), 250);

  const feed = useMemo(
    () =>
      arrivals.filter((arrival) =>
        arrival.type === 'xodim' ? includesStaff(scope) : includesStudents(scope),
      ),
    [arrivals, scope],
  );

  // Panel yopilsa — qidiruv holati tozalanadi.
  useEffect(() => {
    if (!expanded) {
      setQuery('');
      setFound(null);
      setOpenId(null);
    }
  }, [expanded]);

  // Qidiruv faqat panel ochiq bo'lganda ishlaydi — yopiq panel so'rov yubormaydi.
  useEffect(() => {
    if (!expanded || debounced.length < MIN_QUERY) {
      setFound(null);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setFailed(false);
    searchPeople(debounced, 12, { signal: controller.signal })
      .then(setFound)
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setFound(null);
        setFailed(true);
      });
    return () => controller.abort();
  }, [expanded, debounced]);

  // Xodimlarning BUGUNGI holati — bitta qo'shimcha so'rov (talabalarda
  // bunday kunlik qidiruv endpointi yo'q; ularniki odam tanlanganda
  // profilidan ko'rinadi).
  useEffect(() => {
    if (!expanded || debounced.length < MIN_QUERY) {
      setStaffDay({});
      return;
    }
    const controller = new AbortController();
    getTeachersDay({ date, search: debounced }, { signal: controller.signal })
      .then((rows) => {
        const map: Record<string, DayStatus> = {};
        for (const row of rows) map[row.id] = { status: row.attendanceStatus ?? 'nomalum', time: row.firstSeen };
        setStaffDay(map);
      })
      .catch(() => setStaffDay({}));
    return () => controller.abort();
  }, [expanded, debounced, date]);

  const statusById = useMemo(() => {
    const map: Record<string, DayStatus> = { ...staffDay };
    for (const arrival of arrivals) map[arrival.id] = { status: arrival.status, time: arrival.time };
    return map;
  }, [staffDay, arrivals]);

  const results = useMemo(
    () =>
      (found ?? []).filter((person) =>
        person.type === 'xodim' ? includesStaff(scope) : includesStudents(scope),
      ),
    [found, scope],
  );

  return (
    <Panel
      id="people"
      title="Odamlar"
      live={live}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={<span className="intel-code text-[11px] text-muted">{feed.length}</span>}
      full={
        <AnimatePresence mode="wait" initial={false}>
          {openId ? (
            <motion.div
              key="person"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="h-full"
            >
              <PersonInside id={openId} date={date} onBack={() => setOpenId(null)} />
            </motion.div>
          ) : (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-white/70 px-3 py-2">
                <label className="glass flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[4px] px-2.5 sm:max-w-sm">
                  <Search size={14} aria-hidden="true" className="shrink-0 text-subtle" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Xodim yoki talaba"
                    aria-label="Odam qidirish"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
                  />
                </label>
                <span className="intel-micro ms-auto">{date}</span>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {(debounced.length < MIN_QUERY ? feed : []).map((arrival) => (
                    <ArrivalRow key={arrival.id} arrival={arrival} />
                  ))}
                </AnimatePresence>
                {debounced.length >= MIN_QUERY &&
                  results.map((person, index) => {
                    const day = statusById[person.id];
                    const meta = attendanceMeta(day?.status);
                    return (
                      <motion.li
                        key={person.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: EASE, delay: Math.min(index * 0.02, 0.24) }}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId(person.id)}
                          className="flex w-full items-center gap-2 border-b border-white/60 px-3 py-1.5 text-start hover:bg-white/70"
                        >
                          <Avatar name={person.fullName} src={person.biometricPhotoUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px]">{person.fullName}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {person.type === 'talaba' ? 'Talaba' : 'Xodim'} · {person.groupOrPosition || person.faculty}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-[11.5px]',
                              !day && 'text-subtle',
                              meta.tone === 'success' && 'text-success',
                              meta.tone === 'warning' && 'text-warning',
                              meta.tone === 'danger' && 'text-danger',
                            )}
                          >
                            {day ? meta.label : "O'lchanmagan"}
                          </span>
                          <span className="intel-code w-10 shrink-0 text-end text-[11px] text-muted">
                            {hhmm(day?.time)}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}

                {debounced.length >= MIN_QUERY && results.length === 0 && (
                  <li className="px-3 py-8 text-center text-[12px] text-subtle">
                    {failed ? 'Qidiruv ishlamadi' : found ? 'Topilmadi' : 'Qidirilmoqda…'}
                  </li>
                )}
                {debounced.length < MIN_QUERY && feed.length === 0 && (
                  <li className="px-3 py-8 text-center text-[12px] text-subtle">Hali hech kim kelmadi</li>
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      }
    >
      <ul className="h-full overflow-hidden">
        <AnimatePresence initial={false}>
          {feed.slice(0, COLLAPSED_ROWS).map((arrival) => (
            <ArrivalRow key={arrival.id} arrival={arrival} />
          ))}
        </AnimatePresence>
        {feed.length === 0 && <li className="px-3 pt-6 text-center text-[12px] text-subtle">Hali hech kim kelmadi</li>}
      </ul>
    </Panel>
  );
}
