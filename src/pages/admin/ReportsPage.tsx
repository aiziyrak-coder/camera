import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/Skeleton';
import CriteriaCards from '../../components/reports/CriteriaCards';
import CriterionPeople from '../../components/reports/CriterionPeople';
import PersonReport from '../../components/reports/PersonReport';
import EventDrawer from '../../components/events/EventDrawer';
import Badge from '../../components/Badge';
import Pagination from '../../components/Pagination';
import { buildQuery } from '../../lib/apiClient';
import { useApiResource } from '../../lib/useApiResource';
import { useServerPage } from '../../lib/useServerPage';
import { relativeTime } from '../../lib/uzDate';
import type {
  AIEvent,
  ReportCriteria,
  ReportPeriodKey,
  ReportPersonDetail,
  ReportPersonRow,
  ReportPopulation,
} from '../../types';

/** Hisobotlar — "kriteriya -> ro'yxat -> isbot" uch darajasi.
 *
 * Avvalgi sahifa umumiy analitika va PDF arxivi edi: chiroyli grafiklar,
 * lekin "kim kelmadi va buni nima tasdiqlaydi" degan savolga javob
 * bermasdi. Endi yo'l shunday: populyatsiya (o'qituvchi/xodim yoki
 * talaba) -> davr -> kriteriya kartalari -> raqam ortidagi odamlar ->
 * odamning o'zi, rasmi, kafedrasi va kamera isbotlari bilan.
 *
 * Har daraja URL'da: ?bolim=&davr=&kriteriya=&guruh=&odam= — havolani
 * ulashish va brauzerning "orqaga" tugmasi ishlaydi. */

const POPULATIONS: { value: ReportPopulation; label: string }[] = [
  { value: 'xodim', label: "O'qituvchilar" },
  { value: 'talaba', label: 'Talabalar' },
];

const PERIODS: { value: ReportPeriodKey; label: string }[] = [
  { value: 'bugun', label: 'Bugun' },
  { value: 'kecha', label: 'Kecha' },
  { value: 'hafta', label: 'Hafta' },
  { value: 'oy', label: 'Oylik' },
];

