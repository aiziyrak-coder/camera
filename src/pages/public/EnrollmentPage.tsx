import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Clock, IdCard, RotateCcw, ScanFace, UserCheck, UserPlus } from 'lucide-react';
import EnrollmentConsent from '../../components/public/EnrollmentConsent';
import EnrollmentFaceCapture from '../../components/public/EnrollmentFaceCapture';
import EnrollmentRegisterForm from '../../components/public/EnrollmentRegisterForm';
import { Notice, Segmented } from '../../components/settings/kit';
import { Avatar, Button, Card, Field, Input, cn } from '../../ui';
import { ApiError } from '../../lib/apiClient';
import { branding } from '../../lib/branding';
import { ENROLL_CODE_LENGTH, isEnrollCodeComplete, normalizeEnrollCode } from '../../lib/enrollCode';
import {
  type EnrollmentLookupResult,
  type EnrollmentRegisterInput,
  type EnrollmentIdentity,
  lookupPerson,
  registerSelf,
  submitEnrollment,
} from '../../lib/enrollment';

/** 'consent' — yuzni skanerlashdan oldin: biometrik ma'lumotni qayta
 *  ishlashga rozilik. Kamera faqat undan keyin yoqiladi. */
type Step = 'identify' | 'register' | 'confirm' | 'consent' | 'photo' | 'success';

/** Shaxsni aniqlash usuli.
 *
 *  JSHSHIR standart tanlov: institut kadrlar ro'yxati aynan shu raqam
 *  bilan yuritiladi va ommaviy kiritilgan xodimlarda pasport ma'lumoti
 *  umuman yo'q. Pasport yo'li ilgari shu tarzda ro'yxatdan o'tganlar
 *  uchun qoldirilgan. */
type Method = 'pinfl' | 'passport';

const METHOD_OPTIONS = [
  { value: 'pinfl' as const, label: 'JSHSHIR' },
  { value: 'passport' as const, label: 'Pasport' },
];

/** Bosqichlar ko'rsatkichi: odam telefonda qayerda turganini va nechta qadam qolganini ko'radi. */
const PROGRESS = ['Aniqlash', 'Tasdiqlash', 'Rozilik', 'Yuz'] as const;

/** JSHSHIR uzunligi — bitta joyda, chunki u uchta joyda ishlatiladi
 *  (yorliq, hisoblagich, tekshiruv) va ular bir-biriga zid bo'lib
 *  qolgan edi. */
const PINFL_LENGTH = 14;

/** Kodda YO'Q, lekin odam adashib yozishi mumkin bo'lgan belgilar.
 *  normalizeEnrollCode ularni jimgina tashlab yuboradi — odam esa
 *  nima uchun terayotgan harfi ekranga chiqmayotganini tushunmaydi. */
const CONFUSABLE_CODE_CHARS = /[OI01]/i;

function progressIndex(step: Step): number {
  switch (step) {
    case 'identify':
    case 'register':
      return 0;
    case 'confirm':
      return 1;
    case 'consent':
      return 2;
    case 'photo':
      return 3;
    case 'success':
      return PROGRESS.length;
  }
}

/**
 * Serverdan kelgan xatoni ochiq sahifada ko'rsatishga yaroqli holga
 * keltiradi.
 *
 * 422 — pydantic tekshiruvi: xabari doim ingliz tilida ("field
 * required", "value is not a valid integer") va butunlay o'zbekcha
 * sahifada odamni sarosimaga solardi. 5xx — "Internal Server Error".
 * Ikkala holda ham o'zimizning tushunarli matnimiz ko'rsatiladi;
 * qolgan xatolar (400/404/409) serverda ataylab o'zbekcha yozilgan va
 * aynan shundayligicha foydali.
 */
function userMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 422 || err.status >= 500) return fallback;
  return err.message;
}

function StepProgress({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Ro'yxatdan o'tish bosqichlari">
      {PROGRESS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="min-w-0" aria-current={active ? 'step' : undefined}>
            <div className={cn('h-1 rounded-full transition-colors', done ? 'bg-success' : active ? 'bg-primary' : 'bg-surface-3')} />
            <p className={cn('mt-1.5 flex items-center gap-1 truncate text-xs', active ? 'font-semibold text-fg' : done ? 'text-success' : 'text-subtle')}>
              {done && <Check size={12} aria-hidden="true" className="shrink-0" />}
              <span className="truncate">{label}</span>
            </p>
          </li>
        );
      })}
      {/* Bosqich almashgani ekranni ko'rmaydigan foydalanuvchiga
          aytilsin: chiziqchalarning rangi o'zgargani unga hech narsa
          bildirmaydi, sahifa esa jimgina butunlay boshqa formaga
          almashadi. */}
      <li className="sr-only" aria-live="polite">
        {current < PROGRESS.length
          ? `${current + 1}-bosqich: ${PROGRESS[current]}`
          : 'Barcha bosqichlar bajarildi'}
      </li>
    </ol>
  );
}

