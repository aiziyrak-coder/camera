import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Pagination from '../../components/Pagination';
import ConfirmDialog from '../../components/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import ConsentRecordModal from '../../components/privacy/ConsentRecordModal';
import PrivacyPeopleTable, { type PrivacyAction } from '../../components/privacy/PrivacyPeopleTable';
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

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: 'no_consent', label: PRIVACY_FILTER_LABELS.no_consent },
  { value: 'inactive', label: PRIVACY_FILTER_LABELS.inactive },
  { value: 'with_biometrics', label: PRIVACY_FILTER_LABELS.with_biometrics },
];

/** Biometrikani o'chiradigan, qaytarib bo'lmaydigan amallar. */
type DangerousAction = { kind: 'erase' | 'withdraw'; person: PrivacyPerson };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

export default function PrivacyPage() {
  const { token } = useAuth();
  const toast = useToast();

  const [overview, setOverview] = useState<PrivacyOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewNonce, setOverviewNonce] = useState(0);

  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');
  const people = useServerPage<PrivacyPerson>(
    PRIVACY_PEOPLE_SEARCH_PATH,
    { filter: filter === 'all' ? undefined : filter, search: search.trim() || undefined },
    15,
    { post: true },
  );

  const [busyId, setBusyId] = useState<string | null>(null);
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
          await setPersonActive(token, person.id, true);
          toast.success(`${person.fullName} qayta faollashtirildi`);
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
    await setPersonActive(token, deactivating.id, false);
    toast.success(`${deactivating.fullName} faolsizlantirildi — kameralar uni endi tanimaydi`);
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
    setDangerous(null);
    refresh();
  }

  const retentionDays = overview?.retention.biometricRetentionDaysAfterInactive ?? 0;

  return (
    <div className="space-y-4">
      <section className="glass p-6">
        <PageHeader
          title="Maxfiylik"
          subtitle="Biometrik ma'lumotlarga rozilik, saqlash muddati va shaxsiy ma'lumotlar so'rovlari"
        />
        {overviewError ? (
          <ErrorState message={overviewError} onRetry={() => setOverviewNonce((n) => n + 1)} />
        ) : overview ? (
          <PrivacyKpiTiles overview={overview} />
        ) : (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
      </section>

      {overview && <RetentionSettingsCard overview={overview} />}

      <section className="glass p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
            ariaLabel="Shaxslar filtri"
            size="sm"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="F.I.Sh., JSHSHIR yoki HEMIS ID"
            ariaLabel="Shaxslarni qidirish"
          />
        </div>

        {people.error && <ErrorState message={people.error} onRetry={people.reload} />}
        {people.loading && people.items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : people.items.length === 0 && !people.error ? (
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title="Hech kim topilmadi"
            description={
              filter === 'no_consent'
                ? 'Biometrikasi saqlangan har bir shaxsning roziligi qayd etilgan.'
                : "Filtr yoki qidiruvni o'zgartirib ko'ring."
            }
          />
        ) : (
          <PrivacyPeopleTable people={people.items} busyId={busyId} onAction={handleAction} />
        )}
        <Pagination
          page={people.page}
          totalPages={people.totalPages}
          total={people.total}
          pageSize={people.pageSize}
          onChange={people.setPage}
        />
      </section>

      <ConsentRecordModal
        person={consentFor}
        token={token}
        consentVersion={overview?.consentVersion ?? null}
        onClose={() => setConsentFor(null)}
        onSaved={(updated) => {
          setConsentFor(null);
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
              " Davomat tarixi saqlanib qoladi."
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
    </div>
  );
}
