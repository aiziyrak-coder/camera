import type { ReactNode } from 'react';
import { Download, ExternalLink, FileSignature, FileX2, ScanFace, UserCheck, UserX, type LucideIcon } from 'lucide-react';
import {
  Avatar,
  Button,
  ButtonLink,
  CodeText,
  DataTable,
  Drawer,
  IconButton,
  IntelPanel,
  KeyValue,
  MicroLabel,
  Section,
  StatusLamp,
  type DataTableColumn,
} from '../../ui';
import { Notice } from '../settings/kit';
import { CONSENT_SOURCE_LABELS, consentState, daysUntil, formatUzDate, type PrivacyPerson } from '../../lib/privacyApi';

export type PrivacyAction = 'consent' | 'withdraw' | 'deactivate' | 'activate' | 'erase' | 'export';

interface ActionMeta {
  action: PrivacyAction;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}

/** Shaxs uchun mavjud amallar — jadvaldagi ikonkalar va Drawer tugmalari bir xil ro'yxatdan. */
function availableActions(person: PrivacyPerson): ActionMeta[] {
  const state = consentState(person);
  const actions: ActionMeta[] = [];
  if (state !== 'current') actions.push({ action: 'consent', label: 'Rozilikni qayd etish', icon: FileSignature });
  if (person.active) actions.push({ action: 'deactivate', label: 'Faolsizlantirish', icon: UserX });
  else actions.push({ action: 'activate', label: 'Qayta faollashtirish', icon: UserCheck });
  actions.push({ action: 'export', label: "Shaxsiy ma'lumotlarni yuklab olish (JSON)", icon: Download });
  if (person.consentGivenAt) actions.push({ action: 'withdraw', label: "Rozilikni qaytarib olish (biometrika o'chiriladi)", icon: FileX2, danger: true });
  if (person.hasBiometrics) actions.push({ action: 'erase', label: "Biometrikani o'chirish", icon: ScanFace, danger: true });
  return actions;
}

function personLine(person: PrivacyPerson): string {
  return `${person.type === 'talaba' ? 'Talaba' : 'Xodim'} · ${person.groupOrPosition}${person.facultyName ? ` · ${person.facultyName}` : ''}`;
}

function StatusCell({ person }: { person: PrivacyPerson }) {
  if (person.active) return <StatusLamp status="ok" label="Faol" />;
  return (
    <span className="inline-flex flex-col items-start gap-0.5 max-md:items-end">
      <StatusLamp status="idle" label="Faol emas" />
      {person.deactivatedAt && <CodeText className="text-[11px] text-muted">{formatUzDate(person.deactivatedAt)} dan</CodeText>}
    </span>
  );
}

function BiometricsCell({ person }: { person: PrivacyPerson }) {
  if (!person.hasBiometrics) return <MicroLabel>Saqlanmagan</MicroLabel>;
  const left = daysUntil(person.biometricPurgeAt);
  return (
    <span className="inline-flex flex-col items-start gap-0.5 max-md:items-end">
      <StatusLamp
        status={person.biometricsStatus === 'tasdiqlangan' ? 'ok' : 'idle'}
        label={person.biometricsStatus === 'tasdiqlangan' ? 'Tasdiqlangan' : 'Kutilmoqda'}
      />
      {person.biometricPurgeAt && (
        <span className="text-[11px] font-medium text-warning">
          {left !== null && left <= 0 ? (
            "Keyingi tozalashda o'chadi"
          ) : (
            <>
              <CodeText>{formatUzDate(person.biometricPurgeAt)}</CodeText> da o&apos;chadi
            </>
          )}
        </span>
      )}
    </span>
  );
}

function ConsentCell({ person }: { person: PrivacyPerson }) {
  const state = consentState(person);
  if (state === 'not_needed') return <MicroLabel>Kerak emas</MicroLabel>;
  if (state === 'missing') return <StatusLamp status="alert" label="Rozilik yo'q" />;
  return (
    <span className="inline-flex flex-col items-start gap-0.5 max-md:items-end">
      <StatusLamp
        status={state === 'current' ? 'ok' : 'warn'}
        label={state === 'current' ? 'Berilgan' : `Eski versiya (${person.consentVersion ?? '—'})`}
      />
      <CodeText className="text-[11px] text-muted">
        {formatUzDate(person.consentGivenAt)}
        {person.consentSource ? ` · ${CONSENT_SOURCE_LABELS[person.consentSource] ?? person.consentSource}` : ''}
      </CodeText>
    </span>
  );
}

