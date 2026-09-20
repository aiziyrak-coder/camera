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
export function AttentionPanel({ loading, events, cameras, groups, groupLink, teacherLessons, teacherLink, big }: AttentionPanelProps) {
  const hasEvents = events && (events.highOpen > 0 || events.overdue > 0);
  const hasCameras = cameras && cameras.offline > 0;
  const issues = (hasEvents ? 1 : 0) + (hasCameras ? 1 : 0) + groups.length + teacherLessons.length;

  return (
    <Card padding="none" className="flex flex-col">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Diqqat talab {!loading && issues > 0 && <Badge tone="warning">{issues}</Badge>}
            </span>
          }
          subtitle="Hozir e'tibor berish kerak bo'lgan holatlar"
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
          <IconChip icon={CheckCircle2} tone="success" />
          <div>
            <p className="text-sm font-medium text-fg">Hammasi joyida</p>
            <p className="text-xs text-muted">Muhim hodisa, nosoz kamera yoki keskin past davomat yo'q.</p>
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
                          {formatNumber(events.highOpen)} ta yuqori muhimlikdagi ochiq hodisa
                        </p>
                        <p className="text-xs text-muted">Ko'rib chiqilishi kerak</p>
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
                        <p className="text-xs text-muted">Belgilangan vaqtda hal qilinmagan</p>
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
              <GroupTitle>Davomati past guruhlar</GroupTitle>
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
              <GroupTitle>O'qituvchilar</GroupTitle>
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
                            {lesson.startsAt ?? '—'} · {lesson.groupName} · {lesson.subject}
                          </p>
                        </div>
                        <Badge tone={missed ? 'danger' : 'warning'} dot>
                          {missed ? 'Kelmadi' : lesson.teacherArrivedAt ? `Kechikdi ${lesson.teacherArrivedAt}` : 'Kechikmoqda'}
                        </Badge>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
