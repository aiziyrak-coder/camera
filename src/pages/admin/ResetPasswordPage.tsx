import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Link2Off, Lock } from 'lucide-react';
import { ApiError, api } from '../../lib/apiClient';
import { required, minLength } from '../../lib/validation';
import { Button, ButtonLink, Card, Field, Input } from '../../ui';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = {
      password: required(password, 'Yangi parol kiritilishi shart') ?? minLength(password, 8),
      confirmPassword: confirmPassword !== password ? 'Parollar mos kelmadi' : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card padding="lg" className="text-center shadow-pop">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Link2Off size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-fg">Havola yaroqsiz</h1>
        <p className="mt-1 text-[13px] text-muted">
          Bu sahifaga elektron xatdagi tiklash havolasi orqali o'tiladi. Kirish sahifasidan qaytadan so'rov yuboring.
        </p>
        <ButtonLink to="/kirish" className="mt-5" fullWidth>
          Kirish sahifasiga qaytish
        </ButtonLink>
      </Card>
    );
  }

  if (done) {
    return (
      <Card padding="lg" className="text-center shadow-pop">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={24} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-fg">Parol o'zgartirildi</h1>
        <p className="mt-1 text-[13px] text-muted">Barcha eski sessiyalar tugatildi — yangi parol bilan qayta kiring.</p>
        <ButtonLink to="/kirish" variant="primary" className="mt-5" fullWidth>
          Tizimga kirish
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="shadow-pop">
      <h1 className="text-lg font-semibold text-fg">Yangi parol o'rnatish</h1>
      <p className="mt-1 text-[13px] text-muted">Kamida 8 belgidan iborat yangi parol kiriting.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
        {errors.form && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {errors.form}
          </div>
        )}

        <Field label="Yangi parol" error={errors.password}>
          <Input
            icon={Lock}
            size="lg"
            type="password"
            placeholder="Kamida 8 belgi"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </Field>

        <Field label="Parolni tasdiqlang" error={errors.confirmPassword}>
          <Input
            icon={Lock}
            size="lg"
            type="password"
            placeholder="Parolni qayta kiriting"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
          {loading ? 'Saqlanmoqda…' : 'Parolni saqlash'}
        </Button>
      </form>
    </Card>
  );
}
