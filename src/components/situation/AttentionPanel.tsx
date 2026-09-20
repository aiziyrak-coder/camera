import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CameraOff, CheckCircle2, ChevronRight, Clock, ShieldAlert, TrendingDown, type LucideIcon } from 'lucide-react';
import type { GroupStat, Lesson } from '../../lib/situationApi';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';
import { Avatar, Badge, MicroLabel, Skeleton, TONE_SOFT, TONE_TEXT, cn, focusRing, formatNumber, formatPercent, toneForRate, type Tone } from '../../ui';
import { RAG_LABEL, RAG_LETTER, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';

export interface AttentionPanelProps {
  loading: boolean;
  /** Hodisalar bo'limi (huquq bo'lsa va bugun). null — ko'rsatilmaydi. */
  events: {
    highOpen: number;
    overdue: number;
    top: readonly AIEvent[];
    link: (params?: string) => string;
  } | null;
  /** Ishlamayotgan kameralar (bugun). null — ko'rsatilmaydi. */
  cameras: { offline: number; active: number; link: string | null } | null;
  groups: readonly GroupStat[];
  groupLink: ((name: string) => string) | null;
  teacherLessons: readonly Lesson[];
  teacherLink: ((lesson: Lesson) => string | null) | null;
  /** Serverdan kelmagan manbalar nomi ("Guruhlar", "Hodisalar"): ularsiz
   *  "Hammasi joyida" deb aytib bo'lmaydi — bo'sh ro'yxat "muammo yo'q"
   *  degani emas, "tekshirib bo'lmadi" degani. */
  unavailable?: readonly string[];
  big?: boolean;
}

function RowLink({ to, children, className }: { to: string | null; children: ReactNode; className?: string }) {
  const base = cn('flex min-h-[34px] items-center gap-3 px-3 py-1.5', className);
  return to ? (
    <Link to={to} className={cn('group hover:bg-surface-2/70', base, focusRing)}>
      {children}
      <ChevronRight size={16} className="-mr-1 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  ) : (
    <div className={base}>{children}</div>
  );
}

function IconChip({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px]', TONE_SOFT[tone])}>
      <Icon size={15} aria-hidden="true" />
    </span>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <p className="border-y border-border bg-surface-2 px-3 py-1 first:border-t-0">
      <MicroLabel className="intel-micro-wrap">{children}</MicroLabel>
    </p>
  );
}

/** Ro'yxatdagi qatorlar soni — sarlavhadagi raqam ro'yxat bilan bir xil
 *  bo'lishi uchun sahifa ham shu hisobni ishlatadi. */
export function countAttentionIssues(input: {
  events: AttentionPanelProps['events'];
  cameras: AttentionPanelProps['cameras'];
  groups: AttentionPanelProps['groups'];
  teacherLessons: AttentionPanelProps['teacherLessons'];
}): number {
  const { events, cameras, groups, teacherLessons } = input;
  return (
    (events && events.highOpen > 0 ? 1 : 0) +
    (events && events.overdue > 0 ? 1 : 0) +
    (cameras && cameras.offline > 0 ? 1 : 0) +
    groups.length +
    teacherLessons.length
  );
}

/** "Diqqat talab": muhim ochiq hodisalar, muddati o'tganlar, ishlamayotgan
 *  kameralar, davomati eng past guruhlar va darsga kechikkan o'qituvchilar. */
