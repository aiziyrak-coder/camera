/* Rahbariyat uchun taqdimot: /taqdimot. 16:9 sahna, ← → bilan boshqariladi. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, Minimize, ShieldCheck } from 'lucide-react';
import './taqdimot.css';
import {
  SlideTitle,
  SlideProblem,
  SlideAnswers,
  SlideNumbers,
  SlideEnroll,
  SlideLiveness,
  SlideReview,
  SlideDashboard,
  SlideHub,
  SlideSecurity,
  SlideFlow,
  SlideFoundation,
  SlideRoadmap,
  SlideThanks,
} from './slides';

export interface SlideProps {
  active: boolean;
}

interface SlideDef {
  section: string;
  render: (p: SlideProps) => ReactNode;
}

const SLIDES: SlideDef[] = [
  { section: 'Titul', render: () => <SlideTitle /> },
  { section: 'Muammo', render: () => <SlideProblem /> },
  { section: 'Muammo → javob', render: () => <SlideAnswers /> },
  { section: 'Amalda', render: (p) => <SlideNumbers {...p} /> },
  { section: 'Ro‘yxatdan o‘tish', render: () => <SlideEnroll /> },
  { section: 'Tirik odam tekshiruvi', render: () => <SlideLiveness /> },
  { section: 'Tasdiqlash', render: () => <SlideReview /> },
  { section: 'Boshqaruv paneli', render: (p) => <SlideDashboard {...p} /> },
  { section: 'Integratsiya', render: () => <SlideHub /> },
  { section: 'Xavfsizlik', render: () => <SlideSecurity /> },
  { section: 'Jarayon', render: () => <SlideFlow /> },
  { section: 'Asos', render: () => <SlideFoundation /> },
  { section: 'Keyingi bosqich', render: () => <SlideRoadmap /> },
  { section: 'Aloqa', render: () => <SlideThanks /> },
];

const W = 1600;
const H = 900;

function readHash(): number {
  const n = Number(window.location.hash.replace('#', ''));
  return Number.isInteger(n) && n >= 1 && n <= SLIDES.length ? n - 1 : 0;
}

export default function TaqdimotPage() {
  const [index, setIndex] = useState(readHash);
  const [scale, setScale] = useState(1);
  const [full, setFull] = useState(false);
  const touchX = useRef<number | null>(null);
  const total = SLIDES.length;

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);

  // Sahnani ekranga moslash (pastda boshqaruv uchun joy qoladi).
  useEffect(() => {
    function fit() {
      const reserve = document.fullscreenElement ? 0 : 72;
      const s = Math.min((window.innerWidth - 32) / W, (window.innerHeight - reserve - 24) / H);
      setScale(Math.max(0.2, s));
    }
    fit();
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      document.removeEventListener('fullscreenchange', fit);
    };
  }, []);

  useEffect(() => {
    document.title = `Yuzlar bazasi — taqdimot ${index + 1}/${total}`;
    if (window.location.hash !== `#${index + 1}`) window.history.replaceState(null, '', `#${index + 1}`);
  }, [index, total]);

  useEffect(() => {
    const onHash = () => setIndex(readHash());
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('hashchange', onHash);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(total - 1);
      else if (e.key.toLowerCase() === 'f') toggleFull();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, total, toggleFull]);

  return (
    <div
      className="tq"
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className="tq-progress" style={{ width: `${((index + 1) / total) * 100}%` }} />

      <div
        className="tq-stage"
        style={{ transform: `translate(-50%, calc(-50% - ${full ? 0 : 30}px)) scale(${scale})` }}
        onClick={(e) => {
          // Sahnaning o'ng yarmini bosish — keyingi, chap chetini — oldingi.
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          if ((e.target as HTMLElement).closest('a,button')) return;
          if (x > 0.85) go(index + 1);
          else if (x < 0.1) go(index - 1);
        }}
      >
        {SLIDES.map((s, i) => (
          <section
            key={i}
            className={`tq-slide ${i === index ? 'is-active' : i < index ? 'is-prev' : ''}`}
            aria-hidden={i !== index}
            aria-label={`${i + 1}-slayd: ${s.section}`}
          >
            <span className="tq-bignum">{String(i + 1).padStart(2, '0')}</span>
            {(i === index || Math.abs(i - index) === 1) && s.render({ active: i === index })}
            <SlideFooter section={s.section} n={i + 1} total={total} />
          </section>
        ))}
      </div>

      <div className="tq-controls">
        <button type="button" className="tq-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Oldingi">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="tq-btn" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Keyingi">
          <ChevronRight size={18} />
        </button>
        <span className="ml-2 hidden text-[12.5px] text-[#64748b] md:inline">← → yoki bo‘sh joy · F — to‘liq ekran</span>
        <div className="mx-auto flex items-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button key={i} type="button" className={`tq-dot ${i === index ? 'on' : ''}`} onClick={() => go(i)} aria-label={`${i + 1}: ${s.section}`} title={s.section} />
          ))}
        </div>
        <span className="tabular-nums">
          <b className="text-[#0b1220]">{index + 1}</b> / {total}
        </span>
        <button type="button" className="tq-btn" onClick={toggleFull}>
          {full ? <Minimize size={15} /> : <Expand size={15} />}
          <span className="hidden sm:inline">{full ? 'Chiqish' : 'To‘liq ekran'}</span>
        </button>
        <a href="/kirish" className="tq-btn tq-btn-dark">
          Kirish
        </a>
      </div>
    </div>
  );
}

function SlideFooter({ section, n, total }: { section: string; n: number; total: number }) {
  return (
    <div className="absolute bottom-[44px] left-[104px] right-[104px] flex items-center justify-between text-[13px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
      <span className="flex items-center gap-2">
        <ShieldCheck size={16} /> Yuzlar bazasi
      </span>
      <span>{section}</span>
      <span className="tabular-nums">
        {String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
}
