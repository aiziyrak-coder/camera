import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { ApiError, api } from '../lib/apiClient';
import { Alert, Button, Field, errorText } from '../kit';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);

  const mismatch = repeat.length > 0 && password !== repeat;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setLinkDead(true);
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-[400px] p-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <KeyRound size={22} aria-hidden />
        </span>
        <h1 className="mt-4 text-[20px] font-semibold text-ink">Yangi parol</h1>

        {!token || linkDead ? (
          <div className="mt-4 flex flex-col gap-4">
            <Alert tone="warn">Havola eskirgan yoki allaqachon ishlatilgan. Kirish sahifasidan yangi havola so‘rang.</Alert>
            <Link to="/kirish" className="text-[14px] font-medium text-brand hover:underline">
              Kirish sahifasiga
            </Link>
          </div>
        ) : done ? (
          <div className="mt-4 flex flex-col gap-4">
            <Alert tone="ok">Parol o‘zgartirildi. Endi yangi parol bilan kiring.</Alert>
            <Link to="/kirish" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-dark">
              Kirish
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <Field label="Yangi parol" hint="Kamida 8 belgi">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
            </Field>
            <Field label="Parolni takrorlang" error={mismatch ? 'Parollar bir xil emas' : null}>
              <input className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={password.length < 8 || password !== repeat}>
              Saqlash
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
