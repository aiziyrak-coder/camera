import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ScanFace } from 'lucide-react';
import { useAuth, type AuthResult } from '../lib/auth';
import { api } from '../lib/apiClient';
import { branding } from '../lib/branding';
import { Alert, Button, Field, Modal, errorText } from '../kit';

/** Faqat ilova ichidagi manzilga qaytamiz ("//boshqa-sayt" emas). */
function safeReturnPath(from: unknown): string | null {
  if (typeof from !== 'string' || from.length > 2048) return null;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/kirish')) return null;
  return from;
}

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (auth.role) return <Navigate to="/" replace />;

  function finish(result: AuthResult) {
    if (result.ok) {
      auth.login(result.role, result.userName, result.token);
      const from = safeReturnPath((location.state as { from?: string } | null)?.from);
      navigate(from ?? '/', { replace: true });
      return;
    }
    if ('twoFactor' in result) {
      setChallenge(result.challenge);
      setCode('');
      setError(null);
      return;
    }
    setError(result.error);
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      finish(await auth.authenticate('admin', login, password));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      finish(await auth.verifyTwoFactor(challenge, code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full bg-white">
      {/* Chap: forma */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
            <ScanFace size={17} aria-hidden />
          </span>
          <span className="text-[14px] font-semibold text-ink">Yuzlar bazasi</span>
        </div>

        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{challenge ? 'Tasdiqlash kodi' : 'Tizimga kirish'}</h1>
          <p className="mb-8 mt-1.5 text-[13.5px] text-soft">{branding.orgFullName}</p>
          {challenge ? (
            <form onSubmit={submitCode} className="flex flex-col gap-5">
              <p className="text-[13.5px] text-soft">Telefoningizdagi autentifikator ilovasidan 6 xonali kodni kiriting.</p>
              <Field label="Kod">
                <input
                  className="input h-12 text-center text-[22px] tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                />
              </Field>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" variant="primary" block className="h-10" loading={busy} disabled={code.length !== 6}>
                Kirish
              </Button>
              <Button variant="ghost" icon={ArrowLeft} block onClick={() => setChallenge(null)}>
                Orqaga
              </Button>
            </form>
          ) : (
            <form onSubmit={submitPassword} className="flex flex-col gap-5">
              <Field label="Login">
                <input className="input h-10" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
              </Field>
              <Field label="Parol">
                <div className="relative">
                  <input
                    className="input h-10 pr-11"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-faint hover:text-soft"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
              </Field>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" variant="primary" block className="h-10" loading={busy} disabled={!login || !password}>
                Kirish
              </Button>
              <button type="button" onClick={() => setForgotOpen(true)} className="text-[13px] font-medium text-soft hover:text-ink">
                Parolni unutdingizmi?
              </button>
            </form>
          )}
          <p className="mt-8 text-[13px] text-soft">
            Yuzingizni ro‘yxatdan o‘tkazmoqchimisiz?{' '}
            <a href="/royxatdan-otish" className="font-medium text-ink underline underline-offset-4">
              Shu yerga bosing
            </a>
          </p>
        </div>

        <p className="text-[12px] text-faint">© {new Date().getFullYear()} {branding.orgName}</p>
      </div>

      {/* O'ng: tizim haqida */}
      <aside className="hidden w-[46%] max-w-[640px] flex-col justify-between border-l border-line bg-side p-12 lg:flex">
        <p className="label-xs">Yuzni tanish platformasi</p>
        <div>
          <p className="max-w-md text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            Talaba va xodimlarning yuzlari — bitta xavfsiz bazada.
          </p>
          <ul className="mt-10 grid max-w-md grid-cols-2 gap-x-8 gap-y-6 text-[13px]">
            {[
              ['Yuzlar bazasi', 'Kameralar taniydigan har bir odam'],
              ['Tasdiqlash', 'Yuborilgan yuzlarni tekshirish'],
              ['HEMIS', 'Ro‘yxat avtomatik yangilanadi'],
              ['Telegram', 'Ota-onalarga xabar'],
            ].map(([t, d]) => (
              <li key={t} className="border-t border-line pt-3">
                <p className="font-medium text-ink">{t}</p>
                <p className="mt-0.5 text-soft">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-faint">Barcha amallar jurnalga yoziladi.</p>
      </aside>

      {forgotOpen && <ForgotPassword initialLogin={login} onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotPassword({ initialLogin, onClose }: { initialLogin: string; onClose: () => void }) {
  const [login, setLogin] = useState(initialLogin);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot-password', { login: login.trim() });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Parolni tiklash" onClose={onClose}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert tone="ok">Agar bunday login bo‘lsa, parolni tiklash havolasi pochta yoki Telegram orqali yuborildi.</Alert>
          <Button variant="primary" block onClick={onClose}>
            Yaxshi
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-[14px] text-soft">Loginingizni kiriting — tiklash havolasini yuboramiz.</p>
          <Field label="Login">
            <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" block loading={busy} disabled={!login.trim()}>
            Havolani yuborish
          </Button>
        </form>
      )}
    </Modal>
  );
}