export function AttentionPanel({ loading, events, cameras, groups, groupLink, teacherLessons, teacherLink, unavailable = [], big }: AttentionPanelProps) {
  const gaps = unavailable.filter(Boolean);
  const gapNote = gaps.length ? `${gaps.join(', ')} ma'lumoti kelmadi` : null;
  const hasEvents = events && (events.highOpen > 0 || events.overdue > 0);
  const hasCameras = cameras && cameras.offline > 0;
  // Sarlavhadagi son ro'yxatdagi qatorlar soni bilan bir xil bo'lishi
  // kerak: ilgari "muhim hodisa" va "muddati o'tgan" ikki alohida qator
  // bitta deb sanalardi va badge'dagi raqam ro'yxatga to'g'ri kelmasdi.
  const issues = countAttentionIssues({ events, cameras, groups, teacherLessons });

  return (
    <>
      {loading ? (
        <ul className="divide-y divide-border" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-7 w-7" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : issues === 0 ? (
        <div className="flex items-center gap-3 px-3 py-4">
          <IconChip icon={gapNote ? AlertTriangle : CheckCircle2} tone={gapNote ? 'warning' : 'success'} />
          <div>
            <p className="text-[13px] font-semibold text-fg">{gapNote ? "To'liq tekshirilmadi" : 'Hammasi joyida'}</p>
            {gapNote && <p className="text-[12px] text-muted">{gapNote}</p>}
          </div>
        </div>
      ) : (
        <div className={cn('flex flex-col', big && 'text-[15px]')}>
          {hasEvents && events && (
            <section aria-label="Hodisalar">
              <GroupTitle>Hodisalar</GroupTitle>
              <ul className="divide-y divide-border">
                {events.highOpen > 0 && (
                  <li>
                    <RowLink to={events.link('muhimlik=yuqori')}>
                      <IconChip icon={ShieldAlert} tone="danger" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">
                          {formatNumber(events.highOpen)} ta juda muhim hodisa hal qilinmagan
                        </p>
                      </div>
                    </RowLink>
                  </li>
                )}
                {events.top.map((event) => (
                  <li key={event.id}>
                    <RowLink to={events.link(`id=${encodeURIComponent(event.id)}`)} className="py-2 pl-[4.25rem] sm:pl-[4.5rem]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-fg">{event.moduleName}</p>
                        <p className="truncate text-xs text-muted">
                          {[event.cameraName, event.building].filter(Boolean).join(' · ')}
                          {event.occurredAt ? ` · ${relativeTime(event.occurredAt)}` : ''}
                        </p>
                      </div>
                    </RowLink>
                  </li>
                ))}
                {events.overdue > 0 && (
                  <li>
                    <RowLink to={events.link('tez=muddati')}>
                      <IconChip icon={Clock} tone="warning" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">{formatNumber(events.overdue)} ta hodisaning muddati o'tgan</p>
                      </div>
                    </RowLink>
                  </li>
                )}
              </ul>
            </section>
          )}

          {hasCameras && cameras && (
            <section aria-label="Kameralar">
              <GroupTitle>Kameralar</GroupTitle>
              <RowLink to={cameras.link}>
                <IconChip icon={CameraOff} tone="danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{formatNumber(cameras.offline)} ta kamera aloqada emas</p>
                </div>
              </RowLink>
            </section>
          )}

          {groups.length > 0 && (
            <section aria-label="Davomati past guruhlar">
              <GroupTitle>Past guruhlar</GroupTitle>
              <ul className="divide-y divide-border">
                {groups.map((group) => {
                  const tone = toneForRate(group.rate);
                  return (
                    <li key={group.name}>
                      <RowLink to={groupLink ? groupLink(group.name) : null}>
                        <IconChip icon={TrendingDown} tone={tone} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{group.name}</p>
                          <p className="truncate text-xs text-muted">
                            {[group.course ? `${group.course}-kurs` : null, group.faculty].filter(Boolean).join(' · ') || 'Guruh'}
                            {` · ${formatNumber(group.absent)} kelmadi`}
                          </p>
                        </div>
                        {/* Rang yolg'iz qolmaydi: yonida svetofor harfi. */}
                        <span className="flex shrink-0 items-baseline gap-1.5">
                          <span className={cn('intel-code text-[14px] font-semibold', TONE_TEXT[tone])}>{formatPercent(group.rate)}</span>
                          <span
                            className={cn('intel-code text-[10px] font-bold', RAG_TEXT[rag(group.rate, RATE_RAG)])}
                            title={RAG_LABEL[rag(group.rate, RATE_RAG)]}
                          >
                            {RAG_LETTER[rag(group.rate, RATE_RAG)]}
                          </span>
                        </span>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {teacherLessons.length > 0 && (
            <section aria-label="Darsga kechikkan o'qituvchilar">
              <GroupTitle>O'qituvchilar</GroupTitle>
              <ul className="divide-y divide-border">
                {teacherLessons.map((lesson) => {
                  const missed = lesson.teacherStatus === 'kelmadi';
                  return (
                    <li key={lesson.id}>
                      <RowLink to={teacherLink ? teacherLink(lesson) : null}>
                        <Avatar name={lesson.teacher || "O'qituvchi"} src={lesson.teacherPhotoUrl} size="sm" status={missed ? 'danger' : 'warning'} className="mx-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{lesson.teacher || "Noma'lum"}</p>
                          <p className="truncate text-xs text-muted">
                            {lesson.startsAt ?? '—'} · {lesson.groupName} · {lesson.subject}
                          </p>
                        </div>
                        <Badge tone={missed ? 'danger' : 'warning'} dot>
                          {missed ? 'Kelmadi' : lesson.teacherArrivedAt ? `Kech keldi ${lesson.teacherArrivedAt}` : 'Hali kelmagan'}
                        </Badge>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {gapNote && (
            <p className="border-t border-border px-3 py-2 text-[12px] text-warning">{gapNote}</p>
          )}
        </div>
      )}
    </>
  );
}
