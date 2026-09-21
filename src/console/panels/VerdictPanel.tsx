import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn, CountUp, Sparkline } from '../../ui';
import { RAG_LABEL, RAG_LETTER, RAG_TEXT, RATE_RAG, rag, type Rag } from '../../ui/rag';
import { getAnalyticsSummary, type AnalyticsDaily, type Counts, type Overview } from '../../lib/situationApi';
import { addDays } from '../../lib/uzDate';
import Panel from '../Panel';
import { EASE, reducedMotion } from '../motion';
import { breakdown, mergeDaily, pct, scopeCounts, trendValues } from '../attendance';
import { includesStaff, includesStudents, type Scope } from '../consoleFilter';

/**
 * HUKM paneli — konsolning birinchi jumlasi: "bugun davomat shuncha,
 * holati shunday".
 *
 * Yig'ilgan panelda bitta hukm bor: katta raqam, svetofor so'zi, uni
 * to'ldiradigan halqa va 14 kunlik chiziq. Halqa ham, chiziq ham
 * BEZAK emas — halqa raqamning o'zi, chiziq esa API'dan kelgan
 * haqiqiy kunlar. Kattalashtirilganda o'sha raqam bo'laklarga
 * ajraladi: kim o'z vaqtida keldi, kim kechikdi, kim kelmadi va kim
 * umuman o'lchanmagan.
 */

const TREND_DAYS = 14;

/** To'ldiriladigan halqa — raqamning ko'rinishi. */
function Ring({ value, tone, size = 88 }: { value: number | null; tone: Rag; size?: number }) {
  const stroke = Math.max(6, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = value === null ? 0 : Math.min(100, Math.max(0, value)) / 100;
  const still = reducedMotion();
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-900/10" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        className={RAG_TEXT[tone]}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={circumference}
        initial={still ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - filled) }}
        transition={{ duration: still ? 0 : 0.9, ease: EASE }}
      />
    </svg>
  );
}

/** Ulushi bo'yicha cho'ziladigan ustun. Faqat `transform` — 60fps. */
function ShareBar({ share, solid, delay = 0 }: { share: number; solid: string; delay?: number }) {
  const still = reducedMotion();
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-[1px] bg-slate-900/10">
      <motion.span
        className={cn('block h-full w-full origin-left rounded-[1px]', solid)}
        initial={still ? false : { scaleX: 0 }}
        animate={{ scaleX: Math.min(1, Math.max(0, share / 100)) }}
        transition={{ duration: still ? 0 : 0.6, ease: EASE, delay: still ? 0 : delay }}
      />
    </span>
  );
}

