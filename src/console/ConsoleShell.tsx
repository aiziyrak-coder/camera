import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGroup, motion } from 'motion/react';
import { ChartColumn, Search } from 'lucide-react';
import { cn } from '../ui';
import { branding } from '../lib/branding';
import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { useLiveAttendance, useLiveEvents } from '../lib/realtime';
import { getKafedras, getOverview, type KafedraStat, type Overview } from '../lib/situationApi';
import { useCommandPaletteHotkey } from '../layouts/shell/useCommandPaletteHotkey';
import AlertsPanel from './panels/AlertsPanel';
import CamerasPanel from './panels/CamerasPanel';
import ControlPanel from './panels/ControlPanel';
import PeoplePanel from './panels/PeoplePanel';
import UnitsPanel from './panels/UnitsPanel';
import VerdictPanel from './panels/VerdictPanel';
import VitalsPanel from './panels/VitalsPanel';
import { visibleControlTabs, type ControlTabId } from './panels/controlTabs';
import ConsolePalette, { type PaletteTarget } from './ConsolePalette';
import ConsoleFilterBar from './ConsoleFilterBar';
import { useConsoleFilter } from './consoleFilter';
import { EASE } from './motion';

/**
 * KONSOL — institutning yagona boshqaruv oynasi.
 *
 * Bitta ekran, siljishsiz: yon menyu yo'q, sahifadan sahifaga
 * o'tilmaydi. Joy yetmasa panel KATTALASHADI (Panel.tsx), ya'ni
 * kontekst yo'qolmaydi. Hisobotlar — ataylab alohida sahifa: u
 * hujjat, konsol esa jonli holat.
 *
 * Filtr (sana va kim) URL'da — ko'rinishni havola qilib yuborish
 * mumkin, lekin marshrut o'zgarmagani uchun konsol qayta yuklanmaydi.
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
  const filter = useConsoleFilter();
  const { date, isToday, scope } = filter;
  const now = useClock();
  const { role } = useAuth();
  const { can } = usePermissions();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [controlTab, setControlTab] = useState<ControlTabId | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [units, setUnits] = useState<KafedraStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [data, kafedras] = await Promise.all([
          getOverview(date, { signal }),
          getKafedras(date, { signal }),
        ]);
        setOverview(data);
        setUnits(kafedras);
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError((err as Error).message);
      }
    },
    [date],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, pulse]);

  // Jonli xabar kelganda raqamlar yangilanadi. Ulanish HOLATI hodisalar
  // kanalidan olinadi — davomat kanali holat qaytarmaydi. O'tgan kunni
  // ko'rayotganda jonli yangilanish kerak emas — u kun o'zgarmaydi.
  useLiveAttendance(() => isToday && setPulse((n) => n + 1), true);
  const live = useLiveEvents(() => isToday && setPulse((n) => n + 1), true) === 'live' && isToday;

  // Ctrl/⌘+K — konsol palitrasi: bo'linma, shaxs, kamera va boshqaruv
  // bo'limlari. Tanlov MANZILNI emas, panelni ochadi.
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  useCommandPaletteHotkey(togglePalette);

  const controlTabs = useMemo(() => visibleControlTabs((key) => can(key, role), role), [can, role]);

  const openTarget = useCallback((target: PaletteTarget) => {
    if (target.tab) setControlTab(target.tab);
    setExpanded(target.panel);
  }, []);

  // Boshqaruv ro'yxatidagi sonlar — konsol allaqachon olgan ma'lumotdan
  // (qo'shimcha so'rov yo'q). O'lchanmagani ControlPanel'da chiziqcha.
  const counts = useMemo(
    () => ({
      people: overview ? overview.staff.total + overview.students.total : null,
      units: units ? units.length : null,
      cameras: overview ? overview.cameras.active : null,
      lessons: overview ? overview.lessons.total : null,
    }),
    [overview, units],
  );

  // Esc — yoyilgan panelni yopadi.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExpanded(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const arrivals = overview?.lastArrivals ?? [];

  return (
    <LayoutGroup>
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

        {/* Qidiruv — palitrani ochadi (Ctrl/⌘+K): bo'linma, shaxs,
            kamera va boshqaruv bo'limlari bitta joydan. Tanlov panelni
            ochadi, sahifaga o'tmaydi. */}
        <button
          type="button"
          onClick={togglePalette}
          className="glass glass-hover ms-2 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[5px] px-3 text-left sm:max-w-md"
        >
          <Search size={15} aria-hidden="true" className="shrink-0 text-subtle" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-subtle">Bo‘linma, shaxs yoki kamera</span>
          <kbd className="intel-code hidden shrink-0 border border-white/80 px-1.5 py-0.5 text-[10px] text-muted sm:inline">Ctrl K</kbd>
        </button>

        <span className="ms-auto flex items-center gap-3">
          <span className="intel-code hidden text-[13px] tabular-nums text-fg sm:block">{timeFormat.format(now)}</span>
          <span className={cn('flex items-center gap-1.5', live ? 'text-success' : 'text-subtle')}>
            <span className={cn('h-1.5 w-1.5 rounded-full bg-current', live && 'live-dot')} aria-hidden="true" />
            <span className="intel-micro !text-current">{live ? 'Jonli' : isToday ? 'Aloqa yo‘q' : 'Arxiv'}</span>
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

      {/* Filtr satri — uchala davomat paneli shu tanlovga bo'ysunadi. */}
      <ConsoleFilterBar filter={filter} />

      {/* Panellar maydoni — siljish yo'q, hammasi shu yerda. */}
      <motion.main
        className="console-grid relative z-10 grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2.5 px-3 pb-3 lg:grid-cols-4 lg:grid-rows-3"
      >
        <VerdictPanel
          overview={overview}
          scope={scope}
          date={date}
          live={live}
          failed={Boolean(error)}
          expanded={expanded === 'verdict'}
          onExpand={setExpanded}
          area="lg:col-span-1"
        />

        <UnitsPanel
          units={units}
          faculties={overview?.byFaculty ?? null}
          scope={scope}
          setScope={filter.setScope}
          date={date}
          expanded={expanded === 'units'}
          onExpand={setExpanded}
          area="col-span-2 lg:col-span-2 lg:row-span-2"
        />

        <PeoplePanel
          arrivals={arrivals}
          scope={scope}
          date={date}
          live={live}
          expanded={expanded === 'people'}
          onExpand={setExpanded}
          area="lg:col-span-1 lg:row-span-2"
        />

        {/* Hodisalar — yoyilganda hodisalar sahifasining o'zi. */}
        <AlertsPanel
          overview={overview}
          failed={Boolean(error)}
          pulse={pulse}
          live={live}
          expanded={expanded === 'alerts'}
          onExpand={setExpanded}
          area="lg:col-span-1"
        />

        <CamerasPanel
          expanded={expanded === 'cameras'}
          onExpand={setExpanded}
          area="lg:col-span-1"
        />

        {/* Tizim o'lchovlari — yoyilganda tizim holati kartalari. */}
        <VitalsPanel expanded={expanded === 'vitals'} onExpand={setExpanded} area="lg:col-span-1" />

        {/* Boshqaruv — mavjud sahifalar panel ichida, tab bo'lib. */}
        <ControlPanel
          counts={counts}
          expanded={expanded === 'control'}
          onExpand={setExpanded}
          activeTab={controlTab}
          onTab={setControlTab}
          area="col-span-2"
        />
      </motion.main>

      <footer className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 text-subtle">
        <span className="intel-micro">{date}</span>
        {error && <span className="intel-micro !text-danger">Ma’lumot olinmadi</span>}
        <span className="intel-micro ms-auto">Panelni bosing — kattalashadi · Ctrl+K — qidiruv · Esc — yopadi</span>
      </footer>

      <ConsolePalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        units={units ?? []}
        tabs={controlTabs}
        onOpen={openTarget}
      />
    </div>
    </LayoutGroup>
  );
}
