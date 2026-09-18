import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import KpiTile from '../../components/ui/KpiTile';
import { SkeletonBlock } from '../../components/ui/Skeleton';
import DayDrawer from '../../components/attendance/DayDrawer';
import LiveArrivals from '../../components/attendance/LiveArrivals';
import MonthTrend from '../../components/attendance/MonthTrend';
import PersonPicker from '../../components/attendance/PersonPicker';
import { api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useLiveAttendance, type LiveAttendanceMessage } from '../../lib/realtime';
import {
  CELL_STATUS_LABEL,
  DEFAULT_WORKING_WEEKDAYS,
  buildMonthGrid,
  clockToMinutes,
  dayLabel,
  isValidMonth,
  keyboardTarget,
  leadingBlanks,
  monthLabel,
  monthOf,
  monthStats,
  shiftMonth,
  type CalendarCell,
  type CellStatus,
} from '../../lib/attendanceCalendar';
import { NO_FACULTY_LABEL } from '../../lib/peopleFilters';
import { UZ_WEEKDAYS_SHORT, formatMinutes, todayInTashkent } from '../../lib/uzDate';
import type { AttendanceDay, AttendancePerson, AttendanceSummary, StudentStaffRecord } from '../../types';

const SUMMARY_MONTHS = 6;
const MONTH_TTL_MS = 60_000;
const MONTH_CACHE_LIMIT = 60;
const MIN_RELIABLE_DAYS = 5;
const LIVE_FEED_SIZE = 12;
/** Katakdagi "binoda bo'lish" chizig'i shu davomiylikda to'la bo'ladi. */
const FULL_DAY_MINUTES = 9 * 60;

// Ko'rilgan oylar sahifadan chiqib qaytganda ham darhol chiziladi; bir
// daqiqadan eskisi fonda yangilanadi. Kalit — odam va oy.
const monthCache = new Map<string, { at: number; days: AttendanceDay[] }>();

function cacheKey(personId: string, month: string): string {
  return `${personId}:${month}`;
}

function rememberMonth(personId: string, month: string, days: AttendanceDay[]) {
  if (monthCache.size >= MONTH_CACHE_LIMIT) monthCache.clear();
  monthCache.set(cacheKey(personId, month), { at: Date.now(), days });
}

async function fetchMonth(personId: string, month: string, token: string, signal?: AbortSignal) {
  const days = await api.get<AttendanceDay[]>(`/api/attendance/${personId}?month=${month}`, token, { signal });
  rememberMonth(personId, month, days);
  return days;
}

const CELL_STYLE: Record<CellStatus, string> = {
  keldi: 'border-transparent bg-emerald-100 text-emerald-800',
  kech_keldi: 'border-transparent bg-amber-100 text-amber-800',
  kelmadi: 'border-transparent bg-red-100 text-red-700',
  dam_olish: 'border-transparent bg-slate-100/80 text-slate-400',
  malumot_yoq: 'border-dashed border-slate-300 bg-white/60 text-slate-500',
  kelajak: 'border-transparent bg-transparent text-slate-300',
};

const LEGEND: CellStatus[] = ['keldi', 'kech_keldi', 'kelmadi', 'malumot_yoq', 'dam_olish'];

const BIOMETRICS: Record<AttendancePerson['biometricsStatus'], { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  tasdiqlangan: { label: 'Yuzi tasdiqlangan', tone: 'green' },
  kutilmoqda: { label: 'Yuzi kutilmoqda', tone: 'amber' },
  yoq: { label: "Yuzi yo'q", tone: 'slate' },
};