export default function EnrollmentPage() {
  const [searchParams] = useSearchParams();
  // QR kartadan kelganda (?guruh=DI-2301) — guruh nomi eslatma sifatida ko'rsatiladi.
  const groupHint = (searchParams.get('guruh') ?? '').trim().slice(0, 60);
  // QR kartada kod ham bor (?kod=K7M2XR) — telefonda uni qo'lda terish
  // shart emas. Havolasiz kelgan odam kodni o'zi kiritadi.
  const codeHint = normalizeEnrollCode(searchParams.get('kod'));
  const [step, setStep] = useState<Step>('identify');
  const [method, setMethod] = useState<Method>('pinfl');
  const [code, setCode] = useState(codeHint);
  /** Odam kodga O/I/0/1 terdimi — tushuntirish ko'rsatish uchun. */
  const [codeConfusable, setCodeConfusable] = useState(false);
  // Topilmadi: yozuvi yo'q odam shu tugma orqali o'zini qo'shadi.
  // Avval bu avtomatik bo'lardi, lekin endi "topilmadi" javobi
  // "kod noto'g'ri" bilan bir xil — ya'ni sababini faqat odamning
  // o'zi biladi va tanlovni ham o'zi qilishi kerak.
  const [notFound, setNotFound] = useState(false);
  const [pinfl, setPinfl] = useState('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [found, setFound] = useState<EnrollmentLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = `Ro'yxatdan o'tish · ${branding.systemName}`;
    return () => {
      document.title = previous;
    };
  }, []);

  // Har yangi bosqichda sahifa tepasiga — telefonda oldingi forma pastda qolib ketmasin.
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
      const result = await lookupPerson(identity, code);
      setFound(result);
      setStep('confirm');
    } catch (err) {
      // 404 — "topilmadi YOKI kod noto'g'ri". Server ataylab ikkisini
      // ajratmaydi: aks holda begona odam kodni to'g'ri topganini
      // javobdan bilib olardi. Shuning uchun bu yerda ham avtomatik
      // ravishda "o'zini qo'shish"ga o'tilmaydi — xabar ko'rsatiladi
      // va tanlov odamning o'ziga qoldiriladi.
      if (err instanceof ApiError && err.status === 404) {
        setError(err.message);
        setNotFound(true);
      } else {
        setError(userMessage(err, "So'rovni bajarib bo'lmadi. Internet aloqasini tekshirib, qayta urinib ko'ring."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(input: EnrollmentRegisterInput) {
    setError(null);
    setLoading(true);
    try {
      const created = await registerSelf(input, code);
      setFound(created);
      setStep('confirm');
    } catch (err) {
      setError(userMessage(err, "Ro'yxatdan o'tkazib bo'lmadi. Ma'lumotlarni tekshirib, qayta urinib ko'ring."));
    } finally {
      setLoading(false);
    }
  }

  async function handleFramesSubmit(frames: Blob[]) {
    if (!found) return;
    setError(null);
    setCaptureError(null);
    setLoading(true);
    try {
      const result = await submitEnrollment(found.recordId, identity, frames, consent, code);
      setAwaitingApproval(Boolean(result.awaitingApproval));
      setStep('success');
    } catch (err) {
      // Xato bo'lsa kamera qadamida qolamiz va bosqichlar boshidan
      // boshlanadi. Server qaysi kadr o'tmaganini aytadi — bu xabar
      // komponentga uzatiladi, chunki "tekshiruvdan o'tmadingiz" degan
      // umumiy xabar odamni nima qilishni bilmay qoldirardi.
      setCaptureError(userMessage(err, "Yuzni saqlab bo'lmadi. Qayta urinib ko'ring."));
    } finally {
      setLoading(false);
    }
  }

  /** Birinchi bosqichga to'liq qaytish.
   *
   *  Rozilik va kamera qadamining holati ham tozalanadi: bu sahifa
   *  ommaviy va bitta telefondan navbatma-navbat bir necha kishi
   *  foydalanadi. Ilgari `consent` va `captureError` tozalanmasdi —
   *  ya'ni oldingi odam qo'ygan rozilik belgisi keyingisining
   *  so'roviga qo'shilib ketardi, ekranda esa unga aloqasi yo'q eski
   *  xato osilib turardi. */
  function restartIdentify() {
    setStep('identify');
    setFound(null);
    setError(null);
    setNotFound(false);
    setConsent(false);
    setCaptureError(null);
    setAwaitingApproval(false);
  }

  // JSHSHIR qat'iy 14 raqam. Ilgari bu yerda ham, maydonning
  // minLength'ida ham 13 turardi — natijada 13 raqamli (ya'ni bitta
  // raqami tushib qolgan) qiymat brauzer tekshiruvidan o'tib ketib,
  // serverdan "topilmadi" javobini olardi va odam sababini bilmasdi.
  const pinflShort = method === 'pinfl' && pinfl.length > 0 && pinfl.length < PINFL_LENGTH;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pb-10">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
          <ScanFace size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">Yuzni ro'yxatdan o'tkazish</h1>
          <p className="mt-0.5 text-sm text-muted">Kameralar sizni tanishi va davomat avtomatik belgilanishi uchun.</p>
        </div>
      </header>

      <StepProgress current={progressIndex(step)} />

      <Card padding="lg" className="flex flex-col gap-4">
        {error && <Notice tone="danger">{error}</Notice>}
        {groupHint && step !== 'success' && (
          <Notice tone="info" title={`Guruh: ${groupHint}`}>
            {step === 'register'
              ? `«Guruh» maydoniga «${groupHint}» deb yozing.`
              : codeHint
                ? "Bu havola guruhingiz uchun berilgan va guruh kodi ham unga kiritilgan. JSHSHIR bilan o'zingizni toping va yuzingizni skanerlang."
                : "Bu havola guruhingiz uchun berilgan. JSHSHIR va guruh kodi bilan o'zingizni toping."}
          </Notice>
        )}

        {step === 'identify' && (
          <form onSubmit={handleLookup} className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold text-fg">Shaxsingizni aniqlaymiz</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Tizimdagi yozuvingizni topish uchun JSHSHIR raqamingizni kiriting. U pasportingizning ma&apos;lumot sahifasida, 14
                raqamdan iborat.
              </p>
            </div>

            <Segmented
              ariaLabel="Aniqlash usuli"
              value={method}
              onChange={(value) => {
                setMethod(value);
                setError(null);
              }}
              options={METHOD_OPTIONS}
              size="lg"
            />

            {method === 'pinfl' ? (
              <Field
                label={`JSHSHIR (${PINFL_LENGTH} raqam)`}
                hint={`Kiritilgan: ${pinfl.length}/${PINFL_LENGTH} raqam`}
                required
              >
                <Input
                  value={pinfl}
                  onChange={(e) => setPinfl(e.target.value.replace(/\D/g, '').slice(0, PINFL_LENGTH))}
                  placeholder="30302654150047"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  // Birinchi maydon — kursor darhol shu yerda bo'lsin.
                  autoFocus
                  minLength={PINFL_LENGTH}
                  maxLength={PINFL_LENGTH}
                  size="lg"
                  invalid={pinflShort}
                  className="[&_input]:text-base [&_input]:font-mono [&_input]:tracking-wide [&_input::placeholder]:font-sans [&_input::placeholder]:tracking-normal"
                />
              </Field>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Seriya" required>
                  <Input
                    value={series}
                    onChange={(e) => setSeries(e.target.value.toUpperCase())}
                    placeholder="AD"
                    maxLength={4}
                    autoComplete="off"
                    autoCapitalize="characters"
                    required
                    size="lg"
                    className="[&_input]:text-base [&_input]:uppercase"
                  />
                </Field>
                <Field label="Raqam" required className="col-span-2">
                  <Input
                    value={number}
                    onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234567"
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    size="lg"
                    className="[&_input]:text-base"
                  />
                </Field>
              </div>
            )}

            <Field
              label={`Guruh kodi (${ENROLL_CODE_LENGTH} belgi)`}
              hint={
                codeConfusable
                  ? // Terilgan belgi ekranga chiqmagani — dastur sinmagani
                    // emas, kod alifbosida O, I, 0, 1 yo'qligi uchun.
                    // Buni aytmasak odam qayta-qayta tergani bilan
                    // maydonda 5 ta belgi qolaverardi.
                    "Kodda «O» va «I» harflari, «0» va «1» raqamlari ishlatilmaydi — shuning uchun ular qabul qilinmadi. Kartadagi belgi «0» ga o'xshasa, u aslida «Q» yoki «D» bo'lishi mumkin."
                  : `Kiritilgan: ${code.length}/${ENROLL_CODE_LENGTH}. Kod guruh sardorida yoki dekanatda bo'ladi. Unda O, I harflari va 0, 1 raqamlari yo'q.`
              }
              required
            >
              <Input
                value={code}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCode(normalizeEnrollCode(raw));
                  setCodeConfusable(CONFUSABLE_CODE_CHARS.test(raw));
                }}
                placeholder="K7M2XR"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                // Kodda raqam ham, harf ham bor — telefonda to'liq
                // klaviatura kerak, lekin avtomatik tuzatishsiz.
                inputMode="text"
                // maxLength ATAYLAB qo'yilmagan: "K7M2-XR" ni ko'chirib
                // qo'yganda brauzer avval 6 belgigacha kesib tashlaydi
                // ("K7M2-X") va chiziqcha tozalangandan keyin kod
                // to'liqsiz qolardi. Uzunlikni normalizeEnrollCode
                // ortiqcha belgilarni olib tashlagandan KEYIN cheklaydi.
                required
                size="lg"
                className="[&_input]:text-base [&_input]:font-mono [&_input]:uppercase [&_input]:tracking-[0.3em]"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={IdCard}
              loading={loading}
              disabled={!isEnrollCodeComplete(code)}
              fullWidth
            >
              {loading ? 'Qidirilmoqda...' : 'Davom etish'}
            </Button>

            {notFound && (
              <Button
                type="button"
                variant="ghost"
                icon={UserPlus}
                onClick={() => {
                  setError(null);
                  setNotFound(false);
                  setStep('register');
                }}
                fullWidth
              >
                Ro&apos;yxatda yo&apos;qman — o&apos;zimni qo&apos;shish
              </Button>
            )}
          </form>
        )}

        {step === 'confirm' && found && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-fg">Bu sizmi?</h2>
            <div className="flex items-center gap-3 rounded-control border border-border bg-surface-2 p-3.5">
              <Avatar name={found.fullName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{found.fullName}</p>
                <p className="text-[13px] text-muted">
                  {found.typeLabel} · {found.groupOrPosition}
                </p>
              </div>
              <UserCheck size={20} className="shrink-0 text-success" aria-hidden="true" />
            </div>

            {found.alreadyEnrolled ? (
              <Notice tone="warning">Siz allaqachon ro&apos;yxatdan o&apos;tgansiz. O&apos;zgartirish kerak bo&apos;lsa, administratorga murojaat qiling.</Notice>
            ) : found.awaitingApproval ? (
              <>
                <Notice tone="warning" icon={Clock}>
                  Yuzingiz qabul qilingan va administrator tasdig&apos;ini kutmoqda. Rasmni almashtirmoqchi bo&apos;lsangiz, qayta skanerlashingiz
                  mumkin.
                </Notice>
                <Button size="lg" icon={ScanFace} onClick={() => setStep('consent')} fullWidth>
                  Qayta skanerlash
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Bu siz ekanligingizni tasdiqlab, yuzingizni skanerlashga o&apos;ting.</p>
                <Button variant="primary" size="lg" icon={ScanFace} onClick={() => setStep('consent')} fullWidth>
                  Ha, bu men — davom etish
                </Button>
              </>
            )}
            <Button variant="ghost" icon={RotateCcw} onClick={restartIdentify} fullWidth>
              Boshqa ma&apos;lumot bilan qayta urinish
            </Button>
          </div>
        )}

        {step === 'register' && (
          <EnrollmentRegisterForm
            pinfl={method === 'pinfl' ? pinfl : undefined}
            passportSeries={method === 'passport' ? series : undefined}
            passportNumber={method === 'passport' ? number : undefined}
            initialGroup={groupHint}
            onSubmit={handleRegister}
            onCancel={restartIdentify}
            submitting={loading}
          />
        )}

        {step === 'consent' && (
          <EnrollmentConsent
            onContinue={(agreed) => {
              setConsent(agreed);
              setCaptureError(null);
              setStep('photo');
            }}
            onBack={() => setStep('confirm')}
          />
        )}

        {step === 'photo' && <EnrollmentFaceCapture onSubmit={handleFramesSubmit} submitting={loading} externalError={captureError} />}

        {step === 'success' && found && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <span className={cn('flex h-14 w-14 items-center justify-center rounded-full', awaitingApproval ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')}>
              {awaitingApproval ? <Clock size={28} aria-hidden="true" /> : <CheckCircle2 size={28} aria-hidden="true" />}
            </span>
            <p className="text-base font-semibold text-fg">{awaitingApproval ? 'Qabul qilindi' : 'Muvaffaqiyatli saqlandi!'}</p>
            <p className="text-sm leading-relaxed text-muted">
              {awaitingApproval
                ? `${found.fullName}, ma'lumotlaringiz qabul qilindi. Siz institut ro'yxatida yo'q edingiz, shuning uchun administrator tasdiqlagandan keyin kameralar sizni taniy boshlaydi.`
                : `${found.fullName}, yuzingiz endi kameralar orqali tanib olinadi.`}
            </p>
          </div>
        )}
      </Card>

      <p className="text-center text-xs leading-relaxed text-subtle">
        Ma&apos;lumotlaringiz faqat davomat va bino xavfsizligi uchun ishlatiladi. Rozilikni istalgan vaqtda qaytarib olishingiz mumkin.
      </p>
    </div>
  );
}
