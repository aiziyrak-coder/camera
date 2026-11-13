/* Taqdimot slaydlari. Har biri 1600x900 sahnaga chiziladi. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  DoorOpen,
  FileImage,
  Fingerprint,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  QrCode,
  RefreshCw,
  ScanFace,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

/* ─────────────────────────── Yordamchilar */

export function d(n: number, extra?: CSSProperties): CSSProperties {
  return { ['--d' as string]: n, ...extra } as CSSProperties;
}

function Chip({ n, label, delay = 0 }: { n: string; label: string; delay?: number }) {
  return (
    <p className="tq-chip" data-a="fade" style={d(delay)}>
      <b>{n}</b>
      <i />
      {label}
    </p>
  );
}

function H2({ children, delay = 1, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <h2 className={`tq-display mt-6 text-[60px] font-extrabold leading-[1.04] ${className}`} data-a style={d(delay)}>
      {children}
    </h2>
  );
}

/** Raqam noldan oxirigacha sanaladi (slayd ochilganda). */
function Counter({ to, active, duration = 1600 }: { to: number; active: boolean; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + 350;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / duration));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration]);
  return <>{v.toLocaleString('ru-RU').replace(/,/g, ' ')}</>;
}

const AV = ['#dbe4f3', '#e5e7eb', '#dbeafe', '#e0f2f1', '#ede9fe', '#fde7e7'];

