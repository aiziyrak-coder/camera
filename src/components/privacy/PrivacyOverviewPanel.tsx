import { Clock, Fingerprint, ImageOff, ShieldAlert, UserX, Users } from 'lucide-react';
import { Card, CardHeader, StatTile, formatNumber } from '../../ui';
import { daysUntil, formatRetentionDays, formatUzDate, type PrivacyFilter, type PrivacyOverview } from '../../lib/privacyApi';

/** Umumiy holat: kimda biometrika bor, kimda rozilik yo'q, nima qachon
 *  avtomatik o'chiriladi. Muammo ko'rsatayotgan plitka bosilsa — shu
 *  filtr bilan shaxslar ro'yxati ochiladi. */
export function PrivacyKpiTiles({ overview, onFilter }: { overview: PrivacyOverview; onFilter?: (filter: PrivacyFilter | 'all') => void }) {
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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatTile
        icon={Users}
        label="Jami shaxslar"
        value={formatNumber(overview.peopleTotal)}
        hint={`Faol: ${formatNumber(overview.peopleActive)} · Faol emas: ${formatNumber(overview.peopleInactive)}`}
        tone="primary"
        onClick={click('all')}
      />
      <StatTile
        icon={Fingerprint}
        label="Biometrikasi saqlangan"
        value={formatNumber(overview.withBiometrics)}
        hint="Yuz rasmi yoki yuz shabloni bor"
        tone="info"
        onClick={click('with_biometrics')}
      />
      <StatTile
        icon={ShieldAlert}
        label="Biometrika bor, rozilik yo'q"
        value={formatNumber(overview.biometricsWithoutConsent)}
        hint={
          overview.consentOutdated > 0
            ? `Yana ${formatNumber(overview.consentOutdated)} tasining roziligi eski versiyada`
            : "Rozilikni qog'ozda olib, shu yerda qayd eting"
        }
        tone={overview.biometricsWithoutConsent > 0 ? 'danger' : 'success'}
        onClick={click('no_consent')}
      />
      <StatTile
        icon={UserX}
        label="Faol emas, biometrikasi bor"
        value={formatNumber(overview.inactiveWithBiometrics)}
        hint={purgeHint}
        tone={overview.inactiveWithBiometrics > 0 ? 'warning' : 'success'}
        onClick={click('inactive')}
      />
      <StatTile
        icon={ImageOff}
        label="Hodisa suratlari"
        value={formatNumber(overview.snapshotCount)}
        hint={overview.oldestSnapshotAt ? `Eng eskisi: ${formatUzDate(overview.oldestSnapshotAt)}` : "Saqlangan surat yo'q"}
        tone="neutral"
      />
      <StatTile
        icon={Clock}
        label="Rozilik matni versiyasi"
        value={overview.consentVersion}
        hint={overview.consentRequired ? "Ro'yxatdan o'tishda rozilik majburiy" : "Ro'yxatdan o'tishda rozilik ixtiyoriy"}
        tone={overview.consentRequired ? 'primary' : 'warning'}
      />
    </div>
  );
}

/** Saqlash muddatlari — faqat ko'rsatish: ular server sozlamalarida
 *  (.env) belgilanadi va app/jobs/cleanup.py tomonidan bajariladi. */
export function RetentionSettingsCard({ overview }: { overview: PrivacyOverview }) {
  const r = overview.retention;
  const rows: { label: string; value: string; hint: string }[] = [
    {
      label: 'Biometrika (faolsizlantirilgandan keyin)',
      value: formatRetentionDays(r.biometricRetentionDaysAfterInactive, "O'chirilmaydi"),
      hint: 'Bitirgan yoki ishdan ketgan odamning yuz rasmi va shabloni',
    },
    {
      label: 'Hodisa suratlari',
      value: formatRetentionDays(r.snapshotRetentionDays, 'Hodisa bilan birga'),
      hint: "Surat o'chadi, hodisa yozuvi qoladi",
    },
    { label: 'Hodisalar', value: formatRetentionDays(r.eventRetentionDays), hint: "Hodisa jurnali (surati bilan birga o'chadi)" },
    { label: 'Turniket qaydlari', value: formatRetentionDays(r.accessEventRetentionDays), hint: 'Karta bilan kirish-chiqish' },
    { label: 'Bildirishnomalar jurnali', value: formatRetentionDays(r.notificationLogRetentionDays), hint: 'Yuborilgan Telegram / SMS xabarlari' },
    { label: 'Audit jurnali', value: formatRetentionDays(r.auditLogRetentionDays), hint: 'Administratorlar amallari' },
  ];

  return (
    <Card>
      <CardHeader
        icon={Clock}
        title="Saqlash muddatlari"
        subtitle="Muddati o'tgan ma'lumotlar avtomatik tozalash jarayonida partiyalab o'chiriladi. Muddatlar server sozlamalarida belgilanadi."
      />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 rounded-control border border-border bg-surface-2 px-3.5 py-3">
            <dt className="text-xs font-medium text-muted">{row.label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-fg">{row.value}</dd>
            <dd className="mt-0.5 text-xs text-muted">{row.hint}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
