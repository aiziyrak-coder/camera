import type { ReactNode } from 'react';
import KpiTile from '../ui/KpiTile';
import AttendanceSection from './AttendanceSection';
import DetailTables from './DetailTables';
import InsightList from './InsightList';
import LessonsSection from './LessonsSection';
import SecuritySection from './SecuritySection';
import SystemSection from './SystemSection';
import type { ReportAnalytics } from '../../types';

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20">
      <div className="mb-3">
        <h3 id={id} className="text-base font-extrabold text-slate-900">
          {title}
        </h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Tahlil ko'rinishi — tepadan pastga: rahbar uchun xulosa va asosiy raqamlar,
 *  keyin bo'limlar, oxirida operator uchun jadvallar. Jonli tahlil ham,
 *  arxivdagi saqlangan hisobot ham aynan shu komponent bilan chiziladi. */
export default function ReportView({ analytics }: { analytics: ReportAnalytics }) {
  return (
    <div className="space-y-8">
      <Section id="report-insights" title="Qisqa xulosa" subtitle="Nimaga e'tibor berish kerak">
        <InsightList insights={analytics.insights} />
      </Section>

      <Section id="report-kpis" title="Asosiy ko'rsatkichlar" subtitle={`Oldingi davr bilan solishtirilgan: ${analytics.previousPeriod.label}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {analytics.kpis.map((kpi) => (
            <KpiTile
              key={kpi.key}
              label={kpi.label}
              value={kpi.display}
              previous={kpi.previousDisplay}
              delta={kpi.delta}
              deltaDisplay={kpi.deltaDisplay}
              better={kpi.better}
              trend={kpi.trend}
              note={kpi.note}
              reliable={kpi.reliable}
            />
          ))}
        </div>
      </Section>

      <Section id="report-attendance" title="Davomat" subtitle={`${analytics.workingDays} ish kuni`}>
        <AttendanceSection attendance={analytics.attendance} />
      </Section>

      <Section id="report-security" title="Xavfsizlik va AI signallar">
        <SecuritySection security={analytics.security} />
      </Section>

      <Section id="report-lessons" title="Darslar">
        <LessonsSection lessons={analytics.lessons} />
      </Section>

      <Section id="report-system" title="Tizim holati" subtitle="Hisobot tayyorlangan paytdagi holat">
        <SystemSection system={analytics.system} />
      </Section>

      <DetailTables analytics={analytics} />
    </div>
  );
}
