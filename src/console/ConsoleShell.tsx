import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChartColumn, Search } from 'lucide-react';
import { cn } from '../ui';
import { RAG_LETTER, RAG_SOLID, RAG_TEXT, RATE_RAG, rag } from '../ui/rag';
import { branding } from '../lib/branding';
import { useLiveAttendance, useLiveEvents } from '../lib/realtime';
import { getKafedras, getOverview, type KafedraStat, type Overview } from '../lib/situationApi';
import { useViewDate } from '../lib/viewDate';
import Panel, { BigNumber } from './Panel';
import { EASE, rowIn, stagger } from './motion';

/**
 * KONSOL — institutning yagona boshqaruv oynasi.
 *
 * Bitta ekran, siljishsiz: yon menyu yo'q, sahifadan sahifaga
 * o'tilmaydi. Joy yetmasa panel KATTALASHADI (Panel.tsx), ya'ni
 * kontekst yo'qolmaydi. Hisobotlar — ataylab alohida sahifa: u
 * hujjat, konsol esa jonli holat.
 */

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => setNow(new Date());
    const start = () => {
      tick();
      timer = window.setInterval(tick, 1000);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    // Ko'rinmayotgan oynada soat yurmaydi — bekorga ishlamasin.
    const onVisibility = () => (document.hidden ? stop() : start());
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return now;
}

const timeFormat = new Intl.DateTimeFormat('uz-UZ', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Tashkent',
});