interface PrivacyPeopleTableProps {
  people: PrivacyPerson[];
  /** Amal bajarilayotgan qator (tugmalari vaqtincha o'chiriladi). */
  busyId: string | null;
  onAction: (action: PrivacyAction, person: PrivacyPerson) => void;
  /** Qator bosilganda — tafsilot paneli. */
  onOpen?: (person: PrivacyPerson) => void;
  selectedId?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyDescription?: ReactNode;
  footer?: ReactNode;
  /** Sahifaning hujjat raqami — panel sarlavhasining o'ng chetida. */
  reference?: string;
  /** Jami topilgan shaxslar (server sahifalash). */
  total?: number;
}

export default function PrivacyPeopleTable({
  people,
  busyId,
  onAction,
  onOpen,
  selectedId,
  loading,
  error,
  onRetry,
  emptyDescription,
  footer,
  reference,
  total,
}: PrivacyPeopleTableProps) {
  const columns: DataTableColumn<PrivacyPerson>[] = [
    {
      key: 'person',
      header: 'Shaxs',
      cell: (person) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.fullName} size="sm" className="hidden sm:inline-flex" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{person.fullName}</p>
            <p className="truncate text-[12px] font-normal leading-4 text-muted">{personLine(person)}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Holati', width: '9rem', cell: (person) => <StatusCell person={person} /> },
    { key: 'biometrics', header: 'Biometrika', width: '12rem', cell: (person) => <BiometricsCell person={person} /> },
    { key: 'consent', header: 'Rozilik', width: '13rem', cell: (person) => <ConsentCell person={person} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Amallar</span>,
      align: 'right',
      width: '13rem',
      hideOnMobile: true,
      cell: (person) => {
        const busy = busyId === person.id;
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
            {availableActions(person).map((meta) => (
              <IconButton
                key={meta.action}
                icon={meta.icon}
                label={meta.label}
                size="sm"
                variant={meta.danger ? 'danger' : 'ghost'}
                disabled={busy}
                loading={busy && meta.action === 'export'}
                onClick={() => onAction(meta.action, person)}
              />
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <IntelPanel
      title="Shaxslar"
      code={reference}
      right={<MicroLabel>{total === undefined ? `${people.length} ta` : `${total.toLocaleString('ru-RU')} ta`}</MicroLabel>}
    >
      <DataTable
        columns={columns}
        rows={people}
        rowKey={(person) => person.id}
        onRowClick={onOpen}
        selectedKey={selectedId}
        rowTone={(person) => (consentState(person) === 'missing' ? 'danger' : null)}
        loading={loading}
        error={error}
        onRetry={onRetry}
        dense
        emptyTitle="Hech kim topilmadi"
        emptyDescription={emptyDescription}
        ariaLabel="Shaxslar ro'yxati"
        footer={footer}
      />
    </IntelPanel>
  );
}

/** Bitta shaxsning maxfiylik holati va amallari (telefonda asosiy yo'l). */
export function PrivacyPersonDrawer({
  person,
  busy,
  onClose,
  onAction,
}: {
  person: PrivacyPerson | null;
  busy: boolean;
  onClose: () => void;
  onAction: (action: PrivacyAction, person: PrivacyPerson) => void;
}) {
  if (!person) return null;
  const actions = availableActions(person);
  const safe = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);
  const state = consentState(person);

  return (
    <Drawer
      open
      onClose={onClose}
      title={person.fullName}
      subtitle={personLine(person)}
      actions={<ButtonLink to={`/shaxs/${person.id}`} variant="ghost" size="sm" icon={ExternalLink}>Profil</ButtonLink>}
    >
      <div className="flex flex-col gap-6">
        {state === 'missing' && (
          <Notice tone="danger" title="Biometrika saqlangan, rozilik yo'q">
            Qog'ozdagi yozma rozilikni oling va shu yerda qayd eting — yoki biometrikani o'chiring.
          </Notice>
        )}
        <Section title="Holat">
          <KeyValue
            items={[
              { label: 'Holati', value: <StatusCell person={person} /> },
              { label: 'Biometrika', value: <BiometricsCell person={person} /> },
              { label: 'Rozilik', value: <ConsentCell person={person} /> },
            ]}
          />
        </Section>
        <Section title="Amallar">
          <div className="flex flex-col gap-2">
            {safe.map((meta) => (
              <Button key={meta.action} icon={meta.icon} disabled={busy} loading={busy && meta.action === 'export'} onClick={() => onAction(meta.action, person)}>
                {meta.label}
              </Button>
            ))}
          </div>
        </Section>
        {danger.length > 0 && (
          <Section title="Qaytarib bo'lmaydigan amallar" description="Yuz rasmi va shabloni darhol o'chiriladi; davomat tarixi saqlanadi.">
            <div className="flex flex-col gap-2">
              {danger.map((meta) => (
                <Button key={meta.action} icon={meta.icon} variant="secondary" disabled={busy} onClick={() => onAction(meta.action, person)} className="!text-danger hover:!bg-danger-soft">
                  {meta.label}
                </Button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </Drawer>
  );
}
