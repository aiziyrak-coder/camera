import { Clock, Fingerprint, ImageOff, ShieldAlert, UserX, Users } from 'lucide-react';
import StatCard from '../StatCard';
import {
  daysUntil,
  formatRetentionDays,
  formatUzDate,
  type PrivacyOverview,
} from '../../lib/privacyApi';

function count(value: number): string {
  return value.toLocaleString('ru-RU');
}

/** Umumiy holat: kimda biometrika bor, kimda rozilik yo'q, nima qachon
 *  avtomatik o'chiriladi. */
export function PrivacyKpiTiles({ overview }: { overview: PrivacyOverview }) {
  const purgeIn = daysUntil(overview.nextBiometricPurgeAt);
  const purgeSublabel =
    overview.inactiveWithBiometrics === 0
      ? "O'chirilishi kutilayotgan biometrika yo'q"
      : overview.biometricPurgeOverdue > 0
        ? `${count(overview.biometricPurgeOverdue)} tasi keyingi tozalashda o'chadi`
        : overview.nextBiometricPurgeAt
          ? `Eng yaqini: ${formatUzDate(overview.nextBiometricPurgeAt)}${purgeIn !== null && purgeIn > 0 ? ` (${purgeIn} kun)` : ''}`
          : "Avtomatik o'chirish o'chirilgan";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        icon={<Users size={20} />}
        value={count(overview.peopleTotal)}
        label="Jami shaxslar"
        sublabel={`Faol: ${count(overview.peopleActive)} · Faol emas: ${count(overview.peopleInactive)}`}
      />
      <StatCard
        icon={<Fingerprint size={20} />}
        value={count(overview.withBiometrics)}
        label="Biometrikasi saqlangan"
        sublabel="Yuz rasmi yoki yuz shabloni bor"
        tone="slate"
      />
      <StatCard
        icon={<ShieldAlert size={20} />}
        value={count(overview.biometricsWithoutConsent)}
        label="Biometrika bor, rozilik yo'q"
        sublabel={
          overview.consentOutdated > 0
            ? `Yana ${count(overview.consentOutdated)} tasining roziligi eski versiyada`
            : "Rozilikni qog'ozda olib, shu yerda qayd eting"
        }
        tone={overview.biometricsWithoutConsent > 0 ? 'red' : 'green'}
      />
      <StatCard
        icon={<UserX size={20} />}
        value={count(overview.inactiveWithBiometrics)}
        label="Faol emas, biometrikasi bor"
        sublabel={purgeSublabel}
        tone={overview.inactiveWithBiometrics > 0 ? 'amber' : 'green'}
      />
      <StatCard
        icon={<ImageOff size={20} />}
        value={count(overview.snapshotCount)}
        label="Hodisa suratlari"
        sublabel={
          overview.oldestSnapshotAt ? `Eng eskisi: ${formatUzDate(overview.oldestSnapshotAt)}` : "Saqlangan surat yo'q"
        }
        tone="slate"
      />
      <StatCard
        icon={<Clock size={20} />}
        value={overview.consentVersion}
        label="Rozilik matni versiyasi"
        sublabel={
          overview.consentRequired
            ? "Ro'yxatdan o'tishda rozilik majburiy"
            : "Ro'yxatdan o'tishda rozilik ixtiyoriy"
        }
        tone={overview.consentRequired ? 'indigo' : 'amber'}
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
    {
      label: 'Hodisalar',
      value: formatRetentionDays(r.eventRetentionDays),
      hint: "Hodisa jurnali (surati bilan birga o'chadi)",
    },
    {
      label: 'Turniket qaydlari',
      value: formatRetentionDays(r.accessEventRetentionDays),
      hint: 'Karta bilan kirish-chiqish',
    },
    {
      label: 'Bildirishnomalar jurnali',
      value: formatRetentionDays(r.notificationLogRetentionDays),
      hint: 'Yuborilgan Telegram / SMS xabarlari',
    },
    {
      label: 'Audit jurnali',
      value: formatRetentionDays(r.auditLogRetentionDays),
      hint: 'Administratorlar amallari',
    },
  ];

  return (
    <section className="glass p-6">
      <h3 className="text-sm font-bold text-slate-700">Saqlash muddatlari</h3>
      <p className="mb-4 text-xs text-slate-500">
        Muddati o'tgan ma'lumotlar avtomatik tozalash jarayonida partiyalab o'chiriladi. Muddatlar server
        sozlamalarida belgilanadi.
      </p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-white/70 bg-white/50 px-3 py-2.5">
            <dt className="text-xs font-semibold text-slate-500">{row.label}</dt>
            <dd className="text-base font-extrabold text-slate-900">{row.value}</dd>
            <dd className="text-[11px] text-slate-400">{row.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
