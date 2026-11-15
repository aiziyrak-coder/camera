/* Ochiq ro'yxatdan o'tish: odam telefonidan o'zi yuzini kiritadi.
 * Qadamlar: aniqlash → tasdiqlash → rozilik → yuz → tayyor. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown, Clock, ScanFace, UserRound } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { branding } from '../../lib/branding';
import {
  fetchConsentText,
  listEnrollmentFaculties,
  listEnrollmentGroups,
  listEnrollmentUnits,
  lookupPerson,
  registerSelf,
  submitEnrollment,
  type ConsentText,
  type EnrollmentFaculty,
  type EnrollmentGroup,
  type EnrollmentIdentity,
  type EnrollmentLookupResult,
  type EnrollmentRegisterInput,
  type EnrollmentUnit,
} from '../../lib/enrollment';
import { Alert, Button, Field, Segmented, Select, cn } from '../../kit';
import FaceScan from './FaceScan';

type Step = 'identify' | 'register' | 'confirm' | 'consent' | 'photo' | 'success';
type Method = 'pinfl' | 'passport';

const PINFL_LENGTH = 14;
const STEPS: Step[][] = [['identify', 'register'], ['confirm'], ['consent'], ['photo']];

/** 422 va 5xx xabarlari inglizcha yoki texnik — o'rniga tushunarli matn. */
function userMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 422 || err.status >= 500) return fallback;
  return err.message;
}

