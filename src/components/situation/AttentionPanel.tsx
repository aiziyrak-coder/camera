import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CameraOff, CheckCircle2, ChevronRight, Clock, ShieldAlert, TrendingDown, type LucideIcon } from 'lucide-react';
import type { GroupStat, Lesson } from '../../lib/situationApi';
import { relativeTime } from '../../lib/uzDate';
import type { AIEvent } from '../../types';
import { Avatar, Badge, Card, CardHeader, Skeleton, TONE_SOFT, TONE_TEXT, cn, focusRing, formatNumber, formatPercent, toneForRate, type Tone } from '../../ui';

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
  /** Ko'rilayotgan kun bugunmi — sarlavhalardagi "Bugun" shunga bog'liq. */
  isToday?: boolean;
  big?: boolean;
}

function RowLink({ to, children, className }: { to: string | null; children: ReactNode; className?: string }) {
  const base = cn('flex items-center gap-3 px-4 py-2.5 sm:px-5', className);
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
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', TONE_SOFT[tone])}>
      <Icon size={17} aria-hidden="true" />
    </span>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return <p className="bg-surface-2/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:px-5">{children}</p>;
}

/** "Diqqat talab": muhim ochiq hodisalar, muddati o'tganlar, ishlamayotgan
 *  kameralar, davomati eng past guruhlar va darsga kechikkan o'qituvchilar. */
export function AttentionPanel({ loading, events, cameras, groups, groupLink, teacherLessons, teacherLink, unavailable = [], isToday = true, big }: AttentionPanelProps) {
  const gaps = unavailable.filter(Boolean);
  const gapNote = gaps.length ? `${gaps.join(', ')} ma'lumoti serverdan kelmadi — bu ro'yxat to'liq emas.` : null;
  const hasEvents = events && (events.highOpen > 0 || events.overdue > 0);
  const hasCameras = cameras && cameras.offline > 0;
  // Sarlavhadagi son ro'yxatdagi qatorlar soni bilan bir xil bo'lishi
  // kerak: ilgari "muhim hodisa" va "muddati o'tgan" ikki alohida qator
  // bitta deb sanalardi va badge'dagi raqam ro'yxatga to'g'ri kelmasdi.
  const issues =
    (events && events.highOpen > 0 ? 1 : 0) +
    (events && events.overdue > 0 ? 1 : 0) +
    (hasCameras ? 1 : 0) +
    groups.length +
    teacherLessons.length;

  return (
    <Card padding="none" className="flex flex-col">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Diqqat talab{' '}
              {!loading && issues > 0 && (
                // Yalang'och raqam nimani bildirishi tushunarsiz edi.
                <Badge tone="warning" title={`${formatNumber(issues)} ta holat e'tibor talab qiladi`}>
                  {formatNumber(issues)} ta
                </Badge>
              )}
            </span>
          }
          subtitle="Hozir aralashuv talab qiladigan holatlar"
          icon={AlertTriangle}
          className="mb-3"
        />
      </div>

      {loading ? (
        <ul className="space-y-3 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : issues === 0 ? (
        <div className="flex items-center gap-3 border-t border-border px-4 py-5 sm:px-5">
          <IconChip icon={gapNote ? AlertTriangle : CheckCircle2} tone={gapNote ? 'warning' : 'success'} />
          <div>
            <p className="text-sm font-medium text-fg">{gapNote ? "Holatni to'liq tekshirib bo'lmadi" : 'Hammasi joyida'}</p>
            <p className="text-xs text-muted">
              {gapNote ?? "Muhim hodisa, aloqasiz kamera yoki keskin past davomatli guruh yo'q."}
            </p>
          </div>
        </div>
      ) : (
        <div className={cn('flex flex-col border-t border-border', big && 'text-base')}>
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
                        <p className="text-xs text-muted">Mas'ul xodim ko'rib chiqishi kerak</p>
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
                        <p className="text-xs text-muted">Belgilangan muddatda hal qilinmadi</p>
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
                  <p className="text-xs text-muted">
                    {formatNumber(cameras.active)} ta faol kameradan — tarmoq yoki elektr ta'minotini tekshiring
                  </p>
                </div>
              </RowLink>
            </section>
          )}

          {groups.length > 0 && (
            <section aria-label="Davomati past guruhlar">
              <GroupTitle>{isToday ? 'Bugun' : 'Shu kuni'} eng kam talaba kelgan guruhlar</GroupTitle>
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
                        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', TONE_TEXT[tone])}>{formatPercent(group.rate)}</span>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {teacherLessons.length > 0 && (
            <section aria-label="Darsga kechikkan o'qituvchilar">
              <GroupTitle>Darsga kech kirgan yoki kirmagan o'qituvchilar</GroupTitle>
              <ul className="divide-y divide-border">
                {teacherLessons.map((lesson) => {
                  const missed = lesson.teacherStatus === 'kelmadi';
                  return (
                    <li key={lesson.id}>
                      <RowLink to={teacherLink ? teacherLink(lesson) : null}>
                        <Avatar name={lesson.teacher || "O'qituvchi"} src={lesson.teacherPhotoUrl} size="sm" status={missed ? 'danger' : 'warning'} className="mx-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{lesson.teacher || "O'qituvchi ko'rsatilmagan"}</p>
                          <p className="truncate text-xs text-muted">
                            {/* Bo'sh "—" nimani bildirishi tushunarsiz edi. */}
                            {lesson.startsAt ?? "vaqti noma'lum"} · {lesson.groupName} · {lesson.subject}
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
            <p className="border-t border-border px-4 py-2.5 text-xs text-warning sm:px-5">{gapNote}</p>
          )}
        </div>
      )}
    </Card>
  );
}
