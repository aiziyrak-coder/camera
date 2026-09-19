import { useEffect, useState } from 'react';
import { Building2, Camera as CameraIcon, ChevronDown, Clock, ExternalLink, Info, MapPin, ScanFace } from 'lucide-react';
import {
  Avatar,
  Badge,
  ButtonLink,
  Drawer,
  ErrorState,
  Skeleton,
  SkeletonText,
  StatusBadge,
  cn,
  focusRing,
  formatNumber,
  formatUzDate,
} from '../../ui';
import { api, isAbortError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { situationPaths } from '../../lib/situationApi';
import type { PersonDay, ReportPersonDetail } from '../../types';

/** 3-daraja: bitta odam — rasmi, kafedrasi va davr kesimi (o'ng panelda).
 *
 * "Isbot" shu yerda ikki bosqichli: kunlar ro'yxati qaysi kunlari
 * kelgani va kamera uni necha marta ko'rganini ko'rsatadi; kunni
 * bosganda o'sha kunning TASHRIFLARI ochiladi — qaysi kamera, qaysi
 * bino, soat nechada va qancha vaqt. To'liq tarix — /shaxs/:id. */

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-control border border-border bg-surface-2/60 px-3 py-2">
      <span className={cn('block text-lg font-semibold tabular-nums', tone ?? 'text-fg')}>{value}</span>
      <span className="block truncate text-[11px] font-medium text-muted">{label}</span>
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
  if (!day) return <SkeletonText lines={2} />;

  if (day.visits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Info size={12} aria-hidden="true" />
        Bu kuni kamera bu odamni umuman ko&apos;rmagan — ya&apos;ni tasdiqlovchi kadr yo&apos;q.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {day.visits.map((visit, index) => (
        <li
          key={`${visit.camera}-${visit.firstSeen}-${index}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-surface-2 px-3 py-2 text-xs"
        >
          <span className="inline-flex items-center gap-1 font-semibold text-fg">
            <CameraIcon size={12} className="text-primary" aria-hidden="true" />
            {visit.camera}
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <Building2 size={11} aria-hidden="true" />
            {visit.building || '—'} · {visit.zone}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums text-fg">
            <Clock size={11} className="text-muted" aria-hidden="true" />
            {visit.firstSeen}–{visit.lastSeen} ({visit.durationMinutes} daq)
          </span>
          <span className="text-muted">{visit.sightings} marta ko&apos;rilgan</span>
          <Badge>{visit.cameraRole}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default function PersonReport({
  personId,
  person,
  loading,
  error,
  onRetry,
  onClose,
}: {
  /** Ochiq odam (URL'dagi `?odam=`). null — panel yopiq. */
  personId: string | null;
  person: ReportPersonDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    // Boshqa odamga o'tilganda ochiq kun yopiladi.
    setOpenDay(null);
  }, [personId]);

  // Eski odamning ma'lumoti yangisi yuklanguncha ko'rinmasin.
  const current = person && person.id === personId ? person : null;

  return (
    <Drawer
      open={Boolean(personId)}
      onClose={onClose}
      size="lg"
      title={current?.fullName ?? 'Shaxs kesimi'}
      subtitle={current ? `${current.period.label} · ${current.type === 'talaba' ? 'Talaba' : 'Xodim'}` : undefined}
      actions={
        personId ? (
          <ButtonLink to={situationPaths.person(personId)} size="sm" variant="ghost" iconRight={ExternalLink}>
            Profil
          </ButtonLink>
        ) : undefined
      }
    >
      {error && !current ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && !current ? (
        <div className="space-y-4" aria-busy="true" aria-label="Yuklanmoqda">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-card" />
            <SkeletonText lines={3} className="flex-1" />
          </div>
          <Skeleton className="h-16 w-full" />
          <SkeletonText lines={6} />
        </div>
      ) : current ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={current.fullName} src={current.photoUrl} size="xl" shape="square" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">
                {current.faculty} · {current.unit}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <ScanFace size={13} className={current.biometricsStatus === 'tasdiqlangan' ? 'text-success' : 'text-danger'} aria-hidden="true" />
                  {current.biometricsStatus === 'tasdiqlangan' ? 'Yuzi tasdiqlangan' : "Yuzi ro'yxatda yo'q"}
                  {current.biometricsConfirmedLabel ? ` · ${current.biometricsConfirmedLabel}` : ''}
                </span>
                {current.buildings.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} aria-hidden="true" />
                    {current.buildings.join(', ')}
                  </span>
                )}
              </p>
              {current.note && <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-fg">{current.note}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Keldi" value={formatNumber(current.presentDays)} tone="text-success" />
            <Stat label="Kechikdi" value={formatNumber(current.lateDays)} tone="text-warning" />
            <Stat label="Kelmadi" value={formatNumber(current.absentDays)} tone="text-danger" />
            <Stat label="Davrdagi kunlar" value={formatNumber(current.workingDays)} />
            <Stat label="Kamerada ko'rinish" value={formatNumber(current.visits)} />
            <Stat label="Turli kamera" value={formatNumber(current.cameras)} />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Kunlar — kunni bosing, o&apos;sha kunning kamera isboti ochiladi</p>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
              {current.days.map((day) => {
                const open = openDay === day.date;
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      onClick={() => setOpenDay(open ? null : day.date)}
                      aria-expanded={open}
                      className={cn('flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-2', focusRing)}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                        <ChevronDown size={14} className={cn('text-subtle transition-transform', open && 'rotate-180')} aria-hidden="true" />
                        {formatUzDate(day.date, { year: false })}
                        <span className="font-normal text-muted">{day.weekday}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        {day.status ? <StatusBadge status={day.status} time={day.checkIn} /> : <Badge>Yozuv yo&apos;q</Badge>}
                        {day.checkOut && <span className="tabular-nums text-muted">→ {day.checkOut}</span>}
                        <span className="text-muted">
                          {day.visits > 0 ? `${day.visits} ta ko'rinish` : "ko'rinish yo'q"}
                          {day.firstCamera ? ` · ${day.firstCamera}` : ''}
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-border bg-surface px-3 py-2.5">
                        <DayVisits personId={current.id} date={day.date} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
