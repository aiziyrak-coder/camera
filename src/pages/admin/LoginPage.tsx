import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth, DEMO_CREDENTIALS, type DemoRole } from '../../lib/auth';
import { isBackendConfigured } from '../../lib/config';
import ForgotPasswordModal from '../../components/admin/ForgotPasswordModal';
import { homeForRole } from '../../layouts/shell/navConfig';
import { Button, Card, Field, IconButton, Input, Tabs, cn, focusRing } from '../../ui';

interface FieldErrors {
  login?: string;
  password?: string;
  form?: string;
}

function validateLogin(login: string): string | undefined {
  if (!login.trim()) return 'Login kiritilishi shart';
  if (login.trim().length < 3) return "Login kamida 3 belgidan iborat bo'lishi kerak";
}

function validatePassword(password: string): string | undefined {
  if (!password) return 'Parol kiritilishi shart';
  if (password.length < 6) return "Parol kamida 6 belgidan iborat bo'lishi kerak";
}

/** Kirishdan keyin qaytish manzili: faqat ichki yo'l ("//evil.com" emas). */
function safeReturnPath(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  if (from.startsWith('/kirish') || from.startsWith('/parolni-tiklash')) return null;
  return from;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  // Bu tanlov faqat DEMO rejim uchun: backend ulangan bo'lsa rol
  // serverdan keladi (kamera mas'uli ham shu yo'l bilan kiradi).
  const [role, setRole] = useState<DemoRole>('super-admin');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<{ login?: boolean; password?: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Allaqachon kirgan foydalanuvchi /kirish'ni ochsa — o'z bosh sahifasiga.
  if (auth.role && !loading) return <Navigate to={homeForRole(auth.role)} replace />;

  function handleBlur(field: 'login' | 'password') {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({
      ...e,
      login: field === 'login' ? validateLogin(login) : e.login,
      password: field === 'password' ? validatePassword(password) : e.password,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const loginError = validateLogin(login);
    const passwordError = validatePassword(password);
    setTouched({ login: true, password: true });

    if (loginError || passwordError) {
      setErrors({ login: loginError, password: passwordError });
      return;
    }

    setErrors({});
    setLoading(true);

    const result = await auth.authenticate(role, login, password);
    if (result.ok) {
      // Haqiqiy rol backend javobidan olinadi (yoki demo rejimida tekshirilgan
      // hisobdan) — rol tanlagich faqat qaysi demo login/parolni ko'rsatish
      // uchun, xavfsizlik chegarasi emas.
      auth.login(result.role, result.userName, result.token);
      const from = safeReturnPath((location.state as { from?: string } | null)?.from);
      navigate(from ?? homeForRole(result.role), { replace: true });
      return;
    }
    setLoading(false);
    setErrors({ form: result.error });
  }

  return (
    <>
      <Card padding="lg" className="shadow-pop">
        <h1 className="text-lg font-semibold text-fg">Tizimga kirish</h1>
        <p className="mt-1 text-[13px] text-muted">Hisobingiz login va parolini kiriting.</p>

        {/* Rol tanlash faqat DEMO rejimida (backendsiz) ma'noli — qaysi demo
            hisobni ko'rsatishni tanlaydi. Haqiqiy tizimda rolni server
            hisobning o'zidan aniqlaydi. */}
        {!isBackendConfigured && (
          <Tabs
            variant="segmented"
            ariaLabel="Demo hisob"
            className="mt-5 w-full [&>button]:flex-1 [&>button]:justify-center"
            tabs={[
              { id: 'super-admin', label: 'Super Admin' },
              { id: 'admin', label: 'Admin' },
            ]}
            value={role}
            onChange={(value) => setRole(value as DemoRole)}
          />
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
          {errors.form && (
            <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errors.form}
            </div>
          )}

          <Field label="Login" error={touched.login ? errors.login : undefined}>
            <Input
              icon={User}
              size="lg"
              type="text"
              placeholder={isBackendConfigured ? 'Loginingiz' : 'admin'}
              autoComplete="username"
              autoFocus
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onBlur={() => handleBlur('login')}
            />
          </Field>

          <Field label="Parol" error={touched.password ? errors.password : undefined}>
            <Input
              icon={Lock}
              size="lg"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur('password')}
              trailing={
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

          <div className="-mt-1 flex justify-end">
            <button type="button" onClick={() => setForgotOpen(true)} className={cn('rounded text-[13px] font-medium text-primary hover:underline', focusRing)}>
              Parolni unutdingizmi?
            </button>
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            {loading ? 'Tekshirilmoqda…' : 'Kirish'}
          </Button>

          {/* Production'da bu yozuv Super Admin parolini hammaga ko'rsatardi. */}
          {!isBackendConfigured && (
            <p className="text-center text-xs text-subtle">
              Demo: {DEMO_CREDENTIALS[role].login} / {DEMO_CREDENTIALS[role].password}
            </p>
          )}
        </form>
      </Card>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </>
  );
}
