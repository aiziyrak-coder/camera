import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { api, ApiError, REPORT_LOCKED_EVENT } from '../../lib/apiClient';
import { reportToken, saveReportToken } from '../../lib/reportLock';
import { useAuth } from '../../lib/auth';
import { Button, Input } from '../../ui';

/**
 * Hisobotlar bo'limi eshigi: server qulf yoqilgan deb aytsa va amaldagi
 * kalit bo'lmasa — parol so'raladi. Parolning o'zi frontendda yo'q.
 */

interface LockState {
  locked: boolean;
  token: string | null;
  expiresAt: string | null;
}

export default function ReportGate({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [state, setState] = useState<'checking' | 'open' | 'locked'>(() => (reportToken() ? 'open' : 'checking'));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onLocked = () => setState('locked');
    window.addEventListener(REPORT_LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(REPORT_LOCKED_EVENT, onLocked);
  }, []);

  // Holat so'rovi sessiya tokeni BILAN: ilgari u token ro'yxatga olinmasdan
  // (AuthProvider effekti bolalarnikidan keyin ishlaydi) yuborilib 401
  // olardi va qulf o'chiq bo'lsa ham parol oynasi chiqib qolardi.
  useEffect(() => {
    if (state !== 'checking' || !token) return;
    let cancelled = false;
    api
      .get<LockState>('/api/hisobot-kirish', token)
      .then((res) => {
        if (!cancelled) setState(res.locked ? 'locked' : 'open');
      })
      .catch(() => {
        if (!cancelled) setState('locked');
      });
    return () => {
      cancelled = true;
    };
  }, [state, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<LockState>('/api/hisobot-kirish', { password }, token);
      if (res.token && res.expiresAt) saveReportToken(res.token, res.expiresAt);
      setPassword('');
      setState('open');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tekshirib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return <div className="p-6 text-[13px] text-muted">Tekshirilmoqda…</div>;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole size={18} aria-hidden="true" className="text-primary" />
          <h1 className="text-[16px] font-bold text-fg">Hisobotlar</h1>
        </div>
        <p className="mb-3 text-[13px] text-muted">Bu bo‘limga kirish uchun parolni kiriting.</p>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Parol"
          aria-label="Hisobotlar paroli"
          autoFocus
          autoComplete="off"
        />
        {error && <p className="mt-2 text-[12px] font-medium text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full" disabled={busy || !password}>
          {busy ? 'Tekshirilmoqda…' : 'Kirish'}
        </Button>
      </form>
    </div>
  );
}
