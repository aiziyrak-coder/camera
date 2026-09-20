import { useEffect, useState, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import {
  Button,
  CodeText,
  DocumentFooter,
  DocumentHeader,
  ErrorState,
  Field,
  Input,
  IntelPanel,
  MicroLabel,
  Page,
  Skeleton,
  StatusLamp,
  cn,
  focusRing,
  useToast,
} from '../../ui';
import { branding } from '../../lib/branding';
import { Notice } from '../../components/settings/kit';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { usePermissions } from '../../lib/permissions';
import {
  addMinutes,
  getAttendancePolicy,
  saveAttendancePolicy,
  validateAttendancePolicy,
  type AttendancePolicyErrors,
  type AttendancePolicyInput,
} from '../../lib/attendancePolicyApi';

/** ISO hafta kuni: qisqartma (tugmada) va to'liq nomi (ekran o'quvchi
 *  va sichqoncha izohi uchun — "Pa" nimani anglatishi ko'rinmasdi). */
const DAYS: [number, string, string][] = [
  [1, 'Du', 'Dushanba'],
  [2, 'Se', 'Seshanba'],
  [3, 'Ch', 'Chorshanba'],
  [4, 'Pa', 'Payshanba'],
  [5, 'Ju', 'Juma'],
  [6, 'Sh', 'Shanba'],
  [7, 'Ya', 'Yakshanba'],
];

/** Server saqlangandan keyin oxirgi shuncha kundagi yozuvlarni qayta
 *  hisoblaydi (camera-api/app/routers/attendance_policy.py:RECOMPUTE_DAYS). */
const RECOMPUTE_DAYS = 60;

/** Nizomdagi bandlar soni — panel sarlavhasidagi hisob bilan bir xil. */
const CLAUSES = 5;

/** Ish vaqti: kim "kech keldi" hisoblanishi shu yerda belgilanadi. */
const SUBTITLE = "Kim o'z vaqtida, kim kech kelgani shu qoidadan hisoblanadi";
const BREADCRUMBS = [{ label: 'Sozlamalar' }, { label: 'Ish vaqti' }];

/**
 * Nizom raqami — QOIDANING O'ZIDAN kelib chiqadi, vaqtdan emas.
 * Shu sabab bir xil qoida har doim bir xil raqam ostida chiqadi va
 * chop etilgan nusxani ekrandagi bilan solishtirsa bo'ladi.
 *
 *   workHoursReference({ staffStart: '09:00', graceMinutes: 15, workDays: [1,2,3,4,5] })
 *     === 'IV-0900-G15-5K'
 */
export function workHoursReference(policy: Pick<AttendancePolicyInput, 'staffStart' | 'graceMinutes' | 'workDays'>): string {
  const start = (policy.staffStart || '').replace(/[^0-9]/g, '').padEnd(4, '-').slice(0, 4);
  const grace = Number.isFinite(policy.graceMinutes)
    ? String(Math.max(0, Math.trunc(policy.graceMinutes))).padStart(2, '0')
    : '--';
  const days = Array.isArray(policy.workDays) ? policy.workDays.length : 0;
  return `IV-${start}-G${grace}-${days}K`;
}

/** Nizom bandi: raqam, sarlavha va matn. */
function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-3 py-2">
      <CodeText className="mt-0.5 w-8 shrink-0 text-[11px] font-semibold text-subtle">
        {String(n).padStart(2, '0')}.
      </CodeText>
      <div className="min-w-0 flex-1">
        <MicroLabel className="!text-fg">{title}</MicroLabel>
        <p className="mt-0.5 text-[13px] leading-6 text-muted">{children}</p>
      </div>
    </li>
  );
}

