import { Download, FileSignature, FileX2, Loader2, ScanFace, UserCheck, UserX } from 'lucide-react';
import Badge from '../Badge';
import {
  CONSENT_SOURCE_LABELS,
  consentState,
  daysUntil,
  formatUzDate,
  type PrivacyPerson,
} from '../../lib/privacyApi';

export type PrivacyAction = 'consent' | 'withdraw' | 'deactivate' | 'activate' | 'erase' | 'export';

interface PrivacyPeopleTableProps {
  people: PrivacyPerson[];
  /** Amal bajarilayotgan qator (tugmalari vaqtincha o'chiriladi). */
  busyId: string | null;
  onAction: (action: PrivacyAction, person: PrivacyPerson) => void;
}

function ConsentCell({ person }: { person: PrivacyPerson }) {
  const state = consentState(person);
  if (state === 'not_needed') return <span className="text-xs text-slate-400">Kerak emas</span>;
  if (state === 'missing') return <Badge tone="red">Rozilik yo'q</Badge>;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={state === 'current' ? 'green' : 'amber'}>
        {state === 'current' ? 'Berilgan' : `Eski versiya (${person.consentVersion ?? '—'})`}
      </Badge>
      <span className="text-[11px] text-slate-400">
        {formatUzDate(person.consentGivenAt)}
        {person.consentSource ? ` · ${CONSENT_SOURCE_LABELS[person.consentSource] ?? person.consentSource}` : ''}
      </span>
    </div>
  );
}

function BiometricsCell({ person }: { person: PrivacyPerson }) {
  if (!person.hasBiometrics) return <span className="text-xs text-slate-400">Saqlanmagan</span>;
  const left = daysUntil(person.biometricPurgeAt);
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={person.biometricsStatus === 'tasdiqlangan' ? 'indigo' : 'slate'}>
        {person.biometricsStatus === 'tasdiqlangan' ? 'Tasdiqlangan' : 'Kutilmoqda'}
      </Badge>
      {person.biometricPurgeAt && (
        <span className="text-[11px] font-semibold text-amber-700">
          {left !== null && left <= 0
            ? "Keyingi tozalashda o'chadi"
            : `${formatUzDate(person.biometricPurgeAt)} da o'chadi`}
        </span>
      )}
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'hover:text-red-600' : 'hover:text-indigo-600'
      }`}
    >
      {children}
    </button>
  );
}

export default function PrivacyPeopleTable({ people, busyId, onAction }: PrivacyPeopleTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/70">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/70 bg-white/40 text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">Shaxs</th>
            <th className="px-4 py-3">Holati</th>
            <th className="px-4 py-3">Biometrika</th>
            <th className="px-4 py-3">Rozilik</th>
            <th className="px-4 py-3 text-right">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const busy = busyId === person.id;
            const state = consentState(person);
            return (
              <tr key={person.id} className="border-b border-white/50 last:border-0 hover:bg-white/30">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{person.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {person.type === 'talaba' ? 'Talaba' : 'Xodim'} · {person.groupOrPosition}
                    {person.facultyName ? ` · ${person.facultyName}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {person.active ? (
                    <Badge tone="green">Faol</Badge>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Badge tone="slate">Faol emas</Badge>
                      {person.deactivatedAt && (
                        <span className="text-[11px] text-slate-400">{formatUzDate(person.deactivatedAt)} dan</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <BiometricsCell person={person} />
                </td>
                <td className="px-4 py-3">
                  <ConsentCell person={person} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    {busy && <Loader2 size={14} className="mr-1 animate-spin text-slate-400" />}
                    {state !== 'current' && (
                      <ActionButton title="Rozilikni qayd etish" onClick={() => onAction('consent', person)} disabled={busy}>
                        <FileSignature size={15} />
                      </ActionButton>
                    )}
                    {person.consentGivenAt && (
                      <ActionButton
                        title="Rozilikni qaytarib olish (biometrika o'chiriladi)"
                        onClick={() => onAction('withdraw', person)}
                        disabled={busy}
                        danger
                      >
                        <FileX2 size={15} />
                      </ActionButton>
                    )}
                    {person.active ? (
                      <ActionButton title="Faolsizlantirish" onClick={() => onAction('deactivate', person)} disabled={busy}>
                        <UserX size={15} />
                      </ActionButton>
                    ) : (
                      <ActionButton title="Qayta faollashtirish" onClick={() => onAction('activate', person)} disabled={busy}>
                        <UserCheck size={15} />
                      </ActionButton>
                    )}
                    {person.hasBiometrics && (
                      <ActionButton
                        title="Biometrikani o'chirish"
                        onClick={() => onAction('erase', person)}
                        disabled={busy}
                        danger
                      >
                        <ScanFace size={15} />
                      </ActionButton>
                    )}
                    <ActionButton
                      title="Shaxsiy ma'lumotlarni yuklab olish (JSON)"
                      onClick={() => onAction('export', person)}
                      disabled={busy}
                    >
                      <Download size={15} />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
