import { useEffect, useState } from 'react';
import { Clock, LogIn, LogOut, Save } from 'lucide-react';
import { Button, Card, ErrorState, Field, Input, Page, Skeleton, useToast } from '../../ui';
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

/** Ish vaqti: kim "kech keldi" hisoblanishi shu yerda belgilanadi. */
const SUBTITLE = "Kim o'z vaqtida, kim kech kelgani shu qoidadan hisoblanadi";
const BREADCRUMBS = [{ label: 'Sozlamalar' }, { label: 'Ish vaqti' }];

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
        <Skeleton className="h-80 rounded-card" />
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="space-y-5 p-5">
          <fieldset disabled={!canEdit} className="grid gap-4 border-0 p-0 sm:grid-cols-2">
            <Field label="Xodimlar ish boshlanishi" error={errors.staffStart}>
              <Input type="time" value={current.staffStart} onChange={(e) => set({ staffStart: e.target.value })} />
            </Field>
            <Field label="Talabalar dars boshlanishi" error={errors.studentStart}>
              <Input type="time" value={current.studentStart} onChange={(e) => set({ studentStart: e.target.value })} />
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
              <Input type="time" value={current.workEnd} onChange={(e) => set({ workEnd: e.target.value })} />
            </Field>
          </fieldset>

          <div>
            <p className="mb-2 text-[13px] font-medium text-fg">Ish kunlari</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ish kunlari">
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
                    className={
                      on
                        ? 'h-9 w-11 rounded-control border border-primary bg-primary text-[13px] font-medium text-primary-fg disabled:opacity-60'
                        : 'h-9 w-11 rounded-control border border-border bg-surface-2 text-[13px] font-medium text-muted hover:text-fg disabled:opacity-60'
                    }
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

          <label className="flex items-start gap-2.5 text-[13px] text-fg">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              disabled={!canEdit}
              checked={current.trackLastSeen}
              onChange={(e) => set({ trackLastSeen: e.target.checked })}
            />
            <span>
              Ketish vaqtini yozish
              <span className="block text-xs text-muted">
                Kunning oxirgi marta istalgan kamerada ko&apos;ringan vaqti — &quot;Ketdi&quot;
              </span>
            </span>
          </label>
        </Card>

        <Card className="space-y-4 p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
            <Clock size={16} aria-hidden="true" /> Qanday hisoblanadi
          </p>
          <ol className="space-y-3 text-[13px] text-muted">
            <li className="flex gap-2">
              <LogIn size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <b className="text-fg">Kelish vaqti</b> — odam kun davomida{' '}
                <b className="text-fg">istalgan kamerada birinchi marta</b> ko&apos;ringan payt (faqat eshikda emas).
              </span>
            </li>
            <li className="rounded-control bg-surface-2 p-3 leading-6">
              Xodim: <b className="tabular-nums text-fg">{staffLate}</b> gacha —{' '}
              <span className="font-medium text-success">keldi</span>, keyin —{' '}
              <span className="font-medium text-warning">kech keldi</span>
              <br />
              Talaba: <b className="tabular-nums text-fg">{studentLate}</b> gacha —{' '}
              <span className="font-medium text-success">keldi</span>, keyin —{' '}
              <span className="font-medium text-warning">kech keldi</span>
            </li>
            <li className="flex gap-2">
              <LogOut size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <b className="text-fg">Ketish vaqti</b> — kunning oxirgi ko&apos;rinishi.{' '}
                <b className="tabular-nums text-fg">{current.workEnd || '—'}</b> dan oldin bo&apos;lsa — erta ketgan.
              </span>
            </li>
            <li className="text-xs">
              Saqlanganda oxirgi 60 kundagi yozuvlar ham yangi qoida bo&apos;yicha qayta hisoblanadi (kelish vaqtlari
              o&apos;zgarmaydi).
            </li>
          </ol>
        </Card>
      </div>
    </Page>
  );
}
