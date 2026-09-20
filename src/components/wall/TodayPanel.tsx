import { CalendarCheck2, GraduationCap, ScanFace, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Counts } from '../../lib/situationApi';
import type { EnrollCounts } from '../../lib/wallApi';
import { cn, formatPercent } from '../../ui';
import { AnimatedNumber, WallPanel, WallRing } from './primitives';

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[1.6em] font-semibold leading-none', tone)}>
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-[0.35em] truncate text-[0.75em] text-muted">{label}</div>
    </div>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center rounded-[0.8em] bg-surface-2 px-[1em] py-[0.8em]">
      <div className="mb-[0.6em] flex items-center gap-[0.45em] text-[0.9em] font-medium text-fg [&>svg]:h-[1.1em] [&>svg]:w-[1.1em] [&>svg]:text-muted">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/** Foiz faqat yuzi ro'yxatdan o'tganlar bo'yicha o'lchanadi: ro'yxatda
 *  minglab odam bo'lib, yuzi tasdiqlangani bir necha yuz bo'lsa, "92%"
 *  butun institut davomati kabi o'qilardi. Qamrov yozilganda raqam
 *  o'lchov emas, sabab bo'lib ko'rinadi. */
export function coverageNote(counts: Counts): string | null {
  if (counts.total <= 0 || counts.enrolled >= counts.total) return null;
  const n = (v: number) => v.toLocaleString('ru-RU');
  return `Ro'yxatdagi ${n(counts.total)} kishidan ${n(counts.enrolled)} tasining yuzi ro'yxatdan o'tgan — foiz faqat shular bo'yicha`;
}

function AttendanceBlock({ counts }: { counts: Counts }) {
  const expected = counts.present + counts.absent + counts.notYet;
  const note = coverageNote(counts);
  return (
    <div>
    <div className="flex items-center gap-[1.1em]">
      <WallRing value={counts.rate} size={6.2} sublabel="davomat" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[0.3em] leading-none">
          <AnimatedNumber value={counts.present} className="text-[2.6em] font-semibold text-fg" />
          <span className="text-[1.2em] tabular-nums text-muted">/ {expected.toLocaleString('ru-RU')}</span>
        </div>
        <div className="mt-[0.3em] text-[0.75em] text-muted">keldi / kutilgan</div>
        <div className="mt-[0.8em] grid grid-cols-3 gap-[0.6em]">
          <Metric label="kech keldi" value={counts.late} tone="text-warning" />
          <Metric label="kelmadi" value={counts.absent} tone="text-danger" />
          <Metric label="hali yo'q" value={counts.notYet} tone="text-muted" />
        </div>
      </div>
    </div>
      {note && <div className="mt-[0.55em] text-[0.72em] leading-snug text-muted">{note}</div>}
    </div>
  );
}

function EnrollmentBlock({ enroll }: { enroll: EnrollCounts }) {
  const pct = enroll.pct ?? 0;
  return (
    <div>
      <div className="flex items-center gap-[1.1em]">
        <WallRing value={pct} size={6.2} tone="primary" label={formatPercent(pct)} sublabel="yuz topshirgan" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[0.3em] leading-none">
            <AnimatedNumber value={enroll.confirmed} className="text-[2.6em] font-semibold text-fg" />
            <span className="text-[1.2em] tabular-nums text-muted">/ {enroll.total.toLocaleString('ru-RU')}</span>
          </div>
          <div className="mt-[0.3em] text-[0.75em] text-muted">yuzi tasdiqlangan talabalar</div>
          <div className="mt-[0.7em] flex items-center gap-[0.45em] rounded-[0.5em] bg-primary-soft px-[0.7em] py-[0.45em] text-[0.8em] text-primary">
            <ScanFace className="h-[1.1em] w-[1.1em] shrink-0" />
            <span>Yuz topshirish davom etmoqda — davomat {'≥'}5% dan keyin ko'rinadi</span>
          </div>
        </div>
      </div>
      {enroll.pending > 0 && (
        <div className="mt-[0.5em] text-[0.75em] text-muted">
          Tekshiruvda: <span className="tabular-nums text-fg">{enroll.pending.toLocaleString('ru-RU')}</span>
        </div>
      )}
    </div>
  );
}

export function TodayPanel({
  students,
  staff,
  studentsDataAvailable,
  studentsEnroll,
}: {
  students: Counts;
  staff: Counts;
  studentsDataAvailable: boolean;
  studentsEnroll: EnrollCounts;
}) {
  return (
    <WallPanel area="A" title="Bugun" icon={<CalendarCheck2 />}>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.8em]">
        <Block icon={<Users />} title="Xodimlar">
          <AttendanceBlock counts={staff} />
        </Block>
        <Block icon={<GraduationCap />} title="Talabalar">
          {studentsDataAvailable ? <AttendanceBlock counts={students} /> : <EnrollmentBlock enroll={studentsEnroll} />}
        </Block>
      </div>
    </WallPanel>
  );
}
