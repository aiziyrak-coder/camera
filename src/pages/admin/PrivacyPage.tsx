import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { ConfirmDialog, ErrorState, Page, SearchInput, Select, SkeletonCard, SkeletonTiles, Toolbar, useToast, useUrlTab, type TabItem } from '../../ui';
import { pagerFooter } from '../../components/settings/kit';
import ConsentRecordModal from '../../components/privacy/ConsentRecordModal';
import PrivacyPeopleTable, { PrivacyPersonDrawer, type PrivacyAction } from '../../components/privacy/PrivacyPeopleTable';
import { PrivacyKpiTiles, RetentionSettingsCard } from '../../components/privacy/PrivacyOverviewPanel';
import TypedConfirmDialog from '../../components/privacy/TypedConfirmDialog';
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
  const activeFilters = (filter === 'all' ? 0 : 1) + (search.trim() ? 1 : 0);

  const toolbar =
    tab === 'shaxslar' ? (
      <Toolbar
        activeCount={activeFilters}
        onReset={() => {
          setFilter('all');
          setSearch('');
        }}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="F.I.Sh., JSHSHIR yoki HEMIS ID" ariaLabel="Shaxslarni qidirish" />
        <Select
          value={filter === 'all' ? '' : filter}
          onChange={(value) => setFilter((value || 'all') as FilterValue)}
          options={FILTER_OPTIONS}
          placeholder="Barcha shaxslar"
          ariaLabel="Shaxslar filtri"
          highlightActive
        />
      </Toolbar>
    ) : undefined;

  return (
    <Page
      title="Maxfiylik"
      subtitle="Biometrik ma'lumotlarga rozilik, saqlash muddati va shaxsiy ma'lumotlar so'rovlari"
      breadcrumbs={[{ label: 'Sozlamalar' }, { label: 'Maxfiylik' }]}
      tabs={TABS}
      toolbar={toolbar}
    >
      {tab === 'umumiy' &&
        (overviewError ? (
          <ErrorState message={overviewError} onRetry={() => setOverviewNonce((n) => n + 1)} />
        ) : overview ? (
          <>
            <PrivacyKpiTiles overview={overview} onFilter={openFiltered} />
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
