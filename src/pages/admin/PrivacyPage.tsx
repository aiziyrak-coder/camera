import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import {
  CodeText,
  ConfirmDialog,
  DocumentFooter,
  DocumentHeader,
  ErrorState,
  FilterBar,
  Page,
  SkeletonCard,
  SkeletonTiles,
  StatusLamp,
  useToast,
  useUrlTab,
  type TabItem,
} from '../../ui';
import { RAG_LABEL, RAG_TEXT, RATE_RAG, rag } from '../../ui/rag';
import { RagChip } from '../../components/hisobot/board';
import { pagerFooter } from '../../components/settings/kit';
import ConsentRecordModal from '../../components/privacy/ConsentRecordModal';
import PrivacyPeopleTable, { PrivacyPersonDrawer, type PrivacyAction } from '../../components/privacy/PrivacyPeopleTable';
import { PrivacyKpiTiles, RetentionSettingsCard } from '../../components/privacy/PrivacyOverviewPanel';
import TypedConfirmDialog from '../../components/privacy/TypedConfirmDialog';
import { consentCoverage, privacyReference } from '../../components/privacy/reference';
import { branding } from '../../lib/branding';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import {
  PRIVACY_FILTER_LABELS,
  PRIVACY_PEOPLE_SEARCH_PATH,
  confirmationWord,
  eraseBiometrics,
  exportFilename,
  exportPersonData,
  fetchPrivacyOverview,
  setPersonActive,
  withdrawConsent,
  type PrivacyFilter,
  type PrivacyOverview,
  type PrivacyPerson,
} from '../../lib/privacyApi';
import { invalidateServerPageCache, useServerPage } from '../../lib/useServerPage';

type FilterValue = 'all' | PrivacyFilter;
type TabId = 'umumiy' | 'shaxslar';

const TABS: readonly TabItem<TabId>[] = [
  { id: 'umumiy', label: 'Umumiy holat', icon: ShieldCheck },
  { id: 'shaxslar', label: 'Shaxslar', icon: Users },
];

const FILTER_OPTIONS = (Object.keys(PRIVACY_FILTER_LABELS) as PrivacyFilter[]).map((value) => ({
  value,
  label: PRIVACY_FILTER_LABELS[value],
}));

/** Biometrikani o'chiradigan, qaytarib bo'lmaydigan amallar. */
type DangerousAction = { kind: 'erase' | 'withdraw'; person: PrivacyPerson };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