/** Bir to'plamning (xodim yoki talaba) to'liq yorilishi. */
function Split({ title, counts, note }: { title: string; counts: Counts; note?: string | null }) {
  const tone = rag(counts.rate, RATE_RAG);
  const parts = breakdown(counts);
  return (
    <section className="glass rounded-[6px] p-3">
      <header className="flex items-baseline gap-2">
        <h3 className="intel-micro !text-fg">{title}</h3>
        <span className={cn('intel-code ms-auto text-[22px] font-semibold leading-none', RAG_TEXT[tone])}>
          <CountUp value={pct(counts.rate)} />
        </span>
        <span className={cn('intel-code text-[11px] font-bold', RAG_TEXT[tone])}>{RAG_LETTER[tone]}</span>
      </header>
      <p className="mt-0.5 text-[11px] text-muted">
        {counts.present} / {counts.total} · {RAG_LABEL[tone]}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {parts.map((part, index) => (
          <li key={part.key}>
            <div className="flex items-baseline gap-2 text-[11.5px]">
              <span className={cn('font-medium', part.text)}>{part.label}</span>
              <span className="intel-code ms-auto text-[11px] text-muted">{part.value}</span>
              <span className="intel-code w-10 text-end text-[11px] text-subtle">{pct(part.share)}</span>
            </div>
            <div className="mt-1">
              <ShareBar share={part.share} solid={part.solid} delay={index * 0.06} />
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[11px] text-warning">{note}</p>}
    </section>
  );
}

export interface VerdictPanelProps {
  overview: Overview | null;
  scope: Scope;
  date: string;
  live: boolean;
  /** Umumiy so'rov muvaffaqiyatsiz — "yuklanmoqda" deb yolg'on aytmaymiz. */
  failed?: boolean;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  area?: string;
}

export default function VerdictPanel({ overview, scope, date, live, failed = false, expanded, onExpand, area }: VerdictPanelProps) {
  const counts = useMemo(() => scopeCounts(overview, scope), [overview, scope]);
  const tone = rag(counts.rate, RATE_RAG);

  // 14 kunlik chiziq — TAHLIL endpointidan. "Hammasi" uchun ikki tur
  // alohida so'raladi va sana bo'yicha qo'shiladi (foiz qayta hisoblanadi),
  // chunki server bitta so'rovda faqat bitta turni biladi.
  const [daily, setDaily] = useState<AnalyticsDaily[] | null>(null);
  const [trendFailed, setTrendFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const from = addDays(date, -(TREND_DAYS - 1));
    const wanted: Array<'xodim' | 'talaba'> = [];
    if (includesStaff(scope)) wanted.push('xodim');
    if (includesStudents(scope)) wanted.push('talaba');
    setTrendFailed(false);
    Promise.all(wanted.map((type) => getAnalyticsSummary({ from, to: date, type }, { signal: controller.signal })))
      .then((results) => {
        setDaily(results.map((result) => result.daily).reduce<AnalyticsDaily[]>((acc, rows) => mergeDaily(acc, rows), []));
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setDaily(null);
        setTrendFailed(true);
      });
    return () => controller.abort();
  }, [date, scope]);

  const trend = useMemo(() => (daily ? trendValues(daily, date, TREND_DAYS) : null), [daily, date]);
  const measured = trend?.filter((value) => value !== null).length ?? 0;

  const studentsGap = overview && !overview.studentsDataAvailable && includesStudents(scope);
  const studentsNote = studentsGap ? "Talaba yuzlari ro'yxatdan o'tmagan" : null;

  const headline = pct(counts.rate);

  return (
    <Panel
      id="verdict"
      title="Umumiy holat"
      live={live}
      expanded={expanded}
      onExpand={onExpand}
      area={area}
      badge={<span className={cn('intel-code text-[11px] font-bold', RAG_TEXT[tone])}>{RAG_LETTER[tone]}</span>}
      full={
        <div className="h-full overflow-y-auto px-3 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Ring value={counts.rate} tone={tone} size={120} />
            <div className="min-w-0">
              <p className={cn('intel-code text-[clamp(36px,7vh,68px)] font-semibold leading-none', RAG_TEXT[tone])}>
                <CountUp value={headline} />
              </p>
              <p className={cn('mt-1 text-[13px] font-medium', RAG_TEXT[tone])}>{RAG_LABEL[tone]}</p>
              <p className="text-[12px] text-muted">
                {counts.present} / {counts.total} · {date}
              </p>
            </div>
            <div className="ms-auto min-w-[200px] flex-1">
              {trend && measured >= 2 ? (
                <>
                  <Sparkline values={trend} min={0} max={100} height={54} ariaLabel="14 kunlik davomat" />
                  <p className="intel-micro mt-1">14 kun</p>
                </>
              ) : (
                <p className="text-[11px] text-subtle">{trendFailed ? "Trend olinmadi" : "Trend o'lchanmagan"}</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {includesStaff(scope) && overview && <Split title="Xodimlar" counts={overview.staff} />}
            {includesStudents(scope) && overview && (
              <Split title="Talabalar" counts={overview.students} note={studentsNote} />
            )}
            {!overview && <p className="text-[12px] text-subtle">Ma’lumot yo‘q</p>}
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <Ring value={counts.rate} tone={tone} />
          <div className="min-w-0">
            <p className={cn('intel-code text-[clamp(26px,3.8vh,44px)] font-semibold leading-none', RAG_TEXT[tone])}>
              <CountUp value={headline} />
            </p>
            <p className={cn('mt-0.5 text-[12px] font-medium', RAG_TEXT[tone])}>{RAG_LABEL[tone]}</p>
            <p className="truncate text-[11px] text-muted">
              {overview ? `${counts.present} / ${counts.total}` : failed ? 'Ma’lumot olinmadi' : 'yuklanmoqda…'}
            </p>
          </div>
        </div>
        <div className="min-h-0">
          {trend && measured >= 2 ? (
            <>
              <Sparkline values={trend} min={0} max={100} height={30} ariaLabel="14 kunlik davomat" />
              <p className="intel-micro mt-0.5">14 kun</p>
            </>
          ) : (
            <p className="intel-micro">{trendFailed ? 'Trend olinmadi' : "Trend o'lchanmagan"}</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