export default function ConsoleShell() {
  const { today } = useViewDate();
  const now = useClock();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [units, setUnits] = useState<KafedraStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [data, kafedras] = await Promise.all([
          getOverview(today, { signal }),
          getKafedras(today, { signal }),
        ]);
        setOverview(data);
        setUnits(kafedras);
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError((err as Error).message);
      }
    },
    [today],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, pulse]);

  // Jonli xabar kelganda raqamlar yangilanadi. Ulanish HOLATI hodisalar
  // kanalidan olinadi — davomat kanali holat qaytarmaydi.
  useLiveAttendance(() => setPulse((n) => n + 1), true);
  const live = useLiveEvents(() => setPulse((n) => n + 1), true) === 'live';

  const headline = useMemo(() => {
    const rate = overview?.staff.rate ?? null;
    return { rate, tone: rag(rate, RATE_RAG) };
  }, [overview]);

  const board = useMemo(() => {
    const list = (units ?? []).map((unit) => ({
      id: unit.id ?? unit.name,
      name: unit.name,
      rate: unit.rate,
      total: unit.staffTotal,
      present: unit.present,
    }));
    const order = { qizil: 0, sariq: 1, yashil: 2, yoq: 3 } as const;
    return list.sort((a, b) => order[rag(a.rate, RATE_RAG)] - order[rag(b.rate, RATE_RAG)] || (a.rate ?? 101) - (b.rate ?? 101));
  }, [units]);

  const found = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return board.filter((unit) => unit.name.toLowerCase().includes(text)).slice(0, 8);
  }, [board, query]);

  // Esc — yoyilgan panelni yopadi.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExpanded(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const arrivals = overview?.lastArrivals ?? [];

  return (
    <div className="console-root flex flex-col text-fg">
      {/* Boshqaruv satri — yon menyu o'rnini bosadi. */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative z-20 flex shrink-0 items-center gap-3 px-4 py-2.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-primary text-[11px] font-bold text-primary-fg">
            FI
          </span>
          <span className="intel-micro hidden truncate sm:block">{branding.orgFullName}</span>
        </span>

        <label className="glass relative ms-2 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[5px] px-3 sm:max-w-md">
          <Search size={15} aria-hidden="true" className="shrink-0 text-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Bo'linma, guruh yoki odam"
            aria-label="Qidiruv"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
          <AnimatePresence>
            {found.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="glass absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[5px] py-1"
              >
                {found.map((unit) => (
                  <li key={unit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setExpanded('units');
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/70"
                    >
                      <span className={cn('h-2 w-2 rounded-[1px]', RAG_SOLID[rag(unit.rate, RATE_RAG)])} />
                      <span className="min-w-0 flex-1 truncate">{unit.name}</span>
                      <span className="intel-code text-[12px] text-muted">
                        {unit.rate === null ? '—' : `${Math.round(unit.rate)}%`}
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </label>

        <span className="ms-auto flex items-center gap-3">
          <span className="intel-code hidden text-[13px] tabular-nums text-fg sm:block">{timeFormat.format(now)}</span>
          <span className={cn('flex items-center gap-1.5', live ? 'text-success' : 'text-subtle')}>
            <span className={cn('h-1.5 w-1.5 rounded-full bg-current', live && 'live-dot')} aria-hidden="true" />
            <span className="intel-micro !text-current">{live ? 'Jonli' : 'Aloqa yo‘q'}</span>
          </span>
          <Link
            to="/hisobotlar"
            className="glass glass-hover flex h-9 items-center gap-1.5 rounded-[5px] px-3 text-[13px]"
          >
            <ChartColumn size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Hisobotlar</span>
          </Link>
        </span>
      </motion.header>

      {/* Panellar maydoni — siljish yo'q, hammasi shu yerda. */}
      <motion.main
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 grid min-h-0 flex-1 grid-cols-2 grid-rows-[auto_1fr_1fr] gap-2.5 px-3 pb-3 lg:grid-cols-4 lg:grid-rows-2"
      >
        <Panel
          id="verdict"
          title="Umumiy holat"
          live={live}
          expanded={expanded === 'verdict'}
          onExpand={setExpanded}
          area="col-span-2 lg:col-span-1"
          badge={
            <span className={cn('intel-code text-[11px] font-bold', RAG_TEXT[headline.tone])}>
              {RAG_LETTER[headline.tone]}
            </span>
          }
        >
          <BigNumber
            value={headline.rate === null ? '—' : `${Math.round(headline.rate * 10) / 10}%`}
            tone={RAG_TEXT[headline.tone]}
            sub={
              overview
                ? `${overview.staff.present} / ${overview.staff.total} xodim · ${overview.students.present} / ${overview.students.total} talaba`
                : 'yuklanmoqda…'
            }
          />
        </Panel>

        <Panel
          id="units"
          title="Bo'linmalar"
          expanded={expanded === 'units'}
          onExpand={setExpanded}
          area="col-span-2 lg:col-span-2 lg:row-span-2"
          badge={<span className="intel-code text-[11px] text-muted">{board.length}</span>}
          full={<UnitList items={board} limit={200} />}
        >
          <UnitList items={board} limit={7} />
        </Panel>

        <Panel
          id="stream"
          title="Kelganlar"
          live={live}
          expanded={expanded === 'stream'}
          onExpand={setExpanded}
          area="col-span-2 lg:col-span-1 lg:row-span-2"
          badge={<span className="intel-code text-[11px] text-muted">{arrivals.length}</span>}
        >
          <ul className="h-full overflow-hidden px-3 py-2">
            <AnimatePresence initial={false}>
              {arrivals.slice(0, 9).map((arrival) => (
                <motion.li
                  key={arrival.id}
                  variants={rowIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex items-center gap-2 border-b border-white/60 py-1.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">{arrival.fullName}</span>
                  <span className="intel-code text-[11px] text-muted">{arrival.time}</span>
                </motion.li>
              ))}
            </AnimatePresence>
            {arrivals.length === 0 && (
              <li className="pt-6 text-center text-[12px] text-subtle">Hali hech kim kelmadi</li>
            )}
          </ul>
        </Panel>

        <Panel
          id="cameras"
          title="Kameralar"
          live={live}
          expanded={expanded === 'cameras'}
          onExpand={setExpanded}
          area="col-span-2 lg:col-span-1"
          badge={
            overview ? (
              <span className="intel-code text-[11px] text-muted">
                {overview.cameras.online}/{overview.cameras.active}
              </span>
            ) : null
          }
        >
          <BigNumber
            value={overview ? overview.cameras.videoFlowing : '—'}
            sub={overview ? 'kamera tasvir uzatmoqda' : 'yuklanmoqda…'}
          />
        </Panel>
      </motion.main>

      <footer className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 text-subtle">
        <span className="intel-micro">{today}</span>
        {error && <span className="intel-micro !text-danger">Ma’lumot olinmadi</span>}
        <span className="intel-micro ms-auto">Panelni bosing — kattalashadi · Esc — yopadi</span>
      </footer>
    </div>
  );
}

/** Bo'linmalar ro'yxati — panelda ham, yoyilganda ham bir xil. */
function UnitList({
  items,
  limit,
}: {
  items: { id: string; name: string; rate: number | null; total: number; present: number }[];
  limit: number;
}) {
  if (items.length === 0) {
    return <p className="px-3 py-6 text-center text-[12px] text-subtle">Ma’lumot yo‘q</p>;
  }
  return (
    <ul className="grid h-full grid-cols-1 content-start gap-px overflow-hidden lg:grid-cols-2">
      {items.slice(0, limit).map((unit, index) => {
        const tone = rag(unit.rate, RATE_RAG);
        return (
          <motion.li
            key={unit.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: Math.min(index * 0.02, 0.3) }}
            className="flex items-center gap-2.5 px-3 py-1.5"
          >
            <span aria-hidden="true" className={cn('h-6 w-[3px] shrink-0 rounded-[1px]', RAG_SOLID[tone])} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{unit.name}</span>
            <span className="intel-code text-[11px] text-subtle">
              {unit.present}/{unit.total}
            </span>
            <span className={cn('intel-code w-12 text-end text-[13px] font-semibold', RAG_TEXT[tone])}>
              {unit.rate === null ? '—' : `${Math.round(unit.rate)}%`}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
