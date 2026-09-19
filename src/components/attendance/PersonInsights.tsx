import { CalendarDays, Clock, Flame, LogIn, QrCode, ScanFace, UserX } from 'lucide-react';
import { ButtonLink, Button, Card, CardHeader, StatTile, cn, formatPercent, type StatDelta } from '../../ui';
import { LATE_CUTOFF_MINUTES, type PersonKpis, type WeekdayStat } from '../../lib/studentAttendance';

function minutesClock(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

function delta(cur: number | null, prev: number | null | undefined, better: StatDelta['better'], unit = ''): StatDelta | null {
  if (cur === null || prev === null || prev === undefined) return null;
  const v = Math.round((cur - prev) * 10) / 10;
  return { value: v, better, display: `${v > 0 ? '+' : ''}${v.toLocaleString('ru-RU')}${unit}` };
}

/** Xodim uchun davr KPI'lari: oldingi xuddi shunday davrga nisbatan o'zgarish bilan. */
export function StaffKpis({
  current,
  previous,
  days,
  lateCutoff = LATE_CUTOFF_MINUTES,
}: {
  current: PersonKpis;
  previous: PersonKpis | null;
  days: number;
  /** Kechikish chegarasi (daqiqa) — attendance_policy. */
  lateCutoff?: number;
}) {
  const arrivalLate = current.avgArrivalMinutes !== null && current.avgArrivalMinutes > lateCutoff;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Davomat"
        value={formatPercent(current.rate, 1)}
        progress={current.rate}
        delta={delta(current.rate, previous?.rate, 'up', ' pp')}
        hint={`${current.presentDays} / ${current.presentDays + current.absentDays} ish kuni`}
      />
      <StatTile
        label="O'rtacha kelish"
        value={minutesClock(current.avgArrivalMinutes)}
        icon={LogIn}
        tone={arrivalLate ? 'warning' : 'info'}
        delta={delta(current.avgArrivalMinutes, previous?.avgArrivalMinutes, 'down', ' daq')}
        hint={arrivalLate ? `${minutesClock(lateCutoff)} dan kech` : `chegara ${minutesClock(lateCutoff)}`}
      />
      <StatTile
        label="Kech qolgan kunlar"
        value={current.lateDays}
        unit="kun"
        icon={Clock}
        tone="warning"
        delta={delta(current.lateDays, previous?.lateDays, 'down')}
        hint={current.punctualPct !== null ? `${formatPercent(current.punctualPct)} o'z vaqtida` : undefined}
      />
      <StatTile
        label="Kelmagan kunlar"
        value={current.absentDays}
        unit="kun"
        icon={UserX}
        tone="danger"
        delta={delta(current.absentDays, previous?.absentDays, 'down')}
      />
      <StatTile
        label="O'z vaqtida seriya"
        value={current.onTimeStreak}
        unit="kun"
        icon={Flame}
        tone={current.onTimeStreak >= 5 ? 'success' : 'neutral'}
        hint={previous ? `ketma-ket · Δ — oldingi ${days} kunga nisbatan` : 'ketma-ket, kechikmasdan'}
      />
    </div>
  );
}

/** Hafta kunlari naqshi: o'rtacha kelish va kechikishlar — qaysi kun "og'ir". */
export function WeekdayPatternCard({ rows, lateCutoff = LATE_CUTOFF_MINUTES }: { rows: WeekdayStat[]; lateCutoff?: number }) {
  const withData = rows.filter((r) => r.days > 0);
  const worst = withData.reduce<WeekdayStat | null>((w, r) => (!w || r.late + r.absent > w.late + w.absent ? r : w), null);
  // Shkala: 07:30 … 10:00
  const lo = 450;
  const hi = 600;
  const pos = (m: number) => `${Math.min(100, Math.max(0, ((m - lo) / (hi - lo)) * 100))}%`;
  return (
    <Card>
      <CardHeader
        title="Hafta kunlari"
        subtitle={worst && worst.late + worst.absent > 0 ? `Eng og'ir kun — ${worst.label}: ${worst.late} kech, ${worst.absent} kelmagan` : "O'rtacha kelish vaqti va kechikishlar"}
        icon={CalendarDays}
      />
      {withData.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Bu davrda yozuv yo&apos;q</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.weekday} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_5.5rem] items-center gap-3 text-[13px]">
              <span className={cn('font-medium', r === worst && r.late + r.absent > 0 ? 'text-warning' : 'text-fg')}>{r.label}</span>
              <div className="relative h-2 rounded-full bg-surface-2" aria-hidden="true">
                <span className="absolute inset-y-[-3px] w-px bg-warning" style={{ left: pos(lateCutoff) }} />
                {r.avgArrivalMinutes !== null && (
                  <span
                    className={cn(
                      'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface',
                      r.avgArrivalMinutes > lateCutoff ? 'bg-warning' : 'bg-primary',
                    )}
                    style={{ left: pos(r.avgArrivalMinutes) }}
                  />
                )}
              </div>
              <span className="text-right font-semibold tabular-nums text-fg">{minutesClock(r.avgArrivalMinutes)}</span>
              <span className="text-right text-xs tabular-nums text-muted">
                {r.days === 0 ? '—' : (
                  <>
                    <span className={r.late ? 'font-semibold text-warning' : undefined}>{r.late}</span> kech
                    {r.absent > 0 && <span className="text-danger"> · {r.absent}</span>}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <span className="h-3 w-px bg-warning" aria-hidden="true" /> {minutesClock(lateCutoff)} chegara · shkala 07:30–10:00
      </p>
    </Card>
  );
}

/** Yuzi yo'q odam uchun: nima uchun davomat yo'qligi va qanday tuzatish. */
export function EnrollCta({ student, group, pending, onOpenGroup, registryLink }: { student: boolean; group: string | null; pending: boolean; onOpenGroup?: () => void; registryLink: string }) {
  const enrollLink = `/royxatdan-otish${group ? `?guruh=${encodeURIComponent(group)}` : ''}`;
  return (
    <div className="flex flex-col gap-4 rounded-card border border-dashed border-primary/40 bg-primary-soft/40 p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ScanFace size={22} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{pending ? 'Yuzi tasdiq kutmoqda' : "Yuzi hali topshirilmagan"}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          Kameralar bu {student ? 'talabani' : 'xodimni'} taniy olmaydi — davomat avtomatik yozilmaydi, bo&apos;sh kunlar «kelmagan» degani emas.
          {student ? ' Talaba telefonida QR orqali 1 daqiqada topshiradi.' : ' Yuzni «Reestr» bo‘limida qo‘shing.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {pending ? (
          <ButtonLink to={registryLink} size="sm" variant="primary">
            Reestrda tasdiqlash
          </ButtonLink>
        ) : student ? (
          <>
            {onOpenGroup && group && (
              <Button size="sm" variant="primary" icon={QrCode} onClick={onOpenGroup}>
                Guruh QR kartasi
              </Button>
            )}
            <ButtonLink to={enrollLink} size="sm" variant="secondary">
              Ro&apos;yxatdan o&apos;tish sahifasi
            </ButtonLink>
          </>
        ) : (
          <ButtonLink to={registryLink} size="sm" variant="primary">
            Reestrda yuz qo&apos;shish
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
