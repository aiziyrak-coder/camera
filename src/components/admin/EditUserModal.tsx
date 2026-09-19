import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Send } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Select } from '../../ui';
import { Notice } from '../settings/kit';
import { required, minLength } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { formatUzPhone, normalizeUzPhone } from '../../lib/notificationsApi';
import type { AdminUser } from '../../types';

interface FormState {
  name: string;
  login: string;
  email: string;
  phone: string;
  role: AdminUser['role'];
}

const ROLE_OPTIONS = [
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'Admin', label: 'Admin' },
  { value: "Kamera mas'uli", label: "Kamera mas'uli" },
];

function toForm(u: AdminUser): FormState {
  return { name: u.name, login: u.login, email: u.email ?? '', phone: formatUzPhone(u.phone), role: u.role };
}

export default function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (user: AdminUser) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<FormState | null>(user ? toForm(user) : null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>> & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm(toForm(user));
      setErrors({});
      setResetting(false);
      setNewPassword('');
      setResetError(null);
      setResetDone(false);
    }
  }, [user]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !form) return;

    const next = {
      name: required(form.name, 'F.I.Sh. kiritilishi shart') ?? minLength(form.name, 5),
      login: required(form.login, 'Login kiritilishi shart') ?? minLength(form.login, 3),
      role: form.role ? undefined : 'Rolni tanlang',
      phone: form.phone.trim() && !normalizeUzPhone(form.phone) ? "Telefon raqami noto'g'ri (+998 90 123 45 67)" : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    try {
      const saved = await api.patch<AdminUser>(
        `/api/users/${user.id}`,
        {
          name: form.name.trim(),
          login: form.login.trim(),
          role: form.role,
          email: form.email.trim() || null,
          phone: normalizeUzPhone(form.phone) ?? '',
        },
        token,
      );
      onSave(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const err = minLength(newPassword, 8);
    if (err) {
      setResetError(err);
      return;
    }

    setResetSubmitting(true);
    setResetError(null);
    try {
      await api.post(`/api/users/${user.id}/reset-password`, { newPassword }, token);
      setResetDone(true);
      setNewPassword('');
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setResetSubmitting(false);
    }
  }

  const busy = saving || resetSubmitting;

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Foydalanuvchini tahrirlash"
      description={user ? `${user.name} · oxirgi kirish: ${user.lastLogin}` : undefined}
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button type="submit" form="edit-user-form" variant="primary" loading={saving}>
            Saqlash
          </Button>
        </>
      }
    >
      {form && user && (
        <div className="flex flex-col gap-5">
          <form id="edit-user-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="F.I.Sh." required error={errors.name} className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Login" required error={errors.login}>
                <Input value={form.login} onChange={(e) => set('login', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Rol" required error={errors.role}>
                <Select
                  value={form.role}
                  onChange={(v) => set('role', v as AdminUser['role'])}
                  options={ROLE_OPTIONS}
                  className="sm:w-full"
                />
              </Field>
              <Field label="Email" hint="Ixtiyoriy">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Telefon" error={errors.phone} hint="Ixtiyoriy — SMS bildirishnomalar uchun">
                <Input
                  type="tel"
                  placeholder="+998 90 123 45 67"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            {user.telegramLinked && (
              <div>
                <Badge tone="success" icon={Send}>
                  Telegram bog&apos;langan
                </Badge>
              </div>
            )}
            {errors.form && <Notice tone="danger">{errors.form}</Notice>}
          </form>

          <section className="border-t border-border pt-4" aria-labelledby="reset-password-title">
            <h3 id="reset-password-title" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Parolni tiklash
            </h3>
            {!resetting ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 basis-56 text-[13px] text-muted">
                  Foydalanuvchi parolini unutgan bo&apos;lsa, unga yangi parol o&apos;rnating.
                </p>
                <Button size="sm" icon={KeyRound} onClick={() => setResetting(true)}>
                  Parolni tiklash
                </Button>
              </div>
            ) : resetDone ? (
              <Notice tone="success">Parol yangilandi — foydalanuvchining barcha eski sessiyalari tugatildi.</Notice>
            ) : (
              <form onSubmit={handleResetPassword} noValidate className="flex flex-col gap-3">
                <Notice tone="warning">
                  Foydalanuvchi uchun yangi parol darhol o&apos;rnatiladi (email talab qilinmaydi) — barcha eski
                  sessiyalari avtomatik tugatiladi.
                </Notice>
                <Field label="Yangi parol" hint="Kamida 8 belgi" error={resetError}>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setResetting(false)} disabled={resetSubmitting}>
                    Bekor qilish
                  </Button>
                  <Button size="sm" type="submit" variant="danger" icon={KeyRound} loading={resetSubmitting}>
                    Parolni o&apos;rnatish
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
