import type { ReactNode } from 'react';
import { CodeText, IntelPanel, MicroLabel, StatusLamp, cn, focusRing, formatNumber } from '../../ui';
import { RAG_LABEL, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { RagChip } from '../hisobot/board';
import { consentCoverage } from './reference';
import { daysUntil, formatRetentionDays, formatUzDate, type PrivacyFilter, type PrivacyOverview } from '../../lib/privacyApi';

/** Bitta o'lchov katagi: bosh harfli yorliq, monoshrift son, ostida izoh.
 *  Bosiladigan bo'lsa — o'sha filtr bilan shaxslar ro'yxati ochiladi. */
function Cell({
  label,
  value,
  hint,
  verdict,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string;
  hint: string;
  /** Svetofor — faqat "yaxshi/yomon" ma'nosi bor foizlarda. */
  verdict?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <MicroLabel>{label}</MicroLabel>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <CodeText className="text-[18px] font-semibold leading-6 text-fg">{value}</CodeText>
        {verdict}
      </span>
      <span className="mt-0.5 block text-[12px] leading-4 text-muted">{hint}</span>
    </>
  );
  if (!onClick) return <div className="min-w-0 bg-surface px-3 py-2.5">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cn('min-w-0 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-primary/[0.045]', focusRing)}
    >
      {body}
    </button>
  );
}

/** Umumiy holat: kimda biometrika bor, kimda rozilik yo'q, nima qachon
 *  avtomatik o'chiriladi. Muammo ko'rsatayotgan katak bosilsa — shu
 *  filtr bilan shaxslar ro'yxati ochiladi. */
export function PrivacyKpiTiles({
  overview,
  onFilter,
  reference,
}: {
  overview: PrivacyOverview;
  onFilter?: (filter: PrivacyFilter | 'all') => void;
  reference?: string;
}) {
  const purgeIn = daysUntil(overview.nextBiometricPurgeAt);
  const purgeHint =
    overview.inactiveWithBiometrics === 0
      ? "O'chirilishi kutilayotgan biometrika yo'q"
      : overview.biometricPurgeOverdue > 0
        ? `${formatNumber(overview.biometricPurgeOverdue)} tasi keyingi tozalashda o'chadi`
        : overview.nextBiometricPurgeAt
          ? `Eng yaqini: ${formatUzDate(overview.nextBiometricPurgeAt)}${purgeIn !== null && purgeIn > 0 ? ` (${purgeIn} kun)` : ''}`
          : "Avtomatik o'chirish o'chirilgan";

  const click = (filter: PrivacyFilter | 'all') => (onFilter ? () => onFilter(filter) : undefined);

  // Rozilik QAMROVI — yagona "yaxshi/yomon" foizi, shuning uchun
  // svetofor bilan. Qolgan kataklar xom son: 4 ta faolsiz odam ko'p
  // yoki kamligi muassasa kattaligiga bog'liq, hukm chiqarilmaydi.
  const coverage = consentCoverage(overview);
  const coverageTone = rag(coverage, RATE_RAG);

  return (
    <IntelPanel title="Maxfiylik ko'rsatkichlari" code={reference} right={<MicroLabel>Katakni bosing — ro&apos;yxat ochiladi</MicroLabel>}>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-4">
        <Cell
          label="Rozilik qamrovi"
          value={coverage === null ? '—' : `${Math.round(coverage)}%`}
          hint={`Biometrikasi bor shaxslarning roziligi · ${RAG_LABEL[coverageTone]}`}
          verdict={<RagChip tone={coverageTone} />}
          onClick={click('no_consent')}
          ariaLabel="Rozilik qamrovi — rozilik yo'qlar ro'yxati"
        />
        <Cell
          label="Jami shaxslar"
          value={formatNumber(overview.peopleTotal)}
          hint={`Faol: ${formatNumber(overview.peopleActive)} · Faol emas: ${formatNumber(overview.peopleInactive)}`}
          onClick={click('all')}
        />
        <Cell
          label="Biometrikasi saqlangan"
          value={formatNumber(overview.withBiometrics)}
          hint="Yuz rasmi yoki yuz shabloni bor"
          onClick={click('with_biometrics')}
        />
        <Cell
          label="Biometrika bor, rozilik yo'q"
          value={formatNumber(overview.biometricsWithoutConsent)}
          hint={
            overview.consentOutdated > 0
              ? `Yana ${formatNumber(overview.consentOutdated)} tasining roziligi eski versiyada`
              : "Rozilikni qog'ozda olib, shu yerda qayd eting"
          }
          verdict={
            overview.biometricsWithoutConsent > 0 ? (
              <MicroLabel className="!text-danger">Chora kerak</MicroLabel>
            ) : (
              <MicroLabel className="!text-success">Toza</MicroLabel>
            )
          }
          onClick={click('no_consent')}
        />
        <Cell
          label="Faol emas, biometrikasi bor"
          value={formatNumber(overview.inactiveWithBiometrics)}
          hint={purgeHint}
          onClick={click('inactive')}
        />
        <Cell
          label="Hodisa suratlari"
          value={formatNumber(overview.snapshotCount)}
          hint={overview.oldestSnapshotAt ? `Eng eskisi: ${formatUzDate(overview.oldestSnapshotAt)}` : "Saqlangan surat yo'q"}
        />
        <Cell
          label="Rozilik matni versiyasi"
          value={overview.consentVersion}
          hint="Yangi rozilik shu versiya bilan qayd etiladi"
        />
        <div className="min-w-0 bg-surface px-3 py-2.5">
          <MicroLabel>Ro&apos;yxatdan o&apos;tishda rozilik</MicroLabel>
          <span className="mt-1 block">
            <StatusLamp status={overview.consentRequired ? 'ok' : 'warn'} label={overview.consentRequired ? 'Majburiy' : 'Ixtiyoriy'} />
          </span>
          <span className="mt-0.5 block text-[12px] leading-4 text-muted">Server sozlamasida belgilanadi</span>
        </div>
      </div>
      <p className={cn('border-t border-border px-3 py-2 text-[12px] leading-4', RAG_TEXT[coverageTone])}>
        Svetofor faqat rozilik qamroviga qo&apos;yiladi. Qolgan sonlar xom: ular yaxshi yoki yomonligi muassasa kattaligiga bog&apos;liq.
      </p>
    </IntelPanel>
  );
}