/** Hujjat tuzilgan payt — hisobot sahifasidagi bilan bir xil shaklda. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

export default function PrivacyPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useUrlTab(TABS);

  const [overview, setOverview] = useState<PrivacyOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewNonce, setOverviewNonce] = useState(0);

  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');
  const people = useServerPage<PrivacyPerson>(
    PRIVACY_PEOPLE_SEARCH_PATH,
    { filter: filter === 'all' ? undefined : filter, search: search.trim() || undefined },
    15,
    { post: true, enabled: tab === 'shaxslar' },
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PrivacyPerson | null>(null);
  const [consentFor, setConsentFor] = useState<PrivacyPerson | null>(null);
  const [deactivating, setDeactivating] = useState<PrivacyPerson | null>(null);
  const [dangerous, setDangerous] = useState<DangerousAction | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchPrivacyOverview(token, controller.signal)
      .then((data) => {
        setOverview(data);
        setOverviewError(null);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setOverviewError(errorMessage(err, "Umumiy holatni olib bo'lmadi"));
      });
    return () => controller.abort();
  }, [token, overviewNonce]);

  const { reload: reloadPeople } = people;
  /** O'zgarishdan keyin: ro'yxat keshi eskirgan, ko'rsatkichlar ham. */
  const refresh = useCallback(() => {
    invalidateServerPageCache(PRIVACY_PEOPLE_SEARCH_PATH);
    reloadPeople();
    setOverviewNonce((n) => n + 1);
  }, [reloadPeople]);

  /** Drawer ochiq bo'lsa — yangilangan yozuvni ko'rsatadi. */
  function updateViewing(updated: PrivacyPerson) {
    setViewing((current) => (current?.id === updated.id ? updated : current));
  }

  async function runRowAction(person: PrivacyPerson, fn: () => Promise<void>) {
    setBusyId(person.id);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err, "Amalni bajarib bo'lmadi"));
    } finally {
      setBusyId(null);
    }
  }

  function handleAction(action: PrivacyAction, person: PrivacyPerson) {
    switch (action) {
      case 'consent':
        setConsentFor(person);
        break;
      case 'withdraw':
      case 'erase':
        setDangerous({ kind: action, person });
        break;
      case 'deactivate':
        setDeactivating(person);
        break;
      case 'activate':
        void runRowAction(person, async () => {
          const updated = await setPersonActive(token, person.id, true);
          toast.success(`${person.fullName} qayta faollashtirildi`);
          updateViewing(updated);
          refresh();
        });
        break;
      case 'export':
        void runRowAction(person, async () => {
          const blob = await exportPersonData(token, person.id);
          downloadBlob(blob, exportFilename(person));
          toast.success("Shaxsiy ma'lumotlar yuklab olindi. Faylni faqat shaxsning o'ziga topshiring.");
        });
        break;
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    const updated = await setPersonActive(token, deactivating.id, false);
    toast.success(`${deactivating.fullName} faolsizlantirildi — kameralar uni endi tanimaydi`);
    updateViewing(updated);
    setDeactivating(null);
    refresh();
  }

  async function confirmDangerous() {
    if (!dangerous) return;
    const { kind, person } = dangerous;
    const result = kind === 'erase' ? await eraseBiometrics(token, person.id) : await withdrawConsent(token, person.id);
    const base =
      kind === 'erase'
        ? `${person.fullName}: biometrik ma'lumotlar o'chirildi`
        : `${person.fullName}: rozilik qaytarib olindi, biometrika o'chirildi`;
    if (result.photoDeleted) toast.success(base);
    else toast.error(`${base}, lekin yuz rasmini ombordan o'chirib bo'lmadi — administratorga xabar bering`);
    updateViewing(result.person);
    setDangerous(null);
    refresh();
  }

  function openFiltered(next: FilterValue) {
    setFilter(next);
    setSearch('');
    setTab('shaxslar');
  }

  const retentionDays = overview?.retention.biometricRetentionDaysAfterInactive ?? 0;

  // Hujjat raqami — bo'lim, filtr va qidiruvdan. Vaqtdan mustaqil.
  const reference = useMemo(
    () => privacyReference({ tab, parts: tab === 'shaxslar' ? [filter === 'all' ? '' : filter, search.trim()] : [] }),
    [tab, filter, search],
  );
  const generatedAt = useMemo(stamp, [tab, overview]);

  // Yagona svetoforli ko'rsatkich: biometrikasi saqlanganlarning qanchasida
  // joriy rozilik bor. Qolgan sonlar xom bo'lib qoladi.
  const coverage = overview ? consentCoverage(overview) : null;
  const coverageTone = rag(coverage, RATE_RAG);

  const toolbar =
    tab === 'shaxslar' ? (
      <FilterBar
        fields={[
          {
            kind: 'search',
            value: search,
            onChange: setSearch,
            placeholder: 'F.I.Sh., JSHSHIR yoki HEMIS ID',
            ariaLabel: 'Shaxslarni qidirish',
          },
          {
            kind: 'select',
            value: filter,
            onChange: (value) => setFilter(value as FilterValue),
            options: FILTER_OPTIONS,
            placeholder: 'Barcha shaxslar',
            ariaLabel: 'Shaxslar filtri',
            inactiveValue: 'all',
          },
        ]}
      />
    ) : undefined;

  return (
    <Page
      title="Maxfiylik"
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Maxfiylik' }]}
      tabs={TABS}
      toolbar={toolbar}
    >
      <div className="flex min-w-0 flex-col gap-3">
      {/* 1. Hujjat blanki: qamrov, ro'yxat hajmi, rozilik hukmi. */}
      <DocumentHeader
        org={branding.orgFullName}
        title="Biometrika va shaxsiy ma'lumotlar rejimi"
        reference={reference}
        generatedAt={generatedAt}
        readouts={[
          { label: 'Qamrov', value: tab === 'umumiy' ? 'Umumiy holat' : PRIVACY_FILTER_LABELS[filter as PrivacyFilter] ?? 'Barcha shaxslar' },
          { label: "Ro'yxatda", value: overview ? `${overview.peopleTotal.toLocaleString('ru-RU')} kishi` : '—' },
          {
            label: 'Biometrikasi saqlangan',
            value: overview ? `${overview.withBiometrics.toLocaleString('ru-RU')} kishi` : '—',
            title: "Xom son — svetofor qo'yilmaydi",
          },
          {
            label: 'Rozilik qamrovi',
            value: (
              <span className="flex items-center gap-1.5">
                <CodeText className={`font-semibold ${RAG_TEXT[coverageTone]}`}>{coverage === null ? '—' : `${Math.round(coverage)}%`}</CodeText>
                <RagChip tone={coverageTone} />
              </span>
            ),
            title: RAG_LABEL[coverageTone],
          },
          {
            label: "Ro'yxatdan o'tishda rozilik",
            value: overview ? (
              <StatusLamp status={overview.consentRequired ? 'ok' : 'warn'} label={overview.consentRequired ? 'Majburiy' : 'Ixtiyoriy'} />
            ) : (
              <StatusLamp status="idle" label="Yuklanmoqda" />
            ),
          },
        ]}
      />

      {tab === 'umumiy' &&
        (overviewError ? (
          <ErrorState
            message={overviewError}
            onRetry={() => {
              // Xatoni DARHOL tozalash kerak: aks holda "Qayta urinish"
              // bosilganda ekran o'zgarmay turardi (so'rov ketayotgani
              // bilinmasdi) va foydalanuvchi tugmani ishlamayapti deb
              // qayta-qayta bosardi. Endi skeleton ko'rinadi.
              setOverviewError(null);
              setOverviewNonce((n) => n + 1);
            }}
          />
        ) : overview ? (
          <>
            <PrivacyKpiTiles overview={overview} onFilter={openFiltered} reference={reference} />
            <RetentionSettingsCard overview={overview} />
          </>
        ) : (
          <>
            <SkeletonTiles count={6} />
            <SkeletonCard lines={3} />
          </>
        ))}

      {tab === 'shaxslar' && (
        <PrivacyPeopleTable
          people={people.items}
          busyId={busyId}
          onAction={handleAction}
          onOpen={setViewing}
          selectedId={viewing?.id ?? null}
          reference={reference}
          total={people.total}
          loading={people.loading && people.items.length === 0}
          error={people.error}
          onRetry={people.reload}
          emptyDescription={
            filter === 'no_consent' && !search.trim()
              ? 'Biometrikasi saqlangan har bir shaxsning roziligi qayd etilgan.'
              : "Filtr yoki qidiruvni o'zgartirib ko'ring."
          }
          footer={pagerFooter({
            page: people.page,
            totalPages: people.totalPages,
            total: people.total,
            pageSize: people.pageSize,
            onChange: people.setPage,
          })}
        />
      )}

      <DocumentFooter
        note={`Xizmat uchun. Hujjat ${reference} raqami bilan tizimda tuzilgan; saqlash muddatlari server sozlamalarida belgilanadi.`}
      />
      </div>

      <PrivacyPersonDrawer person={viewing} busy={busyId === viewing?.id} onClose={() => setViewing(null)} onAction={handleAction} />

      <ConsentRecordModal
        person={consentFor}
        token={token}
        consentVersion={overview?.consentVersion ?? null}
        onClose={() => setConsentFor(null)}
        onSaved={(updated) => {
          setConsentFor(null);
          updateViewing(updated);
          toast.success(`${updated.fullName}: rozilik qayd etildi`);
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!deactivating}
        title="Faolsizlantirish"
        message={
          deactivating
            ? `"${deactivating.fullName}" faolsizlantirilsinmi? Kameralar uni darhol tanimay qo'yadi` +
              (deactivating.hasBiometrics && retentionDays > 0
                ? `, yuz ma'lumotlari esa ${retentionDays} kundan keyin avtomatik o'chiriladi.`
                : '.') +
              ' Davomat tarixi saqlanib qoladi.'
            : ''
        }
        confirmLabel="Faolsizlantirish"
        onCancel={() => setDeactivating(null)}
        onConfirm={confirmDeactivate}
      />

      <TypedConfirmDialog
        open={!!dangerous}
        title={dangerous?.kind === 'withdraw' ? 'Rozilikni qaytarib olish' : "Biometrikani o'chirish"}
        message={
          dangerous
            ? dangerous.kind === 'withdraw'
              ? `"${dangerous.person.fullName}" roziligi bekor qilinadi va uning yuz rasmi hamda shabloni darhol o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi — qayta tanilishi uchun odam yangidan ro'yxatdan o'tishi kerak.`
              : `"${dangerous.person.fullName}" yuz rasmi va shabloni butunlay o'chiriladi, kameralar uni endi tanimaydi. Yozuv va davomat tarixi saqlanadi. Bu amalni ortga qaytarib bo'lmaydi.`
            : ''
        }
        expected={dangerous ? confirmationWord(dangerous.person.fullName) : ''}
        confirmLabel={dangerous?.kind === 'withdraw' ? 'Qaytarib olish' : "O'chirish"}
        onCancel={() => setDangerous(null)}
        onConfirm={confirmDangerous}
      />
    </Page>
  );
}
