import { motion } from 'motion/react';
import { Aperture, Cctv, Command, Sparkles } from 'lucide-react';
import { CountUp, cn } from '../ui';
import { RAG_LABEL, RAG_LETTER, RAG_TEXT, RATE_RAG, rag } from '../ui/rag';
import type { Overview } from '../lib/situationApi';
import type { Scope } from './consoleFilter';
import { scopeCounts, pct } from './attendance';
import { EASE } from './motion';

/** Konsol markazidagi bir qarashlik, jonli holat. */
export default function ConsoleHero({ overview, scope, date, live, onOpenCameras, onSearch }: {
  overview: Overview | null;
  scope: Scope;
  date: string;
  live: boolean;
  onOpenCameras: () => void;
  onSearch: () => void;
}) {
  const counts = scopeCounts(overview, scope);
  const tone = rag(counts.rate, RATE_RAG);
  const cameraText = overview ? `${overview.cameras.online}/${overview.cameras.active}` : '—';
  return (
    <section className="console-hero relative z-10 mx-3 mb-2 overflow-hidden" aria-label="Operatsion markaz holati">
      <div className="console-orbit console-orbit-a" aria-hidden="true" />
      <div className="console-orbit console-orbit-b" aria-hidden="true" />
      <div className="console-hero-noise" aria-hidden="true" />
      <div className="relative flex h-full min-w-0 items-center gap-3 px-4 py-2.5 sm:px-5">
        <motion.div initial={{ opacity: 0, scale: 0.84 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.62, ease: EASE }} className={cn('console-score-ring shrink-0', RAG_TEXT[tone])}>
          <span className="console-score-value"><CountUp value={pct(counts.rate)} /></span><span className="console-score-unit">%</span>
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="console-eyebrow"><Sparkles size={11} aria-hidden="true" /> TERRANOVA / LIVE COMMAND</span>
            <span className={cn('console-live-label', live ? 'is-live' : '')}><i aria-hidden="true" /> {live ? 'JONLI' : date}</span>
          </div>
          <h1 className="console-hero-title">Institut <em>nazoratida</em></h1>
          <p className="console-hero-subtitle"><strong className={RAG_TEXT[tone]}>{RAG_LABEL[tone]}</strong><span aria-hidden="true">·</span><span>{counts.present} keldi</span><span aria-hidden="true">·</span><span>{counts.absent} kelmadi</span></p>
        </div>
        <div className="hidden shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-white/70 bg-white/55 shadow-[0_12px_30px_-22px_rgb(15_23_42/0.8)] md:grid">
          <Readout icon={Aperture} label="SIGNAL" value={RAG_LETTER[tone]} tone={RAG_TEXT[tone]} />
          <Readout icon={Cctv} label="KAMERA" value={cameraText} />
        </div>
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button type="button" className="console-hero-action" onClick={onSearch}><Command size={14} aria-hidden="true" /> Qidiruv</button>
          <button type="button" className="console-hero-action is-primary" onClick={onOpenCameras}><Cctv size={14} aria-hidden="true" /> Kameralar</button>
        </div>
      </div>
    </section>
  );
}

function Readout({ icon: Icon, label, value, tone }: { icon: typeof Aperture; label: string; value: string; tone?: string }) {
  return <span className="flex min-w-[76px] flex-col gap-0.5 bg-white/50 px-3 py-2"><span className="flex items-center gap-1 text-[9px] font-semibold tracking-[0.14em] text-slate-500"><Icon size={10} aria-hidden="true" />{label}</span><span className={cn('font-mono text-lg font-semibold leading-none text-slate-900', tone)}>{value}</span></span>;
}