/** Saqlash muddatlari — faqat ko'rsatish: ular server sozlamalarida
 *  (.env) belgilanadi va app/jobs/cleanup.py tomonidan bajariladi. */
export function RetentionSettingsCard({ overview }: { overview: PrivacyOverview }) {
  const r = overview.retention;
  const rows: { code: string; label: string; value: string; hint: string }[] = [
    {
      code: 'SAQ-01',
      label: 'Biometrika (faolsizlantirilgandan keyin)',
      value: formatRetentionDays(r.biometricRetentionDaysAfterInactive, "O'chirilmaydi"),
      hint: 'Bitirgan yoki ishdan ketgan odamning yuz rasmi va shabloni',
    },
    {
      code: 'SAQ-02',
      label: 'Hodisa suratlari',
      value: formatRetentionDays(r.snapshotRetentionDays, 'Hodisa bilan birga'),
      hint: "Surat o'chadi, hodisa yozuvi qoladi",
    },
    { code: 'SAQ-03', label: 'Hodisalar', value: formatRetentionDays(r.eventRetentionDays), hint: "Hodisa jurnali (surati bilan birga o'chadi)" },
    { code: 'SAQ-04', label: 'Turniket qaydlari', value: formatRetentionDays(r.accessEventRetentionDays), hint: 'Karta bilan kirish-chiqish' },
    {
      code: 'SAQ-05',
      label: 'Bildirishnomalar jurnali',
      value: formatRetentionDays(r.notificationLogRetentionDays),
      hint: 'Yuborilgan Telegram / SMS xabarlari',
    },
    { code: 'SAQ-06', label: 'Audit jurnali', value: formatRetentionDays(r.auditLogRetentionDays), hint: 'Administratorlar amallari' },
  ];

  return (
    <IntelPanel title="Saqlash muddatlari" code={`${rows.length} ta`} right={<MicroLabel>Faqat o&apos;qiladi</MicroLabel>}>
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th scope="col" className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-left">
              <MicroLabel>Kod</MicroLabel>
            </th>
            <th scope="col" className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-left">
              <MicroLabel>Ma&apos;lumot turi</MicroLabel>
            </th>
            <th scope="col" className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-right">
              <MicroLabel>Muddat</MicroLabel>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td className="border-b border-border px-2.5 py-1.5 align-top">
                <CodeText className="text-[11px] text-subtle">{row.code}</CodeText>
              </td>
              <td className="border-b border-border px-2.5 py-1.5">
                <p className="text-[13px] leading-4 text-fg">{row.label}</p>
                <p className="text-[12px] leading-4 text-muted">{row.hint}</p>
              </td>
              <td className="border-b border-border px-2.5 py-1.5 text-right align-top">
                <CodeText className="text-[13px] font-semibold text-fg">{row.value}</CodeText>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[12px] leading-4 text-muted">
        Muddati o&apos;tgan ma&apos;lumotlar avtomatik tozalash jarayonida partiyalab o&apos;chiriladi. Muddatlar server sozlamalarida
        belgilanadi.
      </p>
    </IntelPanel>
  );
}
