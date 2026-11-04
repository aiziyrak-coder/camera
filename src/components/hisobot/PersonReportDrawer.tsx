import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  ButtonLink,
  CodeText,
  DateRangePicker,
  Drawer,
  EmptyState,
  ErrorState,
  Readout,
  SkeletonCard,
  TONE_SOFT,
  attendanceMeta,
  cn,
  formatUzDate,
  rangeForPreset,
  type DateRangeValue,
} from '../../ui';
import { RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { useApiResource } from '../../lib/useApiResource';
import { buildQuery } from '../../lib/apiClient';
import { lessonTime, LESSON_ATTENDANCE_META } from '../../lib/studentAttendance';
import type { PersonLesson, PersonProfile } from '../../lib/situationApi';
import { CELL_META } from '../../lib/lessonGridApi';

/**
 * Odamning barcha kunlardagi hisoboti — hisobot jadvalida ism bosilganda.
 *
 * Har kun alohida: o'sha kungi umumiy holat (keldi / kech / kelmadi) va
 * kunning har bir darsi holati bilan. Davr — oxirgi 30 kun (o'zgartiriladi).
 */

const PRESETS = ['week', 'month', 'last30', 'lastMonth'] as const;
const TEACHER_LABEL: Record<string, { label: string; tone: keyof typeof TONE_SOFT }> = {
  oz_vaqtida: { label: "O'z vaqtida", tone: 'success' },
  kechikdi: { label: 'Kech keldi', tone: 'warning' },
  kelmadi: { label: 'Kelmadi', tone: 'danger' },
  kutilmoqda: { label: 'Kutilmoqda', tone: 'info' },
  nomalum: { label: "O'lchanmadi", tone: 'neutral' },
};

interface Props {
  person: { id: string; name: string } | null;
  onClose: () => void;
  /** Jadvaldagi davr oxiri — "oxirgi 30 kun" shundan hisoblanadi. */
  defaultTo: string;
}

export default function PersonReportDrawer({ person, onClose, defaultTo }: Props) {
  const [range, setRange] = useState<DateRangeValue>(() => rangeForPreset('last30', defaultTo));
  useEffect(() => {
    if (person) setRange(rangeForPreset('last30', defaultTo));
  }, [person?.id, defaultTo]); // eslint-disable-line react-hooks/exhaustive-deps -- yangi odam ochilganda

  const path = person
    ? `/api/situation/people/${encodeURIComponent(person.id)}${buildQuery({ from: range.from, to: range.to })}`
    : null;
  const profile = useApiResource<PersonProfile>(path);
  const data = profile.data && person && profile.data.person.id === person.id ? profile.data : null;

  return (
    <Drawer
      open={person !== null}
      onClose={onClose}
      size="lg"
      title={person?.name}
      subtitle={data ? subtitle(data) : undefined}
      actions={
        person ? (
          <ButtonLink to={`/shaxs/${person.id}`} variant="secondary" size="sm" icon={ExternalLink}>
            To&apos;liq sahifa
          </ButtonLink>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <DateRangePicker value={range} presets={PRESETS} onChange={setRange} showSummary={false} />
        {profile.error && !data ? (
          <ErrorState title="Hisobotni yuklab bo'lmadi" message={profile.error} onRetry={profile.reload} />
        ) : !data ? (
          <SkeletonCard />
        ) : (
          <div className={cn('flex flex-col gap-3', profile.loading && 'opacity-70 transition-opacity')}>
            <Totals data={data} />
            <Days data={data} />
          </div>
        )}
      </div>
    </Drawer>
  );
}

function subtitle(data: PersonProfile): string {
  const p = data.person;
  if (p.type === 'talaba') return [p.faculty, p.course ? `${p.course}-kurs` : null, p.group].filter(Boolean).join(' · ');
  return [p.department ?? p.unit, p.position].filter(Boolean).join(' · ');
}

function lessonStatus(lesson: PersonLesson, student: boolean): { label: string; tone: keyof typeof TONE_SOFT } {
  if (!student) return TEACHER_LABEL[lesson.teacherStatus] ?? TEACHER_LABEL.nomalum;
  if (lesson.attendanceStatus) return LESSON_ATTENDANCE_META[lesson.attendanceStatus];
  if (lesson.state !== 'finished') return { label: CELL_META.kutilmoqda.label, tone: 'info' };
  return { label: CELL_META.olchanmadi.label, tone: 'neutral' };
}

function Totals({ data }: { data: PersonProfile }) {
  const student = data.person.type === 'talaba';
  const t = data.totals;
  const lessons = data.lessons.filter((l) => l.state === 'finished');
  const attended = lessons.filter((l) =>
    student ? l.attendanceStatus === 'keldi' || l.attendanceStatus === 'kech_keldi'
      : l.teacherStatus === 'oz_vaqtida' || l.teacherStatus === 'kechikdi',
  ).length;
  const missed = lessons.filter((l) => (student ? l.attendanceStatus === 'kelmadi' : l.teacherStatus === 'kelmadi')).length;
  const lessonRate = attended + missed ? Math.round((1000 * attended) / (attended + missed)) / 10 : null;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-border bg-surface px-3 py-2 sm:grid-cols-4">
      <Readout label="Kelgan kunlar" value={<CodeText className="text-success">{t.present}</CodeText>} />
      <Readout label="Kech keldi" value={<CodeText className="text-warning">{t.late}</CodeText>} />
      <Readout label="Kelmagan" value={<CodeText className="text-danger">{t.absent}</CodeText>} />
      <Readout
        label="Kunlik davomat"
        value={<CodeText className={RAG_TEXT[rag(t.rate, RATE_RAG)]}>{t.rate === null ? '—' : `${t.rate}%`}</CodeText>}
      />
      <Readout label={student ? 'Darsga qatnashdi' : "Dars o'tdi"} value={<CodeText>{attended}/{lessons.length}</CodeText>} />
      <Readout label={student ? 'Dars qoldirdi' : 'Darsga kelmadi'} value={<CodeText className="text-danger">{missed}</CodeText>} />
      <Readout
        label="Dars davomati"
        value={<CodeText className={RAG_TEXT[rag(lessonRate, RATE_RAG)]}>{lessonRate === null ? '—' : `${lessonRate}%`}</CodeText>}
      />
      <Readout label="O'rtacha kelish" value={<CodeText>{t.avgArrival ?? '—'}</CodeText>} />
    </div>
  );
}

function Days({ data }: { data: PersonProfile }) {
  const student = data.person.type === 'talaba';
  const byDate = useMemo(() => {
    const map = new Map<string, PersonLesson[]>();
    for (const lesson of data.lessons) {
      const list = map.get(lesson.date) ?? [];
      list.push(lesson);
      map.set(lesson.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
    return map;
  }, [data.lessons]);
  const days = [...data.calendar].sort((a, b) => b.date.localeCompare(a.date));
  if (days.length === 0) return <EmptyState title="Bu davrda ma'lumot yo'q" />;

  return (
    <ol className="flex flex-col border border-border">
      {days.map((day) => {
        const meta = attendanceMeta(day.status);
        const lessons = byDate.get(day.date) ?? [];
        return (
          <li key={day.date} className="border-b border-border px-3 py-2 last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium text-fg">{formatUzDate(day.date, { weekday: true, year: false })}</span>
              <span className={cn('px-1.5 py-0.5 text-[12px] font-medium', TONE_SOFT[meta.tone])}>{meta.label}</span>
              {day.checkIn && (
                <span className="text-[12px] text-muted">
                  keldi <CodeText>{day.checkIn}</CodeText>
                  {day.checkOut && (
                    <>
                      {' '}· ketdi <CodeText>{day.checkOut}</CodeText>
                    </>
                  )}
                </span>
              )}
              {lessons.length > 0 && <span className="ms-auto text-[12px] text-subtle">{lessons.length} ta dars</span>}
            </div>
            {lessons.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1">
                {lessons.map((lesson) => {
                  const st = lessonStatus(lesson, student);
                  return (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                      <CodeText className="w-24 shrink-0 text-muted">{lessonTime(lesson)}</CodeText>
                      <span className="min-w-0 flex-1 truncate text-fg" title={lesson.subject}>
                        {lesson.subject}
                        {!student && <span className="text-muted"> · {lesson.groupName}</span>}
                        {lesson.room && <span className="text-muted"> · {lesson.room}</span>}
                      </span>
                      {student && lesson.firstSeen && <span className="text-muted">kamerada {lesson.firstSeen}</span>}
                      <span className={cn('px-1.5 py-0.5 font-medium', TONE_SOFT[st.tone])}>{st.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
