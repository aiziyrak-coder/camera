import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Camera as CameraIcon, Clock, Info, MapPin, ScanFace } from 'lucide-react';
import ErrorState from '../ui/ErrorState';
import { SkeletonBlock } from '../ui/Skeleton';
import { api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { PersonDay, ReportPersonDetail } from '../../types';

/** 3-daraja: bitta odam — rasmi, kafedrasi va davr kesimi.
 *
 * "Isbot" shu yerda ikki bosqichli: kunlar jadvali qaysi kunlari
 * kelgani va kamera uni necha marta ko'rganini ko'rsatadi; kunni
 * bosganda o'sha kunning TASHRIFLARI ochiladi — qaysi kamera, qaysi
 * bino, soat nechada va qancha vaqt. */
const STATUS_LABEL: Record<string, string> = {
  keldi: 'Keldi',
  kech_keldi: 'Kechikdi',
  kelmadi: 'Kelmadi',
  dam_olish: 'Dam olish',
};

const STATUS_TONE: Record<string, string> = {
  keldi: 'bg-emerald-50 text-emerald-700',
  kech_keldi: 'bg-amber-50 text-amber-700',
  kelmadi: 'bg-rose-50 text-rose-700',
  dam_olish: 'bg-slate-100 text-slate-500',
};

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-3 py-2">
      <span className={`block text-lg font-extrabold tabular-nums ${tone}`}>{value}</span>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

function DayVisits({ personId, date }: { personId: string; date: string }) {
  const { token } = useAuth();
  const [day, setDay] = useState<PersonDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDay(null);
    setError(null);
    api
      .get<PersonDay>(`/api/presence/people/${personId}/day?date=${date}`, token, { signal: controller.signal })
      .then(setDay)
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Kun tafsilotini yuklab bo'lmadi.");
      });
    return () => controller.abort();
  }, [personId, date, token]);

  if (error) return <ErrorState message={error} />;
  if (!day) return <SkeletonBlock className="h-24 rounded-xl" />;

  if (day.visits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        <Info size={12} />
        Bu kuni kamera bu odamni umuman ko&apos;rmagan — ya&apos;ni tasdiqlovchi kadr yo&apos;q.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {day.visits.map((visit, index) => (
        <li
          key={`${visit.camera}-${visit.firstSeen}-${index}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/70 px-3 py-2 text-[11px]"
        >
          <span className="flex items-center gap-1 font-bold text-slate-800">
            <CameraIcon size={12} className="text-indigo-500" />
            {visit.camera}
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Building2 size={11} />
            {visit.building || '—'} · {visit.zone}
          </span>
          <span className="flex items-center gap-1 tabular-nums text-slate-600">
            <Clock size={11} className="text-indigo-500" />
            {visit.firstSeen}–{visit.lastSeen} ({visit.durationMinutes} daq)
          </span>
          <span className="text-slate-400">{visit.sightings} marta ko&apos;rilgan</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">
            {visit.cameraRole}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PersonReport({
  person,
  loading,
  error,
  onRetry,
  onBack,
  backLabel,
}: {
  person: ReportPersonDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    // Boshqa odamga o'tilganda ochiq kun yopiladi.
    setOpenDay(null);
  }, [person?.id]);

  return (
    <section className="glass p-4 sm:p-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-indigo-600"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </button>

      {error && <ErrorState message={error} onRetry={onRetry} />}

      {loading && !person ? (
        <SkeletonBlock className="h-64 rounded-2xl" />
      ) : person ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt={person.fullName}
                className="h-24 w-24 rounded-2xl object-cover ring-2 ring-white"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-indigo-50 text-xl font-extrabold text-indigo-600">
                {person.initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-extrabold text-slate-900">{person.fullName}</h3>
              <p className="text-xs text-slate-500">
                {person.faculty} · {person.unit} · {person.type === 'talaba' ? 'Talaba' : 'Xodim'}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <ScanFace size={12} className={person.biometricsStatus === 'tasdiqlangan' ? 'text-emerald-500' : 'text-rose-500'} />
                  {person.biometricsStatus === 'tasdiqlangan' ? 'Yuzi tasdiqlangan' : "Yuzi ro'yxatda yo'q"}
                  {person.biometricsConfirmedLabel ? ` · ${person.biometricsConfirmedLabel}` : ''}
                </span>
                {person.buildings.length > 0 && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-indigo-500" />
                    {person.buildings.join(', ')}
                  </span>
                )}
              </p>
              {person.note && (
                <p className="mt-2 rounded-xl bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">{person.note}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Keldi" value={person.presentDays} tone="text-emerald-600" />
            <Stat label="Kechikdi" value={person.lateDays} tone="text-amber-600" />
            <Stat label="Kelmadi" value={person.absentDays} tone="text-rose-600" />
            <Stat label="Davrdagi kunlar" value={person.workingDays} />
            <Stat label="Kameradagi ko'rinish" value={person.visits} />
            <Stat label="Turli kamera" value={person.cameras} />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Kunlar — kunni bosing, o&apos;sha kunning kamera isboti ochiladi
            </p>
            <div className="space-y-1.5">
              {person.days.map((day) => {
                const open = openDay === day.date;
                return (
                  <div key={day.date} className="rounded-xl border border-white/70 bg-white/50">
                    <button
                      type="button"
                      onClick={() => setOpenDay(open ? null : day.date)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="tabular-nums">{day.date}</span>
                        <span className="text-slate-400">{day.weekday}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-0.5 font-bold ${
                            STATUS_TONE[day.status ?? ''] ?? 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {STATUS_LABEL[day.status ?? ''] ?? 'Yozuv yo‘q'}
                        </span>
                        {day.checkIn && <span className="tabular-nums text-slate-600">{day.checkIn}</span>}
                        {day.checkOut && <span className="tabular-nums text-slate-400">→ {day.checkOut}</span>}
                        <span className="text-slate-500">
                          {day.visits > 0 ? `${day.visits} ta ko'rinish` : "ko'rinish yo'q"}
                          {day.firstCamera ? ` · ${day.firstCamera}` : ''}
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-white/70 px-3 py-2">
                        <DayVisits personId={person.id} date={day.date} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