export default function EnrollPage() {
  const [params] = useSearchParams();
  const groupHint = (params.get('guruh') ?? '').trim().slice(0, 60);
  const [step, setStep] = useState<Step>('identify');
  const [method, setMethod] = useState<Method>('pinfl');
  const [pinfl, setPinfl] = useState('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [found, setFound] = useState<EnrollmentLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = `Ro‘yxatdan o‘tish · ${branding.orgName}`;
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const identity: EnrollmentIdentity =
    method === 'pinfl' ? { kind: 'pinfl', pinfl } : { kind: 'passport', passportSeries: series, passportNumber: number };

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotFound(false);
    setLoading(true);
    try {
      setFound(await lookupPerson(identity));
      setStep('confirm');
    } catch (err) {
      // 404 = "topilmadi yoki raqam xato" — server ikkisini ataylab ajratmaydi.
      if (err instanceof ApiError && err.status === 404) {
        setError(err.message);
        setNotFound(true);
      } else {
        setError(userMessage(err, 'So‘rovni bajarib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(input: EnrollmentRegisterInput) {
    setError(null);
    setLoading(true);
    try {
      setFound(await registerSelf(input));
      setStep('confirm');
    } catch (err) {
      setError(userMessage(err, 'Ro‘yxatdan o‘tkazib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleFrames(frames: Blob[]) {
    if (!found) return;
    setError(null);
    setCaptureError(null);
    setLoading(true);
    try {
      const result = await submitEnrollment(found.recordId, identity, frames, consent);
      setAwaitingApproval(Boolean(result.awaitingApproval));
      setStep('success');
    } catch (err) {
      setCaptureError(userMessage(err, 'Yuzni saqlab bo‘lmadi. Qayta urinib ko‘ring.'));
    } finally {
      setLoading(false);
    }
  }

  /** Boshidan: bitta telefondan navbatma-navbat bir necha kishi foydalanadi. */
  function restart() {
    setStep('identify');
    setFound(null);
    setError(null);
    setNotFound(false);
    setConsent(false);
    setCaptureError(null);
    setAwaitingApproval(false);
    setPinfl('');
    setSeries('');
    setNumber('');
  }

  const stepIndex = STEPS.findIndex((group) => group.includes(step));

  return (
    <div className="enroll min-h-full overflow-y-auto bg-white sm:bg-side">
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col px-5 pb-10 pt-5 sm:pt-10">
        <header className="flex items-center gap-2.5">
          <span className="bg-brand-grad flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-btn">
            <ScanFace size={17} aria-hidden />
          </span>
          <span className="flex-1 text-[14px] font-semibold text-ink">{branding.orgName}</span>
          {step !== 'success' && (
            <span className="tnum text-[12.5px] font-medium text-faint">
              {stepIndex + 1} / {STEPS.length}
            </span>
          )}
        </header>

        {step !== 'success' && (
          <div className="mt-6 flex gap-1.5" aria-label={`${stepIndex + 1}-qadam, jami ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= stepIndex ? 'bg-brand' : 'bg-sunk')} />
            ))}
          </div>
        )}

        <main className="mt-6 sm:rounded-xl sm:border sm:border-line sm:bg-white sm:p-7">
          {groupHint && step === 'identify' && (
            <p className="mb-4 rounded-lg border border-line bg-side px-3.5 py-2.5 text-[14px] text-ink">
              Guruh: <b>{groupHint}</b>
            </p>
          )}

          {step === 'identify' && (
            <form onSubmit={handleLookup} className="flex flex-col gap-5">
              <Title title="Yuzingizni ro‘yxatdan o‘tkazing" text="Avval o‘zingizni topamiz. Pasportingizdagi 14 xonali JSHSHIR raqamini kiriting." />
              <Segmented
                value={method}
                onChange={(v) => {
                  setMethod(v);
                  setError(null);
                  setNotFound(false);
                }}
                options={[
                  { value: 'pinfl', label: 'JSHSHIR' },
                  { value: 'passport', label: 'Pasport' },
                ]}
                className="w-full"
              />
              {method === 'pinfl' ? (
                <Field label="JSHSHIR" hint={`${pinfl.length} / ${PINFL_LENGTH} raqam`}>
                  <input
                    className="input h-12 font-mono text-[18px] tracking-wider"
                    value={pinfl}
                    onChange={(e) => setPinfl(e.target.value.replace(/\D/g, '').slice(0, PINFL_LENGTH))}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    placeholder="00000000000000"
                  />
                </Field>
              ) : (
                <div className="grid grid-cols-[96px_1fr] gap-3">
                  <Field label="Seriya">
                    <input
                      className="input h-12 uppercase"
                      value={series}
                      onChange={(e) => setSeries(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="AD"
                      autoComplete="off"
                      autoCapitalize="characters"
                    />
                  </Field>
                  <Field label="Raqam">
                    <input
                      className="input h-12"
                      value={number}
                      onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="1234567"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </Field>
                </div>
              )}
              {error && <Alert>{error}</Alert>}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                loading={loading}
                disabled={method === 'pinfl' ? pinfl.length !== PINFL_LENGTH : !series || !number}
              >
                Davom etish
              </Button>
              {notFound && (
                <Button size="lg"
                  block
                  onClick={() => {
                    setError(null);
                    setNotFound(false);
                    setStep('register');
                  }}
                >
                  Meni ro‘yxatdan topa olmadi — ma’lumotlarimni kiritaman
                </Button>
              )}
            </form>
          )}

          {step === 'register' && (
            <SelfRegister
              pinfl={method === 'pinfl' ? pinfl : undefined}
              passportSeries={method === 'passport' ? series : undefined}
              passportNumber={method === 'passport' ? number : undefined}
              initialGroup={groupHint}
              submitting={loading}
              error={error}
              onSubmit={handleRegister}
              onBack={restart}
            />
          )}

          {step === 'confirm' && found && (
            <div className="flex flex-col gap-5">
              <Title title="Bu sizmisiz?" />
              <div className="flex items-center gap-4 rounded-xl border border-line bg-side p-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-white text-faint">
                  <UserRound size={28} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold leading-snug text-ink">{found.fullName}</p>
                  <p className="mt-0.5 text-[14px] text-soft">
                    {found.typeLabel} · {found.groupOrPosition}
                  </p>
                </div>
              </div>
              {found.alreadyEnrolled ? (
                <Alert tone="ok">Siz allaqachon ro‘yxatdan o‘tgansiz. Hech narsa qilish shart emas.</Alert>
              ) : (
                <>
                  {found.awaitingApproval && (
                    <Alert tone="warn">Yuzingiz avval yuborilgan va tasdiq kutmoqda. Xohlasangiz, qaytadan olishingiz mumkin.</Alert>
                  )}
                  <Button variant="primary" size="lg" block onClick={() => setStep('consent')}>
                    Ha, bu men
                  </Button>
                </>
              )}
              <Button size="lg" variant="ghost" icon={ArrowLeft} block onClick={restart}>
                Yo‘q, qaytadan kiritaman
              </Button>
            </div>
          )}

          {step === 'consent' && (
            <Consent
              onBack={() => setStep('confirm')}
              onContinue={(agreed) => {
                setConsent(agreed);
                setCaptureError(null);
                setStep('photo');
              }}
            />
          )}

          {step === 'photo' && <FaceScan onSubmit={handleFrames} submitting={loading} externalError={captureError} />}

          {step === 'success' && found && (
            <div className="flex flex-col items-center py-4 text-center" role="status">
              <span className={cn('flex h-20 w-20 items-center justify-center rounded-full', awaitingApproval ? 'bg-warn-tint text-warn' : 'bg-ok-tint text-ok')}>
                {awaitingApproval ? <Clock size={40} aria-hidden /> : <CheckCircle2 size={40} aria-hidden />}
              </span>
              <p className="mt-5 text-[22px] font-semibold text-ink">{awaitingApproval ? 'Qabul qilindi' : 'Tayyor!'}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-soft">
                {awaitingApproval
                  ? `${found.fullName}, yuzingiz qabul qilindi. Administrator tekshirgandan keyin tasdiqlanadi.`
                  : `${found.fullName}, yuzingiz muvaffaqiyatli saqlandi.`}
              </p>
              <Button size="lg" className="mt-8" block onClick={restart}>
                Boshqa odamni ro‘yxatdan o‘tkazish
              </Button>
            </div>
          )}
        </main>

        <p className="mt-5 px-2 text-center text-[13px] leading-relaxed text-faint">
          Ma’lumotlaringiz faqat {branding.orgName} ichida davomat va xavfsizlik uchun ishlatiladi.
        </p>
      </div>
    </div>
  );
}

function Title({ title, text }: { title: string; text?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
      {text && <p className="mt-2 text-[15px] leading-relaxed text-soft">{text}</p>}
    </div>
  );
}

function Consent({ onContinue, onBack }: { onContinue: (agreed: boolean) => void; onBack: () => void }) {
  const [text, setText] = useState<ConsentText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchConsentText()
      .then((data) => !cancelled && setText(data))
      .catch((err) => !cancelled && setError(userMessage(err, 'Matnni yuklab bo‘lmadi. Internetni tekshiring.')));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <Alert>{error}</Alert>
        <Button size="lg" variant="primary" block onClick={() => setAttempt((n) => n + 1)}>
          Qayta urinish
        </Button>
        <Button size="lg" variant="ghost" icon={ArrowLeft} block onClick={onBack}>
          Orqaga
        </Button>
      </div>
    );
  }
  if (!text) return <p className="py-10 text-center text-[15px] text-soft">Yuklanmoqda...</p>;

  const canContinue = agreed || !text.required;

  return (
    <div className="flex flex-col gap-5">
      <Title
        title="Ruxsatingiz kerak"
        text="Kameralar sizni tanishi uchun yuzingiz rasmi saqlanadi. Rozilikni istalgan vaqtda qaytarib olishingiz mumkin."
      />
      <div className="overflow-hidden rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[14px] font-medium text-brand"
        >
          To‘liq matnni o‘qish
          <ChevronDown size={17} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
        {expanded && (
          <div className="max-h-72 space-y-3 overflow-y-auto border-t border-line px-4 py-3">
            <p className="text-[13px] text-faint">{text.controller}</p>
            {text.sections.map((s) => (
              <div key={s.title}>
                <p className="text-[14px] font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-soft">{s.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', agreed ? 'border-brand bg-brand-tint' : 'border-line')}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]" />
        <span className="text-[14px] leading-relaxed text-ink">{text.statement}</span>
      </label>
      <Button variant="primary" size="lg" block disabled={!canContinue} onClick={() => onContinue(agreed)}>
        Kamerani yoqish
      </Button>
      <Button size="lg" variant="ghost" icon={ArrowLeft} block onClick={onBack}>
        Orqaga
      </Button>
    </div>
  );
}

function SelfRegister({
  pinfl,
  passportSeries,
  passportNumber,
  initialGroup,
  submitting,
  error,
  onSubmit,
  onBack,
}: {
  pinfl?: string;
  passportSeries?: string;
  passportNumber?: string;
  initialGroup: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: EnrollmentRegisterInput) => void;
  onBack: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [type, setType] = useState<'talaba' | 'xodim'>('talaba');
  const [groupOrPosition, setGroupOrPosition] = useState(initialGroup);
  const [facultyId, setFacultyId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [faculties, setFaculties] = useState<EnrollmentFaculty[]>([]);
  const [groups, setGroups] = useState<EnrollmentGroup[]>([]);
  const [units, setUnits] = useState<EnrollmentUnit[]>([]);

  useEffect(() => {
    listEnrollmentFaculties().then(setFaculties).catch(() => undefined);
    listEnrollmentGroups().then(setGroups).catch(() => undefined);
    listEnrollmentUnits().then(setUnits).catch(() => undefined);
  }, []);

  const name = fullName.trim();
  const unit = groupOrPosition.trim();
  const valid = name.length >= 3 && unit.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          fullName: name,
          type,
          groupOrPosition: unit,
          facultyId: facultyId || undefined,
          orgUnitId: type === 'xodim' ? orgUnitId || undefined : undefined,
          pinfl,
          passportSeries,
          passportNumber,
        });
      }}
      className="flex flex-col gap-4"
    >
      <Title title="Ma’lumotlaringiz" text="Ro‘yxatda topilmadingiz. Ma’lumotlaringizni kiriting — yangi yozuv ochamiz." />
      <Field label="Familiya, ism, sharif">
        <input className="input h-12" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" autoFocus />
      </Field>
      <Segmented
        value={type}
        onChange={(next) => {
          setType(next);
          if (next === 'xodim' && groupOrPosition === initialGroup) setGroupOrPosition('');
        }}
        options={[
          { value: 'talaba', label: 'Talabaman' },
          { value: 'xodim', label: 'Xodimman' },
        ]}
        className="w-full"
      />
      {faculties.length > 0 && (
        <Field label="Fakultet (ixtiyoriy)">
          <Select value={facultyId} onChange={setFacultyId} placeholder="Tanlanmagan" options={faculties.map((f) => ({ value: f.id, label: f.name }))} className="h-12" />
        </Field>
      )}
      <Field label={type === 'talaba' ? 'Guruh' : 'Lavozim'}>
        <input
          className="input h-12"
          value={groupOrPosition}
          onChange={(e) => setGroupOrPosition(e.target.value)}
          list={type === 'talaba' && groups.length ? 'enroll-groups' : undefined}
          placeholder={type === 'talaba' ? 'Masalan: DI-2301' : 'Masalan: Laborant'}
          autoComplete="off"
        />
      </Field>
      {type === 'talaba' && groups.length > 0 && (
        <datalist id="enroll-groups">
          {groups
            .filter((g) => !facultyId || g.facultyId === facultyId)
            .map((g) => (
              <option key={g.name} value={g.name}>{`${g.course}-kurs`}</option>
            ))}
        </datalist>
      )}
      {type === 'xodim' && units.length > 0 && (
        <Field label="Kafedra yoki bo‘lim (ixtiyoriy)">
          <Select value={orgUnitId} onChange={setOrgUnitId} placeholder="Tanlanmagan" options={units.map((u) => ({ value: u.id, label: u.name }))} className="h-12" />
        </Field>
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={submitting} disabled={!valid}>
        Davom etish
      </Button>
      <Button size="lg" variant="ghost" icon={ArrowLeft} block onClick={onBack} disabled={submitting}>
        Orqaga
      </Button>
    </form>
  );
}
