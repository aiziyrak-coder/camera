import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Link2Off, Lock } from 'lucide-react';
import { ApiError, api } from '../../lib/apiClient';
import { required, minLength } from '../../lib/validation';
import { authErrorMessage } from '../../components/admin/authErrors';
import { Button, ButtonLink, Card, Field, IconButton, Input } from '../../ui';

/** Tiklash havolasining amal qilish muddati — backenddagi
 *  RESET_TOKEN_TTL_MINUTES bilan bir xil. Foydalanuvchiga "nega
 *  ishlamadi"ni tushuntirish uchun ekranda ko'rsatiladi. */
const RESET_LINK_TTL_MINUTES = 30;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Server "havola yaroqsiz yoki muddati tugagan" desa, formani qayta
  // to'ldirishning ma'nosi yo'q — bu holatda aynan havolasiz kelgandagi
  // ekran ko'rsatiladi, unda esa "yangi so'rov yuborish" yo'li bor.
  const [linkDead, setLinkDead] = useState(false);

  /** Tasdiq maydoni: birinchi yuborishdan KEYIN har bosishda qayta
   *  tekshiriladi. Ilgari xato faqat "Saqlash"da hisoblanardi — odam
   *  parolni to'g'rilab bo'lsa ham "Parollar mos kelmadi" qizarib turardi
   *  va u yana xato qilgan deb o'ylardi. */
  function liveErrors(nextPassword: string, nextConfirm: string) {
    if (!submitted) return;
    setErrors((prev) => ({
      ...prev,
      password: required(nextPassword, 'Yangi parol kiritilishi shart') ?? minLength(nextPassword, 8),
      confirmPassword: nextConfirm && nextConfirm !== nextPassword ? 'Parollar mos kelmadi' : undefined,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
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
      // 400 — token yo'q, ishlatilgan yoki muddati tugagan (routers/auth.py).
      if (err instanceof ApiError && err.status === 400) {
        setLinkDead(true);
        return;
      }
      setErrors({ form: authErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  if (!token || linkDead) {
    return (
      <Card padding="lg" className="text-center shadow-pop">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Link2Off size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-fg">{linkDead ? "Havola muddati tugagan" : 'Havola yaroqsiz'}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {linkDead
            ? `Tiklash havolasi faqat ${RESET_LINK_TTL_MINUTES} daqiqa va bir marta ishlaydi. Bu havola allaqachon ishlatilgan yoki muddati tugagan — kirish sahifasidagi “Parolni unutdingizmi?” orqali yangisini so'rang.`
            : "Bu sahifaga elektron xatdagi tiklash havolasi orqali o'tiladi. Kirish sahifasidan qaytadan so'rov yuboring."}
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
            type={showPassword ? 'text' : 'password'}
            placeholder="Kamida 8 belgi"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              liveErrors(e.target.value, confirmPassword);
            }}
            autoComplete="new-password"
            autoFocus
            trailing={
              // Parolni ikki marta ko'rmasdan yozish — eng ko'p uchraydigan
              // "Parollar mos kelmadi" sababi. Ko'rsatish tugmasi kirish
              // sahifasidagi bilan bir xil.
              <IconButton
                icon={showPassword ? EyeOff : Eye}
                label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                size="sm"
                pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              />
            }
          />
        </Field>

        <Field label="Parolni tasdiqlang" error={errors.confirmPassword}>
          <Input
            icon={Lock}
            size="lg"
            type={showPassword ? 'text' : 'password'}
            placeholder="Parolni qayta kiriting"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              liveErrors(password, e.target.value);
            }}
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