function signed(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const text = String(Math.abs(rounded)).replace('.', ',');
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${text}${unit}`;
}

function percent(value: number): string {
  return `${String(value).replace('.', ',')}%`;
}

function PersonHeader({ person }: { person: AttendancePerson }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const biometrics = BIOMETRICS[person.biometricsStatus];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/55 p-3">
      {person.biometricPhotoUrl && !photoFailed ? (
        <img
          src={person.biometricPhotoUrl}
          alt=""
          onError={() => setPhotoFailed(true)}
          className="h-12 w-12 shrink-0 rounded-xl object-cover ring-2 ring-white"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-700">
          {person.initials}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-extrabold text-slate-900">{person.fullName}</p>
        <p className="truncate text-xs text-slate-500">
          {[person.type === 'talaba' ? 'Talaba' : 'Xodim', person.faculty || NO_FACULTY_LABEL, person.unit]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Badge tone={biometrics.tone}>{biometrics.label}</Badge>
    </div>
  );
}

function DayCell({
  cell,
  selected,
  onOpen,
}: {
  cell: CalendarCell;
  selected: boolean;
  onOpen: (date: string) => void;
}) {
  const future = cell.status === 'kelajak';
  const details = [
    CELL_STATUS_LABEL[cell.status],
    cell.checkIn ? `keldi ${cell.checkIn}` : null,
    cell.checkOut ? `ketdi ${cell.checkOut}` : null,
    cell.earlyLeave ? 'erta ketdi' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const fill = cell.presenceMinutes ? Math.min(cell.presenceMinutes / FULL_DAY_MINUTES, 1) : 0;

  return (
    <button
      type="button"
      data-date={cell.date}
      disabled={future}
      onClick={() => onOpen(cell.date)}
      aria-label={`${dayLabel(cell.date)} — ${details}`}
      title={details}
      className={`relative flex min-h-[3rem] flex-col justify-between rounded-lg border p-1.5 text-left transition sm:min-h-[4.25rem] sm:p-2 ${
        CELL_STYLE[cell.status]
      } ${future ? 'cursor-default' : 'hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'} ${
        cell.isToday ? 'ring-2 ring-indigo-500' : ''
      } ${selected ? 'shadow-[0_0_0_3px_rgba(79,70,229,0.35)]' : ''}`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={`text-xs sm:text-sm ${cell.isToday ? 'font-extrabold' : 'font-bold'}`}>{cell.day}</span>
        {cell.earlyLeave && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
      </span>
      {cell.checkIn && (
        <span className="hidden truncate text-[10px] font-semibold tabular-nums opacity-80 sm:block">
          {cell.checkIn}
          {cell.checkOut ? `–${cell.checkOut}` : ''}
        </span>
      )}
      {fill > 0 && (
        <span
          className="absolute inset-x-1.5 bottom-1 h-[3px] overflow-hidden rounded-full bg-black/5"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-current opacity-50"
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </span>
      )}
    </button>
  );
}

export default function AttendancePage() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayInTashkent();
  const currentMonth = monthOf(today);
  // Chuqur havola: ?person=<id>&month=YYYY-MM ("Talabalar va Xodimlar",
  // "O'qituvchilar kuzatuvi" sahifalaridan). Kelajak oy joriy oyga qisqaradi.
  const personId = params.get('person') ?? '';
  const monthParam = params.get('month');
  const month = isValidMonth(monthParam) && monthParam < currentMonth ? monthParam : currentMonth;

  const [picked, setPicked] = useState<AttendancePerson | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [records, setRecords] = useState<AttendanceDay[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [recordsVersion, setRecordsVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [liveArrivals, setLiveArrivals] = useState<LiveAttendanceMessage[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  // Kamera odamni tanishi bilan: jonli ro'yxatga qo'shiladi, ochiq turgan
  // odamning oyi esa keshsiz qayta so'raladi — sahifani yangilash shart emas.
  useLiveAttendance((message) => {
    setLiveArrivals((prev) =>
      [message, ...prev.filter((item) => item.personId !== message.personId || item.date !== message.date)].slice(
        0,
        LIVE_FEED_SIZE,
      ),
    );
    if (message.personId === personId && monthOf(message.date) === month) {
      monthCache.delete(cacheKey(personId, month));
      setRecordsVersion((v) => v + 1);
      setSummaryVersion((v) => v + 1);
    }
  });

  const activeSummary = summary && summary.person.id === personId ? summary : null;
  const person = activeSummary?.person ?? (picked?.id === personId ? picked : null);
  const workingWeekdays = activeSummary?.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS;

  useEffect(() => {
    if (!token || !personId) return;
    const controller = new AbortController();
    setSummaryError(null);
    api
      .get<AttendanceSummary>(`/api/attendance/${personId}/summary?months=${SUMMARY_MONTHS}`, token, {
        signal: controller.signal,
      })
      .then(setSummary)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setSummaryError(err instanceof Error ? err.message : "Ma'lumotni olib bo'lmadi");
      });
    return () => controller.abort();
  }, [token, personId, summaryVersion]);

  useEffect(() => {
    if (!token || !personId) return;
    const cached = monthCache.get(cacheKey(personId, month));
    setRecords(cached ? cached.days : null);
    setRecordsError(null);
    if (cached && Date.now() - cached.at < MONTH_TTL_MS) return;
    const controller = new AbortController();
    fetchMonth(personId, month, token, controller.signal)
      .then(setRecords)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setRecordsError(err instanceof Error ? err.message : "Davomatni olib bo'lmadi");
      });
    return () => controller.abort();
  }, [token, personId, month, recordsVersion]);

  // Qo'shni oylar oldindan yuklanadi — oy almashtirish tarmoqni kutmaydi.
  const monthLoaded = records !== null;
  useEffect(() => {
    if (!token || !personId || !monthLoaded) return;
    const neighbours = [shiftMonth(month, -1), shiftMonth(month, 1)].filter(
      (candidate) => candidate <= currentMonth && !monthCache.has(cacheKey(personId, candidate)),
    );
    if (neighbours.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      for (const candidate of neighbours) {
        fetchMonth(personId, candidate, token, controller.signal).catch(() => undefined);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [token, personId, month, currentMonth, monthLoaded]);

  const cells = useMemo(
    () => buildMonthGrid(records ?? [], month, today, workingWeekdays),
    [records, month, today, workingWeekdays],
  );
  const stats = useMemo(() => monthStats(cells), [cells]);
  const selectedIndex = selectedDate ? cells.findIndex((cell) => cell.date === selectedDate) : -1;
  const selectedCell = selectedIndex >= 0 ? cells[selectedIndex] : null;
  const prevCell = selectedIndex > 0 ? cells[selectedIndex - 1] : null;
  const nextCell =
    selectedIndex >= 0 && selectedIndex < cells.length - 1 && cells[selectedIndex + 1].status !== 'kelajak'
      ? cells[selectedIndex + 1]
      : null;

  const previous = activeSummary?.months.find((m) => m.month === shiftMonth(month, -1) && m.recordedDays > 0) ?? null;
  const rateDelta =
    stats.rate !== null && previous?.rate != null ? Math.round((stats.rate - previous.rate) * 10) / 10 : null;
  const arrivalDelta =
    stats.avgArrival && previous?.avgArrival
      ? Math.round(clockToMinutes(stats.avgArrival) - clockToMinutes(previous.avgArrival))
      : null;
  const presenceDelta =
    stats.avgPresenceMinutes !== null && previous?.avgPresenceMinutes != null
      ? stats.avgPresenceMinutes - previous.avgPresenceMinutes
      : null;
  const rateNote =
    stats.recordedDays === 0
      ? "Bu oyda yozuv yo'q"
      : stats.recordedDays < MIN_RELIABLE_DAYS
        ? `Faqat ${stats.recordedDays} ta yozuvli kun — xulosa uchun kam`
        : `${stats.recordedDays} ta yozuvli kun`;

  function choosePerson(record: StudentStaffRecord) {
    setPicked({
      id: record.id,
      fullName: record.fullName,
      type: record.type,
      faculty: record.faculty,
      unit: record.groupOrPosition,
      biometricsStatus: record.biometricsStatus,
      initials: record.initials,
      biometricPhotoUrl: record.biometricPhotoUrl ?? null,
    });
    setSelectedDate(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('person', record.id);
      return next;
    });
  }

  function goToMonth(target: string) {
    setSelectedDate(null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (target >= currentMonth) next.delete('month');
        else next.set('month', target);
        return next;
      },
      { replace: true },
    );
  }

  /** Saqlash/o'chirishdan keyin: keshdagi oy darhol yangilanadi, yig'indi qayta so'raladi. */
  function applyDays(date: string, update: (days: AttendanceDay[]) => AttendanceDay[]) {
    const monthKey = monthOf(date);
    const base = monthCache.get(cacheKey(personId, monthKey))?.days ?? (monthKey === month ? (records ?? []) : []);
    const next = update(base).sort((a, b) => a.date.localeCompare(b.date));
    rememberMonth(personId, monthKey, next);
    if (monthKey === month) setRecords(next);
    setSummaryVersion((v) => v + 1);
  }

  function handleGridKey(event: KeyboardEvent<HTMLDivElement>) {
    if (selectedDate) return;
    const date = (event.target as HTMLElement).dataset.date;
    const target = date ? keyboardTarget(date, event.key) : null;
    if (!target || monthOf(target) !== month) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`);
    if (button && !button.disabled) {
      event.preventDefault();
      button.focus();
    }
  }

  return (
    <section className="glass p-4 sm:p-6">
      <PageHeader
        title="Davomat kalendari"
        subtitle="Odamning oylik davomati, har kuni qayerda ko'ringani va qo'lda tuzatish"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PersonPicker
          onSelect={choosePerson}
          placeholder={personId ? 'Boshqa odamni qidirish...' : "Ism-familiya yoki JSHSHIR bo'yicha qidiring"}
        />
        {personId && (
          <div className="flex items-center gap-1 sm:ml-auto">
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(month, -1))}
              aria-label="Oldingi oy"
              className="rounded-xl bg-white/60 p-2 text-slate-500 transition-colors hover:bg-white hover:text-indigo-600"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-32 text-center text-sm font-bold text-slate-900" aria-live="polite">
              {monthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(month, 1))}
              disabled={month >= currentMonth}
              aria-label="Keyingi oy"
              className="rounded-xl bg-white/60 p-2 text-slate-500 transition-colors hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
            {month !== currentMonth && (
              <button type="button" onClick={() => goToMonth(currentMonth)} className="btn-glass ml-1 text-xs">
                Joriy oy
              </button>
            )}
          </div>
        )}
      </div>

      {!personId && (
        <LiveArrivals
          items={liveArrivals}
          onOpen={(id) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('person', id);
              return next;
            })
          }
        />
      )}

      {!personId ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Davomatini ko'rish uchun odamni tanlang"
          description="Ism-familiya yoki JSHSHIR bo'yicha qidiring. «Talabalar va Xodimlar» sahifasidagi «Davomat» tugmasi ham shu yerga olib keladi."
        />
      ) : (
        <>
          {person ? (
            <PersonHeader key={person.id} person={person} />
          ) : summaryError ? (
            <div className="mb-4">
              <ErrorState message={summaryError} onRetry={() => setSummaryVersion((v) => v + 1)} />
            </div>
          ) : (
            <SkeletonBlock className="mb-4 h-[74px] w-full rounded-2xl" />
          )}

          {person && person.biometricsStatus !== 'tasdiqlangan' && (
            <div className="mb-4 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-semibold">
                  {person.biometricsStatus === 'kutilmoqda' ? 'Yuzi hali tasdiqlanmagan.' : "Yuzi ro'yxatga olinmagan."}
                </span>{' '}
                {
                  "Kameralar bu odamni taniy olmaydi — davomat avtomatik yozilmaydi va bo'sh kunlar «kelmagan» degani emas. Yuzni «Talabalar va Xodimlar → Tahrirlash» orqali yoki ro'yxatdan o'tish sahifasida qo'shing."
                }
              </p>
            </div>
          )}

          {stats.recordedDays > 0 && stats.present + stats.late === 0 && (
            <div className="mb-4 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-semibold">{"Bu oyda birorta ham «Keldi» yo'q."}</span>{' '}
                {
                  "«Kelmadi» kun oxirida kamera tanimagan yuzi tasdiqlangan odamga avtomatik qo'yiladi — bu kameralar uni tanimaganini ham bildirishi mumkin. «O'qituvchilar kuzatuvi → Davomat kameralari» bo'limidagi tashxisni tekshiring."
                }
              </p>
            </div>
          )}

          {records === null && !recordsError ? (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonBlock key={i} className="h-[104px] rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiTile
                label="Davomat"
                value={stats.rate === null ? '—' : percent(stats.rate)}
                previousLabel="O'tgan oy"
                previous={previous?.rate != null ? percent(previous.rate) : null}
                delta={rateDelta}
                deltaDisplay={rateDelta === null ? null : signed(rateDelta, ' f.p.')}
                better="up"
                trend={activeSummary?.months.map((m) => m.rate) ?? []}
                note={rateNote}
                reliable={stats.recordedDays === 0 || stats.recordedDays >= MIN_RELIABLE_DAYS}
              />
              <KpiTile
                label="Kech keldi"
                value={`${stats.late} kun`}
                previousLabel="O'tgan oy"
                previous={previous ? `${previous.late} kun` : null}
              />
              <KpiTile
                label="Kelmadi"
                value={`${stats.absent} kun`}
                previousLabel="O'tgan oy"
                previous={previous ? `${previous.absent} kun` : null}
              />
              <KpiTile
                label="Erta ketdi"
                value={`${stats.earlyLeave} kun`}
                previousLabel="O'tgan oy"
                previous={previous ? `${previous.earlyLeave} kun` : null}
              />
              <KpiTile
                label="O'rtacha kelish"
                value={stats.avgArrival ?? '—'}
                previousLabel="O'tgan oy"
                previous={previous?.avgArrival ?? null}
                delta={arrivalDelta}
                deltaDisplay={arrivalDelta === null ? null : signed(arrivalDelta, ' daq')}
                better="down"
              />
              <KpiTile
                label="Binoda o'rtacha"
                value={formatMinutes(stats.avgPresenceMinutes)}
                previousLabel="O'tgan oy"
                previous={previous?.avgPresenceMinutes != null ? formatMinutes(previous.avgPresenceMinutes) : null}
                delta={presenceDelta}
                deltaDisplay={presenceDelta === null ? null : signed(presenceDelta, ' daq')}
                better="up"
              />
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="rounded-2xl border border-white/70 bg-white/45 p-3 sm:p-4">
              {recordsError ? (
                <ErrorState message={recordsError} onRetry={() => setRecordsVersion((v) => v + 1)} />
              ) : (
                <>
                  <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide sm:gap-1.5">
                    {UZ_WEEKDAYS_SHORT.map((label, index) => (
                      <span
                        key={label}
                        className={workingWeekdays.includes(index + 1) ? 'text-slate-500' : 'text-slate-300'}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  {records === null ? (
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                      {Array.from({ length: 35 }, (_, i) => (
                        <SkeletonBlock key={i} className="min-h-[3rem] rounded-lg sm:min-h-[4.25rem]" />
                      ))}
                    </div>
                  ) : (
                    <div
                      ref={gridRef}
                      role="group"
                      aria-label={`${monthLabel(month)} — davomat kalendari`}
                      onKeyDown={handleGridKey}
                      className="grid grid-cols-7 gap-1 sm:gap-1.5"
                    >
                      {Array.from({ length: leadingBlanks(month) }, (_, i) => (
                        <span key={`blank-${i}`} aria-hidden="true" />
                      ))}
                      {cells.map((cell) => (
                        <DayCell
                          key={cell.date}
                          cell={cell}
                          selected={cell.date === selectedDate}
                          onOpen={setSelectedDate}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/70 pt-3 text-[11px] text-slate-500">
                {LEGEND.map((status) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span className={`h-3 w-3 rounded border ${CELL_STYLE[status]}`} aria-hidden="true" />
                    {CELL_STATUS_LABEL[status]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                  Erta ketdi
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-4 rounded-full bg-slate-400/60" aria-hidden="true" />
                  {"Binoda bo'lish (9 soat — to'liq)"}
                </span>
              </div>
              {stats.missingWorkDays > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {`«Ma'lumot yo'q» — o'tgan ish kunida yozuv yo'q (${stats.missingWorkDays} kun). Bu kelmagan degani emas: kamera tanimagan yoki davomat moduli o'chirilgan bo'lishi mumkin.`}
                </p>
              )}
            </div>

            {activeSummary ? (
              <MonthTrend months={activeSummary.months} activeMonth={month} onPick={goToMonth} />
            ) : summaryError ? (
              <ErrorState message={summaryError} onRetry={() => setSummaryVersion((v) => v + 1)} />
            ) : (
              <SkeletonBlock className="h-72 rounded-2xl" />
            )}
          </div>
        </>
      )}

      {personId && (
        <DayDrawer
          open={selectedCell !== null}
          personId={personId}
          personName={person?.fullName ?? ''}
          cell={selectedCell}
          onClose={() => setSelectedDate(null)}
          onPrev={prevCell ? () => setSelectedDate(prevCell.date) : undefined}
          onNext={nextCell ? () => setSelectedDate(nextCell.date) : undefined}
          onSaved={(day) => applyDays(day.date, (days) => [...days.filter((d) => d.date !== day.date), day])}
          onDeleted={(date) => applyDays(date, (days) => days.filter((d) => d.date !== date))}
        />
      )}
    </section>
  );
}