export default function WorkHoursPage() {
  const { token, role } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const canEdit = can('manageAttendance', role);
  const [form, setForm] = useState<AttendancePolicyInput | null>(null);
  /** Serverdan kelgan asl nusxa — "o'zgardimi?" shundan aniqlanadi. */
  const [saved, setSaved] = useState<AttendancePolicyInput | null>(null);
  const [errors, setErrors] = useState<AttendancePolicyErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);
  /** "Saqlash" bosilgandan keyingi tasdiq bosqichi — saqlash serverda
   *  oxirgi 60 kundagi yozuvlarni QAYTA HISOBLAYDI, ya'ni allaqachon
   *  ko'rilgan hisobotlardagi "keldi/kech keldi" o'zgarishi mumkin.
   *  Ilgari bu og'ir amal bitta bosishdan ogohlantirishsiz ketardi. */
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // So'rov javobi kech kelganda (token almashdi yoki sahifa yopildi)
    // eski qoida formani bosib ketmasin.
    let alive = true;
    getAttendancePolicy(token)
      .then((p) => {
        if (!alive) return;
        const next: AttendancePolicyInput = {
          staffStart: p.staffStart,
          studentStart: p.studentStart,
          graceMinutes: p.graceMinutes,
          workEnd: p.workEnd,
          workDays: p.workDays,
          trackLastSeen: p.trackLastSeen,
        };
        setForm(next);
        setSaved(next);
        setErrors({});
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "Qoidani yuklab bo'lmadi");
      });
    return () => {
      alive = false;
    };
  }, [token, nonce]);

  /** Saqlanmagan o'zgarish bormi — hook'lar erta `return`dan oldin
   *  chaqirilishi shart, shuning uchun shu yerda hisoblanadi. */
  const dirty = form !== null && saved !== null && JSON.stringify(saved) !== JSON.stringify(form);

  // Saqlamay chiqib ketilsa ogohlantiriladi: sahifada boshqa hech qanday
  // avtosaqlash yo'q, yopilgan tab bilan qoida o'zgarishi yo'qolardi.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Sarlavha uchta holatda ham bir xil — aks holda yuklanishdan
  // yuklangan holatga o'tganda sahifa boshi sakrardi.
  if (error) {
    return (
      <Page title="Ish vaqti" subtitle={SUBTITLE} breadcrumbs={BREADCRUMBS}>
        <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
      </Page>
    );
  }
  if (!form) {
    return (
      <Page title="Ish vaqti" subtitle={SUBTITLE} breadcrumbs={BREADCRUMBS}>
        <Skeleton className="h-80" />
      </Page>
    );
  }

  const current = form;
  const set = (patch: Partial<AttendancePolicyInput>) => {
    // Qiymat o'zgardi — avval so'ralgan tasdiq endi boshqa qoidaga
    // tegishli bo'lardi, shuning uchun bekor qilinadi.
    setConfirming(false);
    setForm({ ...current, ...patch });
  };
  const staffLate = addMinutes(current.staffStart, current.graceMinutes);
  const studentLate = addMinutes(current.studentStart, current.graceMinutes);
  const reference = workHoursReference(current);
  const workDaysLabel = DAYS.filter(([d]) => current.workDays.includes(d))
    .map(([, , full]) => full)
    .join(', ');

  /** Birinchi bosish — tekshirish va tasdiq so'rash; ikkinchisi — saqlash. */
  function requestSave() {
    const found = validateAttendancePolicy(current);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setConfirming(false);
      toast.error("Qoida saqlanmadi — qizil bilan belgilangan maydonlarni to'g'rilang");
      return;
    }
    setConfirming(true);
  }

  async function save() {
    const found = validateAttendancePolicy(current);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setConfirming(false);
      toast.error("Qoida saqlanmadi — qizil bilan belgilangan maydonlarni to'g'rilang");
      return;
    }
    setSaving(true);
    try {
      const res = await saveAttendancePolicy(token, current);
      setSaved(current);
      setConfirming(false);
      toast.success(
        res.recomputed
          ? `Saqlandi. Oxirgi ${RECOMPUTE_DAYS} kundagi ${res.recomputed} ta yozuv yangi qoida bo'yicha qayta hisoblandi`
          // "Saqlandi" ning o'zi savol tug'dirardi: qayta hisoblash
          // ishladimi yoki yo'qmi bilinmasdi.
          : `Saqlandi. Oxirgi ${RECOMPUTE_DAYS} kunda o'zgartirish talab qiladigan yozuv topilmadi`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Ish vaqti"
      subtitle={SUBTITLE}
      breadcrumbs={BREADCRUMBS}
      actions={
        <span title={canEdit ? undefined : "Davomatni boshqarish huquqi yo'q — Foydalanuvchilar bo'limida yoqiladi"}>
          <Button variant="primary" icon={Save} loading={saving} disabled={!canEdit || !dirty} onClick={requestSave}>
            Saqlash
          </Button>
        </span>
      }
    >
      <DocumentHeader
        org={branding.orgFullName}
        title="Ish vaqti nizomi"
        reference={reference}
        readouts={[
          { label: 'Xodim', value: current.staffStart || '—', title: 'Xodimlar uchun ish boshlanish vaqti' },
          { label: 'Talaba', value: current.studentStart || '—', title: 'Talabalar uchun dars boshlanish vaqti' },
          { label: 'Ruxsat', value: `${current.graceMinutes} daq`, title: 'Kechikishga ruxsat etilgan daqiqa' },
          { label: 'Ish kunlari', value: `${current.workDays.length} kun`, title: workDaysLabel },
          { label: 'Holat', value: dirty ? 'Saqlanmagan' : 'Kuchda' },
        ]}
      />

      {!canEdit && (
        <Notice tone="neutral">
          Qoidani faqat ko&apos;rib turibsiz. O&apos;zgartirish uchun &quot;Davomat&quot; huquqi kerak.
        </Notice>
      )}

      {/* Og'ir amal oldidan tasdiq: saqlash faqat qoidani yozib qo'ymaydi,
          balki oxirgi 60 kundagi davomat yozuvlarini qayta hisoblaydi. */}
      {confirming && !saving && (
        <Notice
          tone="warning"
          title="Saqlashdan oldin tasdiqlang"
          action={
            <span className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Bekor qilish
              </Button>
              <Button variant="primary" size="sm" onClick={save}>
                Ha, saqlansin
              </Button>
            </span>
          }
        >
          Yangi qoida darhol kuchga kiradi va oxirgi {RECOMPUTE_DAYS} kundagi yozuvlarning holati (
          <b>keldi</b> / <b>kech keldi</b>) qaytadan hisoblanadi. Allaqachon chop etilgan hisobot va tabeldagi
          sonlar o&apos;zgarishi mumkin. Kelish vaqtlari va qo&apos;lda tuzatilgan yozuvlar tegilmaydi.
        </Notice>
      )}

      {/* Qayta hisoblash bir necha soniya davom etishi mumkin — tugmadagi
          aylanma yetarli emas, nima bo'layotgani yozib turiladi. */}
      {saving && (
        <Notice tone="info" title="Saqlanmoqda">
          Qoida yozilmoqda va oxirgi {RECOMPUTE_DAYS} kundagi yozuvlar qayta hisoblanmoqda. Ma&apos;lumot ko&apos;p
          bo&apos;lsa bu bir necha soniya olishi mumkin — sahifani yopmang.
        </Notice>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <IntelPanel title="Qoida maydonlari" code={reference} bodyClassName="divide-y divide-border">
          <fieldset disabled={!canEdit} className="grid gap-x-4 gap-y-3 border-0 p-3 sm:grid-cols-2">
            <Field label="Xodimlar ish boshlanishi" error={errors.staffStart}>
              <Input className="intel-code" type="time" value={current.staffStart} onChange={(e) => set({ staffStart: e.target.value })} />
            </Field>
            <Field label="Talabalar dars boshlanishi" error={errors.studentStart}>
              <Input className="intel-code" type="time" value={current.studentStart} onChange={(e) => set({ studentStart: e.target.value })} />
            </Field>
            <Field
              label="Kechikishga ruxsat (daqiqa)"
              error={errors.graceMinutes}
              hint="Shu daqiqagacha kelganlar o'z vaqtida hisoblanadi"
            >
              {/* Qiymat jimgina 0..180 ga "qisib" qo'yilmaydi: ilgari 200
                  yozilsa maydonda 180 paydo bo'lardi va foydalanuvchi o'zi
                  yozgan sonni yo'qotardi. Endi chegara xatosi ko'rsatiladi
                  (validateAttendancePolicy). */}
              <Input
                className="intel-code"
                type="number"
                min={0}
                max={180}
                value={current.graceMinutes}
                invalid={Boolean(errors.graceMinutes)}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  set({ graceMinutes: Number.isFinite(raw) ? Math.trunc(raw) : 0 });
                }}
              />
            </Field>
            <Field label="Ish tugashi" error={errors.workEnd} hint="Undan oldin oxirgi marta ko'ringan — erta ketgan">
              <Input className="intel-code" type="time" value={current.workEnd} onChange={(e) => set({ workEnd: e.target.value })} />
            </Field>
          </fieldset>

          <div className="p-3">
            <MicroLabel className="!text-fg">Ish kunlari</MicroLabel>
            <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Ish kunlari">
              {DAYS.map(([day, label, fullName]) => {
                const on = current.workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    aria-label={fullName}
                    title={`${fullName} — ${on ? 'ish kuni' : 'dam olish kuni'}`}
                    disabled={!canEdit}
                    onClick={() =>
                      set({
                        workDays: on
                          ? current.workDays.filter((d) => d !== day)
                          : [...current.workDays, day].sort((a, b) => a - b),
                      })
                    }
                    className={cn(
                      'intel-code h-9 w-11 border text-[13px] font-semibold disabled:opacity-60',
                      on
                        ? 'border-primary bg-primary text-primary-fg'
                        : 'border-border bg-surface-2 text-muted hover:text-fg',
                      focusRing,
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.workDays ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.workDays}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">Dam olish kunlari kech qolish hisoblanmaydi</p>
            )}
          </div>

          <label className="flex items-start gap-2.5 p-3 text-[13px] text-fg">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              disabled={!canEdit}
              checked={current.trackLastSeen}
              onChange={(e) => set({ trackLastSeen: e.target.checked })}
            />
            <span className="min-w-0">
              Ketish vaqtini yozish
              <span className="block text-xs text-muted">
                Kunning oxirgi marta istalgan kamerada ko&apos;ringan vaqti — &quot;Ketdi&quot;
              </span>
            </span>
          </label>
        </IntelPanel>

        {/* Hisoblash tartibi — nizom bandlari ko'rinishida: raqamlangan,
            vaqtlar monoshriftda, har band bitta qoidani aytadi. */}
        <IntelPanel title="Hisoblash tartibi" code={`${CLAUSES} band`} bodyClassName="min-w-0">
          <ol className="divide-y divide-border">
            <Clause n={1} title="Kelish vaqti">
              Odam kun davomida <b className="font-semibold text-fg">istalgan kamerada birinchi marta</b> ko&apos;ringan
              payt qayd etiladi (faqat eshikda emas).
            </Clause>
            <Clause n={2} title="Xodim — kech kelish chegarasi">
              <CodeText className="font-semibold text-fg">{staffLate}</CodeText> gacha kelgan xodim{' '}
              <span className="font-medium text-success">keldi</span>, keyin kelgani{' '}
              <span className="font-medium text-warning">kech keldi</span> hisoblanadi.
            </Clause>
            <Clause n={3} title="Talaba — kech kelish chegarasi">
              <CodeText className="font-semibold text-fg">{studentLate}</CodeText> gacha kelgan talaba{' '}
              <span className="font-medium text-success">keldi</span>, keyin kelgani{' '}
              <span className="font-medium text-warning">kech keldi</span> hisoblanadi.
            </Clause>
            <Clause n={4} title="Ketish vaqti">
              Kunning oxirgi ko&apos;rinishi ketish vaqti sanaladi.{' '}
              <CodeText className="font-semibold text-fg">{current.workEnd || '—'}</CodeText> dan oldin bo&apos;lsa — erta
              ketgan.
            </Clause>
            <Clause n={5} title="Qayta hisoblash">
              Qoida saqlanganda oxirgi <CodeText className="font-semibold text-fg">{RECOMPUTE_DAYS}</CodeText> kundagi
              yozuvlar ham yangi chegara bo&apos;yicha qayta hisoblanadi (kelish vaqtlarining o&apos;zi
              o&apos;zgarmaydi).
            </Clause>
          </ol>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border bg-surface-2/60 px-3 py-2">
            <StatusLamp
              status={current.trackLastSeen ? 'ok' : 'idle'}
              label={current.trackLastSeen ? 'Ketish vaqti yoziladi' : 'Ketish vaqti yozilmaydi'}
            />
            <StatusLamp status={dirty ? 'warn' : 'ok'} label={dirty ? 'Saqlanmagan' : 'Kuchda'} />
          </div>
        </IntelPanel>
      </div>

      <DocumentFooter
        note={
          <>
            Nizom raqami <CodeText>{reference}</CodeText>. Ish kunlari:{' '}
            <CodeText>{current.workDays.length}</CodeText> kun · kechikishga ruxsat{' '}
            <CodeText>{current.graceMinutes}</CodeText> daqiqa. Qoida saqlangan zahoti kuchga kiradi.
          </>
        }
      />
    </Page>
  );
}