const PEOPLE_PAGE_SIZE = 20;
const EVENTS_PAGE_SIZE = 20;

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const population = (params.get('bolim') as ReportPopulation) === 'talaba' ? 'talaba' : 'xodim';
  const periodKey = (PERIODS.find((item) => item.value === params.get('davr'))?.value ??
    'bugun') as ReportPeriodKey;
  const criterionKey = params.get('kriteriya');
  const bucket = params.get('guruh') ?? '';
  const personId = params.get('odam');

  const [search, setSearch] = useState('');
  const [openEvent, setOpenEvent] = useState<AIEvent | null>(null);

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      setParams(next);
    },
    [params, setParams],
  );

  // 1-daraja: kriteriya kartalari.
  const criteriaUrl = `/api/reports/criteria${buildQuery({ population, period: periodKey })}`;
  const { data: criteria, loading: criteriaLoading, error: criteriaError, reload } =
    useApiResource<ReportCriteria>(criteriaUrl);

  const criterion = useMemo(
    () => criteria?.criteria.find((item) => item.key === criterionKey) ?? null,
    [criteria, criterionKey],
  );
  const activeBucket = bucket || criterion?.buckets[0]?.key || '';

  // 2-daraja (odamlar): faqat odamlar ro'yxati ochilganda so'raladi.
  const peopleEnabled = Boolean(criterion && criterion.detail === 'people' && !personId);
  const people = useServerPage<ReportPersonRow>(
    `/api/reports/criteria/${criterion?.key ?? 'davomat'}/people`,
    {
      population,
      period: periodKey,
      bucket: activeBucket,
      search: search.trim() || undefined,
    },
    PEOPLE_PAGE_SIZE,
    { enabled: peopleEnabled },
  );

  // 2-daraja (signallar): mavjud hodisalar jurnalidan o'qiladi, ya'ni
  // kadr va "nega signal" izohi bilan birga keladi.
  const eventsEnabled = Boolean(criterion && criterion.detail === 'events' && !personId);
  const events = useServerPage<AIEvent>(
    '/api/events',
    {
      moduleCodes: criterion?.moduleCodes.join(',') || undefined,
      from: criteria?.period.start,
      to: criteria?.period.end,
      status: activeBucket || undefined,
    },
    EVENTS_PAGE_SIZE,
    { enabled: eventsEnabled },
  );

  // 3-daraja: bitta odam.
  const personUrl = personId
    ? `/api/reports/people/${personId}${buildQuery({ period: periodKey })}`
    : null;
  const {
    data: person,
    loading: personLoading,
    error: personError,
    reload: reloadPerson,
  } = useApiResource<ReportPersonDetail>(personUrl);

  const level: 'cards' | 'people' | 'events' | 'person' = personId
    ? 'person'
    : criterion?.detail === 'people'
      ? 'people'
      : criterion?.detail === 'events'
        ? 'events'
        : 'cards';

  return (
    <div className="space-y-4">
      <section className="glass p-4 sm:p-6">
        <PageHeader
          title="Hisobotlar"
          subtitle="Kriteriya bo'yicha raqam, raqam ortidagi ro'yxat va har bir odamning kamera isboti"
          action={
            <button
              type="button"
              onClick={reload}
              className="btn-glass flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={criteriaLoading ? 'animate-spin' : ''} />
              Yangilash
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Kim bo'yicha hisobot"
            value={population}
            onChange={(value) => setQuery({ bolim: value, kriteriya: null, guruh: null, odam: null })}
            options={POPULATIONS}
          />
          <SegmentedControl
            size="sm"
            ariaLabel="Davrni tanlash"
            value={periodKey}
            onChange={(value) => setQuery({ davr: value, odam: null })}
            options={PERIODS}
          />
          {criteria && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <CalendarRange size={13} className="text-indigo-500" />
              {criteria.period.start === criteria.period.end
                ? criteria.period.start
                : `${criteria.period.start} — ${criteria.period.end}`}
              <span className="text-slate-400">
                · {criteria.populationLabel}: {criteria.peopleTotal} ta, ro&apos;yxatdan o&apos;tgan{' '}
                {criteria.enrolledTotal} ta
              </span>
            </span>
          )}
        </div>
      </section>

      {criteriaError && <ErrorState message={criteriaError} onRetry={reload} />}

      {level === 'cards' && (
        <CriteriaCards
          criteria={criteria?.criteria ?? []}
          loading={criteriaLoading}
          onOpen={(item, bucketKey) =>
            setQuery({ kriteriya: item.key, guruh: bucketKey, odam: null })
          }
        />
      )}

      {level === 'people' && criterion && (
        <CriterionPeople
          criterion={criterion}
          bucket={activeBucket}
          onBucketChange={(value) => setQuery({ guruh: value })}
          people={people.items}
          total={people.total}
          page={people.page}
          pageSize={PEOPLE_PAGE_SIZE}
          totalPages={people.totalPages}
          loading={people.loading}
          error={people.error}
          onRetry={people.reload}
          onPageChange={people.setPage}
          search={search}
          onSearchChange={setSearch}
          onOpenPerson={(row) => setQuery({ odam: row.id })}
          onBack={() => setQuery({ kriteriya: null, guruh: null })}
        />
      )}

      {level === 'events' && criterion && (
        <section className="glass p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuery({ kriteriya: null, guruh: null })}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-indigo-600"
              >
                <ArrowLeft size={14} />
                Kriteriyalar
              </button>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">{criterion.title}</h3>
                <p className="text-[11px] text-slate-500">{events.total} ta signal · kadr bilan</p>
              </div>
            </div>
            <SegmentedControl
              size="sm"
              ariaLabel="Signal holati"
              value={activeBucket}
              onChange={(value) => setQuery({ guruh: value })}
              options={criterion.buckets.map((item) => ({
                value: item.key,
                label: item.label,
                count: item.count,
              }))}
            />
          </div>

          {events.error && <ErrorState message={events.error} onRetry={events.reload} />}

          {events.loading && events.items.length === 0 ? (
            <SkeletonTable rows={5} columns={4} />
          ) : events.items.length === 0 ? (
            <EmptyState compact title="Bu davrda signal yo'q" description="Boshqa davrni tanlab ko'ring." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/70">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Vaqt</th>
                    <th className="px-4 py-3">Kamera</th>
                    <th className="px-4 py-3">Kim</th>
                    <th className="px-4 py-3">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/60">
                  {events.items.map((event) => (
                    <tr
                      key={event.id}
                      onClick={() => setOpenEvent(event)}
                      className="cursor-pointer transition-colors hover:bg-white/50"
                    >
                      <td className="px-4 py-2.5 text-slate-700" title={event.timestamp}>
                        {event.occurredAt ? relativeTime(event.occurredAt) : event.timestamp}
                        <span className="block font-mono text-[11px] text-slate-400">{event.timestamp}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {event.cameraName}
                        <span className="block text-[11px] text-slate-400">{event.building}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{event.personName || '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            event.status === 'tasdiqlangan'
                              ? 'red'
                              : event.status === 'rad_etilgan'
                                ? 'slate'
                                : 'amber'
                          }
                        >
                          {event.status === 'tasdiqlangan'
                            ? 'Tasdiqlangan'
                            : event.status === 'rad_etilgan'
                              ? 'Rad etilgan'
                              : "Ko'rilmagan"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4">
                <Pagination
                  page={events.page}
                  totalPages={events.totalPages}
                  total={events.total}
                  pageSize={EVENTS_PAGE_SIZE}
                  onChange={events.setPage}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {level === 'person' && (
        <PersonReport
          person={person}
          loading={personLoading}
          error={personError}
          onRetry={reloadPerson}
          onBack={() => setQuery({ odam: null })}
          backLabel={criterion ? criterion.title : 'Kriteriyalar'}
        />
      )}

      <EventDrawer
        event={openEvent}
        onClose={() => setOpenEvent(null)}
        onReview={() => setOpenEvent(null)}
      />
    </div>
  );
}
