/* Tizimga kiradigan foydalanuvchilar. */
import { useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, ShieldOff, Trash2, UserCog } from 'lucide-react';
import { api, fetchAllPages } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { roleOptionsFor } from '../lib/permissions';
import { useApiResourceList } from './useList';
import type { AdminUser } from '../types';
import { Alert, Badge, Button, Confirm, Empty, Field, IconButton, Modal, PageHead, Select, Spinner, errorText, useToast } from '../kit';

export default function UsersPage() {
  const { token, userName } = useAuth();
  const toast = useToast();
  const users = useApiResourceList(() => fetchAllPages<AdminUser>('/api/users', token, {}, 200), [token]);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [resetting2fa, setResetting2fa] = useState<AdminUser | null>(null);

  return (
    <div className="max-w-4xl">
      <PageHead
        title="Foydalanuvchilar"
        text="Tizimga kira oladigan xodimlar"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Yangi foydalanuvchi
          </Button>
        }
      />

      {users.error ? (
        <Alert>{users.error}</Alert>
      ) : !users.data ? (
        <Spinner />
      ) : users.data.length === 0 ? (
        <div className="card">
          <Empty icon={UserCog} title="Foydalanuvchi yo‘q" />
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {users.data.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[14px] font-semibold text-soft">
                {u.initials || u.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">
                  {u.name}
                  {u.login === userName && <span className="ml-2 text-[13px] font-normal text-faint">(siz)</span>}
                </p>
                <p className="truncate text-[13px] text-soft">
                  {u.login} · Oxirgi kirish: {u.lastLogin || 'hech qachon'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={u.role === 'Super Admin' ? 'brand' : 'plain'}>{u.role}</Badge>
                {u.twoFactorEnabled && <Badge tone="ok">2FA</Badge>}
              </div>
              <div className="flex">
                <IconButton icon={Pencil} label="Tahrirlash" onClick={() => setEditing(u)} />
                <IconButton icon={KeyRound} label="Parolni almashtirish" onClick={() => setResetting(u)} />
                {u.twoFactorEnabled && <IconButton icon={ShieldOff} label="2FA ni bekor qilish" onClick={() => setResetting2fa(u)} />}
                {u.login !== userName && (
                  <IconButton icon={Trash2} label="O‘chirish" className="hover:bg-bad-tint hover:text-bad" onClick={() => setDeleting(u)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Saqlandi');
            users.reload();
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            toast('Parol almashtirildi');
          }}
        />
      )}
      {resetting2fa && (
        <Confirm
          title="2FA bekor qilinsinmi?"
          confirmLabel="Bekor qilish"
          text={`${resetting2fa.name} keyingi kirishda faqat parol bilan kiradi va 2FA ni qaytadan yoqishi kerak bo‘ladi.`}
          onConfirm={async () => {
            await api.post(`/api/users/${resetting2fa.id}/2fa/bekor`, {}, token);
            toast('2FA bekor qilindi');
            users.reload();
          }}
          onClose={() => setResetting2fa(null)}
        />
      )}
      {deleting && (
        <Confirm
          title="Foydalanuvchi o‘chirilsinmi?"
          danger
          confirmLabel="O‘chirish"
          text={`${deleting.name} (${deleting.login}) endi tizimga kira olmaydi.`}
          onConfirm={async () => {
            await api.del(`/api/users/${deleting.id}`, token);
            toast('O‘chirildi');
            users.reload();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const { token, role: myRole } = useAuth();
  const options = roleOptionsFor(myRole);
  const [name, setName] = useState(user?.name ?? '');
  const [login, setLogin] = useState(user?.login ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(user?.role ?? 'Admin');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = name.trim().length >= 5 && login.trim().length >= 3 && (user || password.length >= 8);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      login: login.trim(),
      role,
      email: email.trim() || null,
      phone: phone.trim() || null,
    };
    try {
      if (user) await api.patch(`/api/users/${user.id}`, body, token);
      else await api.post('/api/users', { ...body, password }, token);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={user ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" type="submit" form="user-form" loading={busy} disabled={!valid}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="F.I.Sh." hint="Kamida 5 belgi">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Login">
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" required />
        </Field>
        {!user && (
          <Field label="Parol" hint="Kamida 8 belgi">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
        )}
        <Field label="Rol">
          <Select value={role} onChange={setRole} options={options} />
        </Field>
        <Field label="E-pochta (ixtiyoriy)" hint="Parolni tiklash havolasi uchun">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Telefon (ixtiyoriy)">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Parolni almashtirish" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post(`/api/users/${user.id}/reset-password`, { newPassword: password }, token);
            onDone();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] text-soft">
          <b className="text-ink">{user.name}</b> uchun yangi parol. Uni foydalanuvchiga o‘zingiz yetkazing.
        </p>
        <Field label="Yangi parol" hint="Kamida 8 belgi">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" block loading={busy} disabled={password.length < 8}>
          Saqlash
        </Button>
      </form>
    </Modal>
  );
}
