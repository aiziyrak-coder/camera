import { useEffect, useRef } from 'react';
import { CalendarClock } from 'lucide-react';
import type { Lesson } from '../../lib/situationApi';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, cn, formatNumber, type Tone } from '../../ui';
import { lessonSlots, type LessonSlot } from './situationUtils';

interface Props {
  lessons: readonly Lesson[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isToday: boolean;
  big?: boolean;
}

const STATE: Record<LessonSlot['state'], { label: string; tone: Tone }> = {
  finished: { label: 'Tugagan', tone: 'neutral' },
  ongoing: { label: 'Hozir', tone: 'primary' },
  upcoming: { label: 'Kutilmoqda', tone: 'info' },
};

/** "Bugungi darslar": juftliklar bo'yicha qisqa vaqt chizig'i. */
export function LessonsTimeline({ lessons, loading, error, onRetry, isToday, big }: Props) {
  const slots = lessons ? lessonSlots(lessons) : [];
  const counts = { finished: 0, ongoing: 0, upcoming: 0 };
  for (const lesson of lessons ?? []) counts[lesson.state] += 1;
  const scroller = useRef<HTMLOListElement>(null);
  const activeIndex = slots.findIndex((slot) => slot.state !== 'finished');

  // Joriy juftlik ko'rinib tursin (gorizontal aylantirishda).
  useEffect(() => {
    const list = scroller.current;
    if (!list || activeIndex <= 0) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    if (item) list.scrollLeft = Math.max(0, item.offsetLeft - list.offsetLeft - 16);
  }, [activeIndex, slots.length]);

  const subtitle = lessons
    ? isToday
      ? `${formatNumber(counts.finished)} o'tgan · ${formatNumber(counts.ongoing)} davom etmoqda · ${formatNumber(counts.upcoming)} kutilmoqda`
      : `${formatNumber(lessons.length)} ta dars o'tgan`
    : 'Juftliklar bo\'yicha';

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={isToday ? 'Bugungi darslar' : 'Shu kungi darslar'}
        subtitle={subtitle}
        icon={CalendarClock}
      />
      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-48 shrink-0 rounded-card" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Darslarni yuklab bo'lmadi" message={error} onRetry={onRetry} />
      ) : slots.length === 0 ? (
        <EmptyState
          bordered={false}
          tone="info"
          icon={CalendarClock}
          className="py-8 sm:py-10"
          title={isToday ? "Bugunga dars jadvali yo'q" : "Bu kun uchun dars jadvali yo'q"}
          description={
            <>
              Dars jadvali hali yuklanmagan bo'lishi mumkin. Jadval kiritilgach, bu yerda juftliklar, o'qituvchilarning o'z vaqtida kelishi va
              guruhlar davomati ko'rinadi.
            </>
          }
        />
      ) : (
        <ol ref={scroller} className={cn('-mx-1 grid snap-x grid-flow-col gap-3 overflow-x-auto px-1 pb-1', big ? 'auto-cols-[minmax(15rem,1fr)]' : 'auto-cols-[minmax(12.5rem,1fr)]')} aria-label="Juftliklar">
          {slots.map((slot, index) => {
            const meta = STATE[slot.state];
            const checked = slot.onTime + slot.late + slot.missed;
            const ongoing = slot.state === 'ongoing';
            return (
              <li
                key={slot.start}
                className={cn(
                  'relative flex min-w-0 snap-start flex-col rounded-card border bg-surface p-3.5',
                  ongoing ? 'border-primary shadow-pop ring-1 ring-primary/30' : 'border-border',
                  slot.state === 'finished' && 'bg-surface-2/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">{index + 1}-juftlik</span>
                  <Badge tone={meta.tone} dot={ongoing}>
                    {meta.label}
                  </Badge>
                </div>
                <p className={cn('mt-1.5 font-semibold tabular-nums tracking-tight text-fg', big ? 'text-2xl' : 'text-lg')}>
                  {slot.start}
                  {slot.end && <span className="text-muted">–{slot.end}</span>}
                </p>
                <p className="text-[13px] text-muted">
                  {formatNumber(slot.total)} ta dars
                  {ongoing && slot.ongoing < slot.total ? ` · ${slot.ongoing} davom etmoqda` : ''}
                </p>
                <div className="mt-auto pt-3">
                  {checked > 0 ? (
                    <>
                      <ProgressBar
                        size="sm"
                        segments={[
                          { value: slot.onTime, tone: 'success', label: "O'z vaqtida" },
                          { value: slot.late, tone: 'warning', label: 'Kech keldi' },
                          { value: slot.missed, tone: 'danger', label: 'Kelmadi' },
                        ]}
                        ariaLabel={`${slot.start}: o'qituvchilar`}
                      />
                      <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs tabular-nums text-muted">
                        <span><span className="font-semibold text-success">{slot.onTime}</span> o'z vaqtida</span>
                        {slot.late > 0 && <span><span className="font-semibold text-warning">{slot.late}</span> kech</span>}
                        {slot.missed > 0 && <span><span className="font-semibold text-danger">{slot.missed}</span> kelmadi</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-subtle">
                      {slot.state === 'upcoming' ? "Dars hali boshlanmadi" : "O'qituvchilarning kirgani qayd etilmagan"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
