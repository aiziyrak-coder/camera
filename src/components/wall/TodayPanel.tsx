import { CalendarCheck2, GraduationCap, ScanFace, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Counts } from '../../lib/situationApi';
import type { EnrollCounts } from '../../lib/wallApi';
import { MicroLabel, cn, formatPercent } from '../../ui';
import { RAG_LETTER, RAG_LABEL, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { AnimatedNumber, WallPanel, WallRing } from './primitives';

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 border-s border-border ps-[0.6em] first:border-s-0 first:ps-0">
      <div className={cn('intel-code text-[1.9em] font-semibold leading-none', tone)}>
        <AnimatedNumber value={value} />
      </div>
      <MicroLabel className="intel-micro-wrap mt-[0.5em] block !text-[0.6em]">{label}</MicroLabel>
    </div>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center border border-border bg-surface-2 px-[0.9em] py-[0.7em]">
      <div className="mb-[0.6em] flex items-center gap-[0.45em] [&>svg]:h-[1em] [&>svg]:w-[1em] [&>svg]:text-muted">
        {icon}
        <MicroLabel className="!text-[0.65em] !text-fg">{title}</MicroLabel>
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
  // Hech kim kutilmagan bo'lsa foiz "0%" emas, O'LCHANMAGAN.
  const measured = expected > 0 && counts.rate !== null;
  const tone = rag(measured ? counts.rate : null, RATE_RAG);
  const note = coverageNote(counts);
  return (
    <div>
    <div className="flex items-center gap-[1.1em]">
      {/* Svetofor ustuni: rang + harf (Y/S/Q) — rangni ajratmaydigan
          odam ham, uzoqdan qaragan odam ham bir xil o'qiydi. */}
      <div className="flex shrink-0 flex-col items-center gap-[0.35em]">
        <WallRing value={measured ? counts.rate : null} size={6.2} sublabel="davomat" />
        <span className={cn('intel-code text-[0.85em] font-bold', RAG_TEXT[tone])} title={RAG_LABEL[tone]}>
          {RAG_LETTER[tone]} · {RAG_LABEL[tone]}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[0.3em] leading-none">
          <AnimatedNumber value={counts.present} className="text-[3.4em] font-semibold leading-[0.85] text-fg" />
          <span className="intel-code text-[1.3em] text-muted">/ {expected.toLocaleString('ru-RU')}</span>
        </div>
        <MicroLabel className="mt-[0.5em] block !text-[0.6em]">keldi / kutilgan</MicroLabel>
        <div className="mt-[0.8em] grid grid-cols-3 gap-[0.6em]">
          <Metric label="kech keldi" value={counts.late} tone="text-warning" />
          <Metric label="kelmadi" value={counts.absent} tone="text-danger" />
          <Metric label="hali yo'q" value={counts.notYet} tone="text-muted" />
        </div>
      </div>
    </div>
      {note && <div className="mt-[0.55em] border-t border-border pt-[0.4em] text-[0.68em] leading-snug text-muted">{note}</div>}
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
        <div className="mt-[0.5em] text-[0.72em] text-muted">
          Tekshiruvda: <span className="intel-code text-fg">{enroll.pending.toLocaleString('ru-RU')}</span>
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
    <WallPanel area="A" title="Bugungi davomat" icon={<CalendarCheck2 />} code="A-01">
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