function Avatar({ i, size = 34, round = false }: { i: number; size?: number; round?: boolean }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-end justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: round ? 999 : size * 0.28, background: AV[i % AV.length] }}
    >
      <span className="absolute rounded-full bg-white/80" style={{ width: size * 0.38, height: size * 0.38, top: size * 0.18 }} />
      <span className="rounded-t-full bg-white/80" style={{ width: size * 0.7, height: size * 0.34 }} />
    </span>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'plain' | 'bad'; children: ReactNode }) {
  const c = { ok: '#059669', warn: '#d97706', plain: '#94a3b8', bad: '#e11d48' }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2 py-[3px] text-[11px] font-semibold text-[#475569]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

function Bars({ w, className = '' }: { w: number; className?: string }) {
  return <span className={`block h-[7px] rounded-full bg-[#e2e8f0] ${className}`} style={{ width: w }} />;
}

/** Ilova oynasi ramkasi. */
function Window({ title, children, className = '', style }: { title: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`tq-card overflow-hidden ${className}`} style={style}>
      <div className="flex h-10 items-center gap-2 border-b border-[#eef2f7] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
        <span className="ml-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#475569]">
          <ScanFace size={13} className="text-[#2563eb]" /> {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Kichik suzuvchi bildirishnoma kartasi. */
function Toast({ icon: Icon, title, sub, tone = 'blue', className = '', style }: { icon: LucideIcon; title: string; sub?: string; tone?: 'blue' | 'green' | 'amber'; className?: string; style?: CSSProperties }) {
  const c = { blue: ['#eff6ff', '#2563eb'], green: ['#ecfdf5', '#059669'], amber: ['#fffbeb', '#d97706'] }[tone];
  return (
    <div className={`tq-card absolute flex items-center gap-3 px-4 py-3 ${className}`} style={style}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: c[0], color: c[1] }}>
        <Icon size={18} />
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-bold text-[#0b1220]">{title}</span>
        {sub && <span className="block text-[12px] text-[#64748b]">{sub}</span>}
      </span>
    </div>
  );
}

function Phone({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`absolute rounded-[38px] bg-[#0b1220] p-[9px] shadow-[0_30px_60px_-20px_rgba(15,23,42,0.45)] ${className}`} style={{ width: 250, height: 500, ...style }}>
      <div className="relative h-full w-full overflow-hidden rounded-[30px] bg-white">
        <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0b1220]" />
        <div className="flex h-full flex-col px-5 pb-5 pt-10">{children}</div>
      </div>
    </div>
  );
}

function PhoneHead({ step }: { step: number }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0b1220] text-white">
          <ScanFace size={13} />
        </span>
        <span className="flex-1 text-[11px] font-bold">Farg‘ona JSSTI</span>
        <span className="text-[10px] font-semibold text-[#94a3b8]">{step} / 4</span>
      </div>
      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-[3px] flex-1 rounded-full" style={{ background: i <= step ? '#0b1220' : '#eef2f7' }} />
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────── 1. Titul */

export function SlideTitle() {
  return (
    <div className="relative flex h-full">
      <div className="relative z-10 flex w-[760px] flex-col justify-center">
        <p className="tq-chip" data-a="fade" style={d(0)}>
          <ShieldCheck size={16} className="text-[#2563eb]" /> Yuzlar bazasi · FJSTI · Noyabr 2026
        </p>
        <h1 className="tq-display mt-8 text-[104px] font-extrabold leading-[0.98]">
          <span className="block" data-a style={d(1)}>
            Har bir yuz —
          </span>
          <span className="block" data-a style={d(2)}>
            bitta <span className="tq-grad">ishonchli</span>
          </span>
          <span className="block" data-a style={d(3)}>
            bazada.
          </span>
        </h1>
        <p className="mt-8 max-w-[620px] text-[26px] leading-[1.4] text-[#334155]" data-a style={d(5)}>
          Yuzini har kim o‘zi kiritadi. Tizim tekshiradi. Institutdagi barcha tizimlar shu bazadan foydalanadi.
        </p>
        <p className="mt-8 text-[15px] text-[#64748b]" data-a="fade" style={d(7)}>
          Farg‘ona jamoat salomatligi tibbiyot instituti · rahbariyat uchun taqdimot
        </p>
      </div>

      {/* O'ng: ilova maketi */}
      <div className="absolute right-[-10px] top-[60px] h-[620px] w-[720px]">
        <div className="absolute right-[40px] top-[40px]" data-a="zoom" style={d(3)}>
          <Window title="Yuzlar bazasi · Talabalar" className="w-[600px]">
            <div className="flex">
              <div className="w-[120px] border-r border-[#eef2f7] bg-[#f8fafc] p-3">
                {['Panel', 'Yuzlar', 'Tasdiqlash', 'HEMIS', 'Telegram'].map((t, i) => (
                  <div key={t} className={`mb-1 flex h-7 items-center gap-2 rounded-md px-2 text-[10.5px] font-semibold ${i === 1 ? 'bg-white text-[#0b1220] shadow-[0_0_0_1px_rgba(15,23,42,0.06)]' : 'text-[#94a3b8]'}`}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i === 1 ? '#0b1220' : '#cbd5e1' }} />
                    {t}
                  </div>
                ))}
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-3 border-b border-[#eef2f7]">
                  {[
                    ['Jami', '9 057'],
                    ['Yuzi bor', '8 163'],
                    ['Kutmoqda', '14'],
                  ].map(([l, v], i) => (
                    <div key={l} className={`px-4 py-3 ${i ? 'border-l border-[#eef2f7]' : ''}`}>
                      <p className="text-[10px] text-[#94a3b8]">{l}</p>
                      <p className="tq-display mt-0.5 text-[20px] font-extrabold">{v}</p>
                      {i === 1 && (
                        <div className="tq-bar mt-1.5 h-1 rounded-full bg-[#eef2f7]" style={d(4, { ['--w' as string]: '90%' })}>
                          <span style={{ background: '#059669' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <div key={r} className="flex items-center gap-3 border-b border-[#f1f5f9] px-4 py-[9px]" data-a="right" style={d(5 + r * 0.6)}>
                    <Avatar i={r} size={26} />
                    <div className="flex-1">
                      <Bars w={[130, 110, 150, 120, 140, 100][r]} className="bg-[#cbd5e1]" />
                      <Bars w={70} className="mt-1.5 h-[5px]" />
                    </div>
                    <Pill tone={r === 2 ? 'warn' : r === 4 ? 'plain' : 'ok'}>{r === 2 ? 'Kutmoqda' : r === 4 ? 'Yuzi yo‘q' : 'Yuzi bor'}</Pill>
                  </div>
                ))}
              </div>
            </div>
          </Window>
        </div>

        <div data-a="pop" style={d(8)}>
          <Toast icon={UserCheck} title="Tirik odam tasdiqlandi" sub="Old · Chap · O‘ng" tone="green" className="tq-float left-0 top-[150px]" />
        </div>
        <div data-a="pop" style={d(9)}>
          <Toast icon={RefreshCw} title="HEMIS yangilandi" sub="3 ta yangi, 41 ta o‘zgardi" className="tq-float-2 right-0 top-[470px]" />
        </div>

        <div data-a="right" style={d(6)}>
          <Phone className="left-[10px] top-[300px] scale-[0.62] origin-top-left">
            <PhoneHead step={4} />
            <p className="mt-4 text-[15px] font-bold">Boshingizni chapga buring</p>
            <div className="relative mx-auto mt-5 h-[170px] w-[170px] rounded-full border-[3px] border-[#059669] bg-[#f1f5f9]">
              <FaceGlyph />
              <div className="tq-scanline" />
            </div>
            <div className="mt-5 flex justify-center gap-1.5">
              <span className="h-2 w-6 rounded-full bg-[#059669]" />
              <span className="h-2 w-6 rounded-full bg-[#2563eb]/40" />
              <span className="h-2 w-2 rounded-full bg-[#e2e8f0]" />
            </div>
          </Phone>
        </div>
      </div>
    </div>
  );
}

function FaceGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`absolute inset-0 h-full w-full ${className}`}>
      <ellipse cx="50" cy="44" rx="20" ry="25" fill="#e2e8f0" />
      <path d="M18 100c2-20 16-30 32-30s30 10 32 30" fill="#e2e8f0" />
      <g stroke="#2563eb" strokeWidth="1.4" fill="none" opacity="0.85">
        <path d="M30 22h-6v6M70 22h6v6M30 74h-6v-6M70 74h6v-6" />
      </g>
      <g fill="#2563eb" opacity="0.9">
        <circle cx="42" cy="42" r="1.4" />
        <circle cx="58" cy="42" r="1.4" />
        <circle cx="50" cy="51" r="1.2" />
        <circle cx="44" cy="58" r="1" />
        <circle cx="56" cy="58" r="1" />
      </g>
    </svg>
  );
}

/* ─────────────────────────── 2. Muammo */

export function SlideProblem() {
  return (
    <div className="flex h-full items-center gap-[80px]">
      <div className="relative w-[640px] shrink-0">
        <p
          className="tq-display text-[260px] font-extrabold leading-none"
          data-a="zoom"
          style={d(1, { color: '#e11d48', textShadow: '0 30px 80px rgba(225,29,72,0.25)' })}
        >
          15<span className="text-[120px]"> px</span>
        </p>
        <div className="mt-6 flex items-center gap-4" data-a style={d(4)}>
          <span className="relative h-[60px] w-[60px] rounded-lg border-2 border-dashed border-[#e11d48]/50 bg-white">
            <span className="absolute left-1/2 top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#e11d48]" />
          </span>
          <span className="text-[18px] text-[#64748b]">Sinf kamerasining oddiy oqimida bitta yuz shuncha joy egallaydi.</span>
        </div>
      </div>
      <div className="max-w-[640px]">
        <Chip n="01" label="Muammo" />
        <H2>Kamera odamni tanishi uchun avval sifatli yuz kerak.</H2>
        <p className="mt-7 text-[23px] leading-[1.5] text-[#334155]" data-a style={d(3)}>
          Avvalgi tizim jonli video, davomat va dars tahlilini <b>bir vaqtda</b> boshladi. Yuzlar esa HEMIS’dagi eski, past sifatli rasmlardan olingan edi.
          Natija — kameralar odamlarni <b>ishonchli tanimadi</b>.
        </p>
        <p className="mt-6 text-[15px] text-[#94a3b8]" data-a="fade" style={d(5)}>
          Noyabr 2026, sinf kameralarida o‘lchangan. Tanish uchun kamida 40 px kerak.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── 3. Muammo → javob */

const ANSWERS: { icon: LucideIcon; old: string; now: string }[] = [
  { icon: FileImage, old: 'Eski, sifatsiz HEMIS rasmlari', now: 'Har kim o‘zi 3 tomondan jonli rasm beradi' },
  { icon: Fingerprint, old: 'Birovning rasmini yuklash mumkin', now: 'Tirik odam tekshiruvi va administrator tasdig‘i' },
  { icon: Layers, old: 'Har tizim o‘z yuz bazasini yig‘adi', now: 'Bitta baza — boshqalar API orqali oladi' },
  { icon: RefreshCw, old: 'Ro‘yxat eskirib qoladi', now: 'HEMIS bilan har 6 soatda avtomatik' },
  { icon: Bell, old: 'Ota-ona bexabar', now: 'Telegram bot orqali xabar' },
  { icon: HardDrive, old: 'Ma’lumot yo‘qolishi xavfi', now: 'O‘z serverida, har kuni zaxira' },
];

export function SlideAnswers() {
  return (
    <div className="flex h-full flex-col">
      <Chip n="01" label="Muammo → javob" />
      <H2>
        Olti muammo. Har biriga
        <br />
        aniq javob.
      </H2>
      <div className="mt-12 grid grid-cols-2 gap-x-14">
        {ANSWERS.map((a, i) => (
          <div key={a.old} className="flex items-start gap-5 border-t border-[#e2e8f0] py-[22px]" data-a style={d(2 + i * 0.7)}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#475569] shadow-[0_0_0_1px_rgba(15,23,42,0.07)]">
              <a.icon size={21} />
            </span>
            <div>
              <p className="text-[18px] font-semibold">
                <span className="tq-strike" style={d(2 + i * 0.7)}>
                  {a.old}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-[20px] font-bold text-[#0b1220]">
                <ArrowRight size={18} className="text-[#059669]" /> {a.now}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 4. Raqamlar */

export function SlideNumbers({ active }: { active: boolean }) {
  const items: { v: number; suffix?: string; label: string; sub: string }[] = [
    { v: 9057, label: 'kishi bazada', sub: 'talabalar va xodimlar' },
    { v: 8163, label: 'yuz vektori', sub: 'kameralar shu yuzlarni taniydi' },
    { v: 23284, label: 'asl rasm', sub: 'zaxirada, har kuni yangilanadi' },
    { v: 7749, label: 'iMentor bilan bog‘langan', sub: 'har soatda avtomatik' },
    { v: 6, suffix: ' soat', label: 'HEMIS bilan yangilanish', sub: 'yangi talaba o‘zi qo‘shiladi' },
    { v: 3, suffix: ' tomon', label: 'har bir yuz', sub: 'old, chap va o‘ng' },
  ];
  return (
    <div className="flex h-full flex-col">
      <Chip n="02" label="Amalda" />
      <H2>Bu reja emas — ishlayotgan baza.</H2>
      <div className="mt-12 grid grid-cols-3 gap-5">
        {items.map((it, i) => (
          <div key={it.label} className="tq-card px-8 py-7" data-a="pop" style={d(2 + i * 0.6)}>
            <p className="tq-display text-[60px] font-extrabold leading-none tabular-nums">
              <Counter to={it.v} active={active} />
              {it.suffix && <span className="text-[30px] text-[#64748b]">{it.suffix}</span>}
            </p>
            <p className="mt-3 text-[19px] font-bold">{it.label}</p>
            <p className="mt-1 text-[15px] text-[#64748b]">{it.sub}</p>
            {i === 1 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="tq-bar h-1.5 flex-1 rounded-full bg-[#eef2f7]" style={d(4, { ['--w' as string]: '90%' })}>
                  <span style={{ background: 'linear-gradient(90deg,#2563eb,#0d9488)' }} />
                </div>
                <span className="text-[13px] font-bold text-[#0d9488]">90% qamrov</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 5. Ro'yxatdan o'tish */

export function SlideEnroll() {
  const steps = [
    ['JSHSHIR', 'pasportdagi 14 raqam — odam o‘zini topadi'],
    ['“Bu sizmisiz?”', 'ism, fakultet va guruh bilan tasdiqlaydi'],
    ['Rozilik', 'ma’lumotdan foydalanishga rozilik beradi'],
    ['Yuz', 'kamera bilan 3 tomondan — taxminan 1 daqiqa'],
  ];
  return (
    <div className="flex h-full">
      <div className="w-[640px] shrink-0">
        <Chip n="03" label="Yechim · ro‘yxatdan o‘tish" />
        <H2>Yuzini har kim o‘z telefonidan kiritadi.</H2>
        <ol className="mt-10 flex flex-col gap-5">
          {steps.map(([t, s], i) => (
            <li key={t} className="flex items-center gap-5" data-a="left" style={d(2 + i * 0.7)}>
              <span className="tq-display flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0b1220] text-[17px] font-extrabold text-white">{i + 1}</span>
              <span>
                <span className="block text-[21px] font-bold">{t}</span>
                <span className="block text-[16px] text-[#64748b]">{s}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-9 flex items-center gap-3 text-[16px] text-[#475569]" data-a="fade" style={d(6)}>
          <QrCode size={22} className="text-[#2563eb]" /> Har guruh uchun QR-kod chop etiladi — navbat, qog‘oz va operator kerak emas.
        </p>
      </div>

      <div className="relative flex-1">
        <div data-a="right" style={d(2)}>
          <Phone className="left-[40px] top-[90px] rotate-[-7deg]">
            <PhoneHead step={1} />
            <p className="mt-5 text-[17px] font-bold leading-tight">Yuzingizni ro‘yxatdan o‘tkazing</p>
            <p className="mt-2 text-[11px] text-[#64748b]">14 xonali JSHSHIR raqamini kiriting</p>
            <div className="mt-4 rounded-xl border-2 border-[#0b1220] px-3 py-3 font-mono text-[15px] tracking-[0.12em]">
              3120397541<span className="tq-blink">|</span>
            </div>
            <div className="mt-auto rounded-xl bg-[#0b1220] py-3 text-center text-[13px] font-bold text-white">Davom etish</div>
          </Phone>
        </div>
        <div data-a="right" style={d(3)}>
          <Phone className="left-[240px] top-[40px] z-10">
            <PhoneHead step={2} />
            <p className="mt-5 text-[17px] font-bold">Bu sizmisiz?</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <Avatar i={3} size={44} round />
              <div className="leading-tight">
                <p className="text-[12px] font-bold">Karimova Dilnoza</p>
                <p className="text-[10px] text-[#64748b]">Pediatriya · 2-kurs</p>
                <p className="text-[10px] text-[#64748b]">DI-2301</p>
              </div>
            </div>
            <div className="mt-auto rounded-xl bg-[#0b1220] py-3 text-center text-[13px] font-bold text-white">Ha, bu men</div>
            <div className="mt-2 py-1 text-center text-[11px] font-semibold text-[#64748b]">Yo‘q, bu men emas</div>
          </Phone>
        </div>
        <div data-a="right" style={d(4)}>
          <Phone className="left-[450px] top-[110px] rotate-[7deg]">
            <PhoneHead step={4} />
            <p className="mt-5 text-[15px] font-bold">Kameraga qarang</p>
            <div className="relative mx-auto mt-6 h-[170px] w-[170px]">
              <span className="tq-ring absolute inset-0 rounded-full border-2 border-[#059669]" />
              <div className="relative h-full w-full overflow-hidden rounded-full border-[3px] border-[#059669] bg-[#f1f5f9]">
                <FaceGlyph />
                <div className="tq-scanline" />
              </div>
            </div>
            <p className="mt-5 text-center text-[11px] font-semibold text-[#059669]">Yaxshi, joyida turing...</p>
          </Phone>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 6. Tirik odam tekshiruvi */

export function SlideLiveness() {
  const poses = [
    { t: 'Old', done: true, rot: 0 },
    { t: 'Chap', done: true, rot: -22 },
    { t: 'O‘ng', done: false, rot: 22 },
  ];
  return (
    <div className="flex h-full">
      <div className="w-[600px] shrink-0">
        <Chip n="04" label="Yechim · tirik odam" />
        <H2>Rasmni rasmga tutib o‘tib bo‘lmaydi.</H2>
        <ul className="mt-10 flex flex-col gap-4 text-[20px]">
          {[
            'Boshni chapga va o‘ngga burish so‘raladi — qog‘ozdagi rasm buni qila olmaydi',
            'Har tomon 3 marta ketma-ket tasdiqlanadi',
            'Yuz HEMIS rasmi bilan solishtiriladi',
            'Shubhali bo‘lsa — administrator ko‘rib chiqadi',
          ].map((t, i) => (
            <li key={t} className="flex items-start gap-3" data-a="left" style={d(2 + i * 0.6)}>
              <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-[#059669]" />
              <span className="text-[#1e293b]">{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex flex-1 flex-col items-center pt-2">
        <div className="relative" data-a="zoom" style={d(1)}>
          <span className="tq-ring absolute inset-[-30px] rounded-full border-2 border-[#2563eb]/40" />
          <span className="tq-ring absolute inset-[-30px] rounded-full border-2 border-[#2563eb]/30" style={{ animationDelay: '1.2s' }} />
          <div className="relative h-[330px] w-[330px] overflow-hidden rounded-full border-[6px] border-white bg-[#eef2f7] shadow-[0_30px_70px_-25px_rgba(37,99,235,0.45)]">
            <FaceGlyph />
            <div className="tq-scanline" />
          </div>
          <span className="tq-blink absolute -left-16 top-1/2 -translate-y-1/2 text-[56px] font-bold text-[#2563eb]">‹</span>
          <span className="tq-blink absolute -right-16 top-1/2 -translate-y-1/2 text-[56px] font-bold text-[#2563eb]" style={{ animationDelay: '0.8s' }}>
            ›
          </span>
        </div>
        <div className="mt-[54px] flex gap-4">
          {poses.map((p, i) => (
            <div key={p.t} className="tq-card w-[150px] p-3" data-a style={d(4 + i * 0.7)}>
              <div className="relative h-[96px] overflow-hidden rounded-xl bg-[#eef2f7]">
                <FaceGlyph className="transition-transform" />
                <span className="absolute inset-0" style={{ transform: `skewY(${p.rot / 6}deg)` }} />
              </div>
              <p className="mt-2 flex items-center justify-between text-[14px] font-bold">
                {p.t}
                {p.done ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#059669] text-white">
                    <Check size={14} />
                  </span>
                ) : (
                  <span className="tq-blink text-[12px] font-semibold text-[#2563eb]">olinmoqda</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 7. Tasdiqlash */

export function SlideReview() {
  return (
    <div className="flex h-full flex-col">
      <Chip n="05" label="Yechim · tasdiqlash" />
      <div className="flex items-end justify-between gap-10">
        <H2>Shubhali yuzni inson tekshiradi — bitta tugma bilan.</H2>
        <p className="mb-2 w-[420px] shrink-0 text-[18px] leading-[1.5] text-[#475569]" data-a style={d(2)}>
          Chapda navbat, o‘rtada HEMIS surati va yuborilgan 3 rasm. <b>A</b> — tasdiqlash, <b>R</b> — rad etish. Kameralar yuzni faqat tasdiqdan keyin taniydi.
        </p>
      </div>
      <div className="relative mt-10" data-a="zoom" style={d(3)}>
        <Window title="Tasdiqlash · 14 ta navbatda" className="h-[440px]">
          <div className="flex h-[400px]">
            <div className="w-[270px] border-r border-[#eef2f7]">
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <div key={r} className={`flex items-center gap-3 border-b border-[#f1f5f9] px-4 py-2.5 ${r === 0 ? 'bg-[#f1f5f9]' : ''}`}>
                  <Avatar i={r + 2} size={30} />
                  <div className="flex-1">
                    <Bars w={[120, 100, 130, 90, 115, 105, 125][r]} className="bg-[#cbd5e1]" />
                    <Bars w={60} className="mt-1.5 h-[5px]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-1 flex-col px-8 py-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">1 / 14</p>
              <p className="tq-display mt-1 text-[26px] font-extrabold">Tursunov Bekzod Olimovich</p>
              <p className="text-[13px] text-[#64748b]">Stomatologiya · 3-kurs · DI-2302</p>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {['HEMIS', 'Old', 'Chap', 'O‘ng'].map((t, i) => (
                  <div key={t} className={`overflow-hidden rounded-xl border ${i === 0 ? 'border-dashed border-[#cbd5e1] bg-[#f8fafc]' : 'border-[#e2e8f0]'}`} data-a="pop" style={d(5 + i * 0.5)}>
                    <div className="relative h-[130px] bg-[#eef2f7]">
                      <FaceGlyph />
                    </div>
                    <p className="border-t border-[#e2e8f0] px-3 py-1.5 text-[12px] font-semibold">{t}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-end gap-3">
                <span className="mr-auto text-[12px] text-[#94a3b8]">A — tasdiqlash · R — rad etish</span>
                <span className="flex h-10 items-center gap-2 rounded-lg border border-[#e2e8f0] px-4 text-[14px] font-bold">
                  <X size={15} /> Rad etish
                </span>
                <span className="flex h-10 items-center gap-2 rounded-lg bg-[#0b1220] px-5 text-[14px] font-bold text-white">
                  <Check size={15} /> Tasdiqlash
                </span>
              </div>
            </div>
          </div>
        </Window>
        <div data-a="pop" style={d(8)}>
          <Toast icon={ScanFace} title="O‘xshashlik past — 0.41" sub="Qo‘lda tekshirish tavsiya etiladi" tone="amber" className="tq-float right-[-20px] top-[-30px]" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 8. Boshqaruv paneli */

export function SlideDashboard({ active }: { active: boolean }) {
  const rows = [
    ['Davolash ishi', 95],
    ['Pediatriya', 92],
    ['Stomatologiya', 88],
    ['Tibbiy profilaktika', 84],
    ['Farmatsiya', 79],
    ['Oliy hamshiralik', 73],
  ] as const;
  return (
    <div className="flex h-full gap-14">
      <div className="w-[480px] shrink-0">
        <Chip n="06" label="Boshqaruv paneli" />
        <H2>Kim yuzini bergan, kim yo‘q — bir qarashda.</H2>
        <ul className="mt-9 flex flex-col gap-4 text-[19px] text-[#1e293b]">
          {['Fakultet va kurs kesimida qamrov', 'Har bir odamning holati va rasmlari', 'Ctrl K — istalgan odamni bir zumda topish', 'Ro‘yxatdan o‘tmaganlarga QR havola'].map((t, i) => (
            <li key={t} className="flex items-center gap-3" data-a="left" style={d(2 + i * 0.6)}>
              <span className="h-2 w-2 rounded-full bg-[#2563eb]" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex-1 pt-4" data-a="zoom" style={d(2)}>
        <Window title="Boshqaruv paneli">
          <div className="grid grid-cols-4 border-b border-[#eef2f7]">
            {[
              ['Bazadagi odamlar', 9057],
              ['Yuzi bor', 8163],
              ['Yuzi yo‘q', 894],
              ['Tasdiq kutmoqda', 14],
            ].map(([l, v], i) => (
              <div key={l} className={`px-5 py-4 ${i ? 'border-l border-[#eef2f7]' : ''}`}>
                <p className="text-[11px] text-[#64748b]">{l}</p>
                <p className="tq-display mt-1 text-[28px] font-extrabold tabular-nums">
                  <Counter to={v as number} active={active} />
                </p>
              </div>
            ))}
          </div>
          <div className="px-6 py-5">
            <p className="mb-3 text-[12px] font-bold">Qamrov — fakultetlar kesimida</p>
            {rows.map(([name, p], i) => (
              <div key={name} className="flex items-center gap-4 py-[9px]">
                <span className="w-[170px] text-[13px] text-[#334155]">{name}</span>
                <div className="tq-bar h-2 flex-1 rounded-full bg-[#eef2f7]" style={d(i, { ['--w' as string]: `${p}%` })}>
                  <span style={{ background: '#0b1220' }} />
                </div>
                <span className="w-10 text-right text-[13px] font-bold tabular-nums">{p}%</span>
              </div>
            ))}
          </div>
        </Window>
        <p className="mt-3 text-right text-[13px] text-[#94a3b8]" data-a="fade" style={d(6)}>
          Ekran ko‘rinishi. Fakultet foizlari — namuna.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── 9. Integratsiya */

export function SlideHub() {
  const nodes: { x: number; y: number; icon: LucideIcon; t: string; s: string; dir: 'in' | 'out'; future?: boolean }[] = [
    { x: 180, y: 120, icon: Database, t: 'HEMIS', s: 'ro‘yxat va rasmlar · 6 soatda', dir: 'in' },
    { x: 180, y: 430, icon: Smartphone, t: 'Telefon', s: 'odam yuzini o‘zi kiritadi', dir: 'in' },
    { x: 1220, y: 120, icon: Users, t: 'iMentor', s: 'yuz vektorlari · har soatda', dir: 'out' },
    { x: 1220, y: 310, icon: Send, t: 'Telegram', s: 'ota-onaga xabar', dir: 'out' },
    { x: 1220, y: 500, icon: DoorOpen, t: 'Kamera va turniket', s: 'keyingi bosqich', dir: 'out', future: true },
  ];
  const cx = 700;
  const cy = 330;
  return (
    <div className="flex h-full flex-col">
      <Chip n="07" label="Integratsiya" />
      <H2>Bitta baza — barcha tizimlar uchun.</H2>
      <div className="relative mt-4 h-[580px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1392 580" preserveAspectRatio="none">
          {nodes.map((n, i) => {
            const x1 = n.dir === 'in' ? n.x + 130 : cx + 130;
            const y1 = n.dir === 'in' ? n.y + 40 : cy + 40;
            const x2 = n.dir === 'in' ? cx - 130 : n.x - 130;
            const y2 = n.dir === 'in' ? cy + 40 : n.y + 40;
            const path = `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
            return (
              <g key={n.t}>
                <path d={path} fill="none" stroke="#e2e8f0" strokeWidth="3" className="tq-draw" style={d(i)} />
                <path d={path} fill="none" stroke={n.future ? '#cbd5e1' : '#2563eb'} strokeWidth="2.5" className="tq-flow" opacity="0.9" />
              </g>
            );
          })}
        </svg>
        {nodes.map((n, i) => (
          <div
            key={n.t}
            className={`tq-card absolute flex w-[260px] items-center gap-3 px-4 py-4 ${n.future ? 'opacity-70 [box-shadow:0_0_0_1.5px_#cbd5e1_inset] [background:#f8fafc]' : ''}`}
            style={{ left: n.x - 130, top: n.y }}
            data-a="pop"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: n.future ? '#eef2f7' : '#eff6ff', color: n.future ? '#94a3b8' : '#2563eb' }}>
              <n.icon size={20} />
            </span>
            <span className="leading-tight">
              <span className="block text-[17px] font-bold">{n.t}</span>
              <span className="block text-[12.5px] text-[#64748b]">{n.s}</span>
            </span>
            <span className="sr-only">{i}</span>
          </div>
        ))}
        <div className="absolute flex flex-col items-center" style={{ left: cx - 130, top: cy - 50 }} data-a="zoom">
          <span className="tq-ring absolute top-0 h-[180px] w-[260px] rounded-[28px] border-2 border-[#2563eb]/30" />
          <div className="relative flex h-[180px] w-[260px] flex-col items-center justify-center rounded-[28px] bg-[#0b1220] text-white shadow-[0_30px_60px_-20px_rgba(15,23,42,0.6)]">
            <ScanFace size={40} />
            <p className="tq-display mt-3 text-[24px] font-extrabold">Yuzlar bazasi</p>
            <p className="text-[13px] text-white/60">9 057 kishi · 8 163 yuz</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 10. Xavfsizlik */

export function SlideSecurity() {
  const inside: { icon: LucideIcon; t: string; s: string }[] = [
    { icon: Server, t: 'API', s: 'har so‘rovda rol tekshiriladi' },
    { icon: Database, t: 'PostgreSQL', s: 'shaxs va yuz vektori' },
    { icon: FileImage, t: 'Rasm ombori', s: 'asl rasmlar, faqat ichkarida' },
    { icon: HardDrive, t: 'Zaxira', s: 'baza va rasmlar — har kuni' },
  ];
  const rules: { icon: LucideIcon; t: string }[] = [
    { icon: KeyRound, t: 'Ikki bosqichli kirish (2FA)' },
    { icon: Lock, t: 'JSHSHIR manzil qatorida emas — jurnalda qolmaydi' },
    { icon: ShieldCheck, t: 'Uch rol: Super admin, Admin, Kamera mas’uli' },
    { icon: UserCheck, t: 'Rozilik bermaguncha rasm olinmaydi' },
  ];
  return (
    <div className="flex h-full gap-14">
      <div className="flex-1">
        <Chip n="08" label="Xavfsizlik" />
        <H2>Ma’lumot institut serveridan chiqmaydi.</H2>
        <div className="relative mt-10 rounded-[26px] border-2 border-dashed border-[#93c5fd] bg-[#f5f8ff] p-7" data-a="zoom" style={d(2)}>
          <p className="absolute -top-3.5 left-7 bg-[#f5f8ff] px-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#2563eb]">Institut serveri</p>
          <div className="grid grid-cols-2 gap-5">
            {inside.map((n, i) => (
              <div key={n.t} className="tq-card flex items-center gap-4 px-6 py-7" data-a="pop" style={d(3 + i * 0.5)}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                  <n.icon size={24} />
                </span>
                <span>
                  <span className="block text-[20px] font-bold">{n.t}</span>
                  <span className="block text-[14.5px] text-[#64748b]">{n.s}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-5 flex items-center gap-2 text-[15px] text-[#64748b]" data-a="fade" style={d(6)}>
          <Cloud size={18} /> Tashqi bulut xizmatlari ishlatilmaydi. Brauzer bilan aloqa — faqat HTTPS.
        </p>
      </div>
      <div className="w-[470px] shrink-0 pt-[190px]">
        {rules.map((r, i) => (
          <div key={r.t} className="flex items-center gap-4 border-t border-[#e2e8f0] py-5" data-a="right" style={d(3 + i * 0.6)}>
            <r.icon size={22} className="shrink-0 text-[#0b1220]" />
            <span className="text-[19px] font-semibold">{r.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 11. Jarayon */

export function SlideFlow() {
  const steps: { icon: LucideIcon; t: string; s: string; time: string }[] = [
    { icon: Database, t: 'Ro‘yxat', s: 'HEMIS’dan avtomatik', time: '6 soatda' },
    { icon: QrCode, t: 'QR-kod', s: 'guruhga chop etiladi', time: '1 varaq' },
    { icon: Smartphone, t: 'Telefon', s: 'yuz 3 tomondan', time: '~1 daqiqa' },
    { icon: UserCheck, t: 'Tasdiq', s: 'shubhali bo‘lsa — admin', time: 'bir tugma' },
    { icon: Camera, t: 'Foydalanish', s: 'iMentor, kameralar', time: 'har soatda' },
  ];
  return (
    <div className="flex h-full flex-col">
      <Chip n="09" label="Jarayon" />
      <H2>Ro‘yxatdan tanishgacha — besh qadam.</H2>
      <div className="relative mt-[110px]">
        <svg className="absolute left-0 right-0 top-[60px] h-4 w-full" viewBox="0 0 1392 16" preserveAspectRatio="none">
          <line x1="80" y1="8" x2="1312" y2="8" stroke="#e2e8f0" strokeWidth="3" />
          <line x1="80" y1="8" x2="1312" y2="8" stroke="url(#tqg)" strokeWidth="3" className="tq-draw" style={d(1)} />
          <defs>
            <linearGradient id="tqg" x1="0" x2="1">
              <stop offset="0" stopColor="#2563eb" />
              <stop offset="1" stopColor="#0d9488" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative grid grid-cols-5 gap-6">
          {steps.map((s, i) => (
            <div key={s.t} className="flex flex-col items-center text-center" data-a style={d(2 + i * 0.8)}>
              <span className="relative flex h-[136px] w-[136px] items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_20px_40px_-18px_rgba(37,99,235,0.45)]">
                <s.icon size={48} className="text-[#0b1220]" strokeWidth={1.6} />
                <span className="tq-display absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#0b1220] text-[13px] font-extrabold text-white">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </span>
              <p className="tq-display mt-6 text-[26px] font-extrabold">{s.t}</p>
              <p className="mt-1 text-[16px] text-[#64748b]">{s.s}</p>
              <p className="mt-4 rounded-full bg-[#eff6ff] px-3 py-1 text-[13px] font-bold text-[#2563eb]">{s.time}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 12. Asos */

export function SlideFoundation() {
  const layers = [
    { t: 'Xavfsizlik nazorati', s: 'notanish odamni aniqlash', on: false },
    { t: 'Dars davomati', s: 'sinf kameralari, 4K kadr', on: false },
    { t: 'Kirish nazorati', s: 'eshik va turniket kameralari', on: false, next: true },
    { t: 'Yuzlar bazasi', s: 'tayyor · ishlamoqda', on: true },
  ];
  return (
    <div className="flex h-full gap-16">
      <div className="w-[640px] shrink-0">
        <Chip n="10" label="Avval asos" />
        <H2>Avval mustahkam asos — keyin kengaytirish.</H2>
        <div className="mt-10 grid grid-cols-2 gap-4">
          {[
            ['Ortiqcha modullar olib tashlandi', 'oxirigacha ishlamagan qismlar'],
            ['Zaxira tuzatildi', 'baza va rasmlar — har kuni'],
            ['Yangi boshqaruv paneli', 'qamrov, tasdiqlash, qidiruv'],
            ['23 284 rasm saqlangan', 'model almashsa ham qayta ro‘yxat shart emas'],
          ].map(([t, s], i) => (
            <div key={t} className="tq-card p-5" data-a="pop" style={d(2 + i * 0.6)}>
              <CheckCircle2 size={22} className="text-[#059669]" />
              <p className="mt-3 text-[18px] font-bold leading-snug">{t}</p>
              <p className="mt-1 text-[14px] text-[#64748b]">{s}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 pb-6">
        {layers.map((l, i) => (
          <div
            key={l.t}
            className="flex items-center gap-5 rounded-2xl px-7 py-6"
            data-a
            style={d(5 - i, {
              background: l.on ? '#0b1220' : l.next ? '#fff' : 'rgba(255,255,255,0.5)',
              color: l.on ? '#fff' : undefined,
              boxShadow: l.on ? '0 30px 60px -25px rgba(15,23,42,0.6)' : l.next ? '0 0 0 2px #2563eb inset' : '0 0 0 1.5px #e2e8f0 inset',
            })}
          >
            <span className="tq-display text-[34px] font-extrabold opacity-30">{String(4 - i).padStart(2, '0')}</span>
            <span className="flex-1">
              <span className="block text-[22px] font-bold">{l.t}</span>
              <span className={`block text-[14px] ${l.on ? 'text-white/60' : 'text-[#64748b]'}`}>{l.s}</span>
            </span>
            {l.on ? (
              <span className="rounded-full bg-[#059669] px-3 py-1 text-[12px] font-bold">Tayyor</span>
            ) : l.next ? (
              <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-[12px] font-bold text-[#2563eb]">Keyingi</span>
            ) : (
              <span className="text-[12px] font-semibold text-[#94a3b8]">Keyin</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 13. Keyingi bosqich */

export function SlideRoadmap() {
  const steps = [
    { t: 'Qamrovni 100% ga yetkazish', s: 'Yuzi yo‘q ~900 kishiga guruh QR-kodlari', time: '2–3 hafta' },
    { t: 'Server quvvati', s: 'Protsessor rejimini o‘zgartirish — tanish 5–10 barobar tezlashadi', time: '1 kun' },
    { t: 'Kirish nazorati sinovi', s: '1–2 kamera, har kuni o‘lchanadi: kim o‘tdi, kim tanildi', time: '2 hafta' },
    { t: 'Keng joriy etish', s: 'Natija mezonga yetgach — bino-bino', time: 'bosqichma-bosqich' },
  ];
  return (
    <div className="flex h-full flex-col">
      <Chip n="11" label="Keyingi bosqich" />
      <H2>Keyingi bosqich — to‘rt qadam.</H2>
      <div className="mt-16 grid grid-cols-4 gap-5">
        {steps.map((s, i) => (
          <div key={s.t} className="relative" data-a style={d(2 + i * 0.7)}>
            <div className="mb-5 flex items-center gap-3">
              <span className={`tq-display flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-extrabold ${i === 0 ? 'bg-[#0b1220] text-white' : 'bg-white text-[#0b1220] shadow-[0_0_0_1px_rgba(15,23,42,0.08)]'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {i < steps.length - 1 && <span className="h-[2px] flex-1 bg-gradient-to-r from-[#cbd5e1] to-transparent" />}
            </div>
            <div className="tq-card h-[300px] p-7">
              <p className="tq-display text-[24px] font-extrabold leading-tight">{s.t}</p>
              <p className="mt-3 text-[16px] leading-[1.5] text-[#475569]">{s.s}</p>
              <p className="absolute bottom-6 left-6 rounded-full bg-[#eff6ff] px-3 py-1 text-[13px] font-bold text-[#2563eb]">{s.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 14. Rahmat */

export function SlideThanks() {
  return (
    <div className="relative flex h-full flex-col justify-center">
      <div className="absolute right-[60px] top-[150px]" data-a="zoom" style={d(2)}>
        <span className="tq-ring absolute inset-0 rounded-full border-2 border-[#2563eb]/30" />
        <span className="tq-ring absolute inset-0 rounded-full border-2 border-[#0d9488]/30" style={{ animationDelay: '1.2s' }} />
        <div className="relative flex h-[340px] w-[340px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_40px_80px_-30px_rgba(37,99,235,0.45)]">
          <ScanFace size={150} strokeWidth={1.2} className="text-[#0b1220]" />
          <div className="tq-scanline" />
        </div>
      </div>
      <p className="tq-display text-[200px] font-extrabold leading-none" data-a="zoom" style={d(0)}>
        Rahmat<span className="tq-grad">.</span>
      </p>
      <p className="mt-10 text-[26px] text-[#334155]" data-a style={d(2)}>
        Farg‘ona jamoat salomatligi tibbiyot instituti · Axborot texnologiyalari bo‘limi
      </p>
      <div className="mt-10 flex items-center gap-4" data-a style={d(3)}>
        <span className="flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[18px] font-bold shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
          <ScanFace size={20} className="text-[#2563eb]" /> cam.fermi.uz
        </span>
        <a href="/kirish" className="flex h-12 items-center gap-2 rounded-xl bg-[#0b1220] px-6 text-[18px] font-bold text-white">
          Tizimga kirish <ArrowRight size={18} />
        </a>
      </div>
    </div>
  );
}
