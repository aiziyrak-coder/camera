/* Shaxsiy hisob: ikki bosqichli kirish, Telegram va chiqish. */
import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { TWO_FACTOR_REQUIRED_EVENT } from '../lib/apiClient';
import { cleanTotpCode, groupSecret, twoFactorApi, type TwoFactorSetup, type TwoFactorStatus } from '../lib/twoFactorApi';
import { notificationsApi, type MyNotifications, type TelegramLink } from '../lib/notificationsApi';
import { Alert, Badge, Button, Field, Modal, QrCode, errorText, useToast } from '../kit';
import { ROLE_LABEL } from '../shell';

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const { userName, role, token, logout } = useAuth();
  const toast = useToast();
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [me, setMe] = useState<MyNotifications | null>(null);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    twoFactorApi.status().then(setTwoFactor).catch(() => undefined);
    notificationsApi.me(token).then(setMe).catch(() => undefined);
  }, [token]);

  if (setupOpen) {
    return (
      <TwoFactorSetupModal
        onClose={() => setSetupOpen(false)}
        onDone={(status) => {
          setTwoFactor(status);
          setSetupOpen(false);
          toast('Ikki bosqichli kirish yoqildi');
        }}
      />
    );
  }
  if (disableOpen) {
    return (
      <DisableTwoFactorModal
        onClose={() => setDisableOpen(false)}
        onDone={(status) => {
          setTwoFactor(status);
          setDisableOpen(false);
          toast('Ikki bosqichli kirish o‘chirildi');
        }}
      />
    );
  }

  return (
    <Modal title="Hisobim" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-[17px] font-semibold text-brand-dark ring-1 ring-brand-line">
          {(userName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="text-[16px] font-semibold text-ink">{userName}</p>
          <p className="text-[14px] text-soft">{role ? ROLE_LABEL[role] : ''}</p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-line rounded-xl border border-line">
        <div className="flex items-center gap-3 p-4">
          <ShieldCheck size={20} className="shrink-0 text-soft" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Ikki bosqichli kirish</p>
            <p className="text-[13px] text-soft">Paroldan tashqari telefondagi kod so‘raladi</p>
          </div>
          {twoFactor &&
            (twoFactor.enabled ? (
              <Button size="sm" variant="ghost" onClick={() => setDisableOpen(true)}>
                O‘chirish
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => setSetupOpen(true)}>
                Yoqish
              </Button>
            ))}
        </div>

        <div className="flex items-center gap-3 p-4">
          <Send size={20} className="shrink-0 text-soft" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Telegram</p>
            <p className="text-[13px] text-soft">Tizim xabarlari Telegramga keladi</p>
          </div>
          {me &&
            (me.telegramLinked ? (
              <Badge tone="ok">Ulangan</Badge>
            ) : me.telegramBotConfigured ? (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    setLink(await notificationsApi.linkMyTelegram(token));
                  } catch (err) {
                    toast(errorText(err), 'bad');
                  }
                }}
              >
                Ulash
              </Button>
            ) : (
              <Badge>Bot sozlanmagan</Badge>
            ))}
        </div>
        {link && (
          <div className="p-4">
            <p className="text-[14px] text-soft">
              Quyidagi havolani oching va botda <b>Start</b> tugmasini bosing:
            </p>
            <a href={link.deepLink} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[14px] font-medium text-brand hover:underline">
              {link.deepLink}
            </a>
          </div>
        )}
      </div>

      <Button variant="danger-ghost" icon={LogOut} className="mt-5" onClick={logout} block>
        Tizimdan chiqish
      </Button>
    </Modal>
  );
}

function TwoFactorSetupModal({ onClose, onDone }: { onClose: () => void; onDone: (status: TwoFactorStatus) => void }) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    twoFactorApi
      .begin()
      .then(setSetup)
      .catch((err) => setError(errorText(err)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanTotpCode(code);
    if (!clean) {
      setError('6 xonali kodni kiriting');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await twoFactorApi.confirm(clean));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Ikki bosqichli kirishni yoqish" onClose={onClose}>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-soft">
        <li>Telefoningizga Google Authenticator yoki shunga o‘xshash ilovani o‘rnating.</li>
        <li>Ilovada QR-kodni skanerlang.</li>
        <li>Ilova ko‘rsatgan 6 xonali kodni pastga yozing.</li>
      </ol>
      {setup ? (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 rounded-xl bg-page p-4">
            <QrCode value={setup.otpauthUri} className="h-44 w-44" />
            <p className="text-center text-[12px] text-faint">
              Skanerlay olmasangiz, kalitni qo‘lda kiriting:
              <br />
              <span className="font-mono text-[13px] text-soft">{groupSecret(setup.secret)}</span>
            </p>
          </div>
          <Field label="Ilovadagi kod">
            <input
              className="input h-12 text-center text-[20px] tracking-[0.35em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" block loading={busy} disabled={code.length !== 6}>
            Tasdiqlash
          </Button>
        </form>
      ) : error ? (
        <Alert className="mt-4">{error}</Alert>
      ) : (
        <p className="mt-5 text-center text-[14px] text-soft">Tayyorlanmoqda...</p>
      )}
    </Modal>
  );
}

function DisableTwoFactorModal({ onClose, onDone }: { onClose: () => void; onDone: (status: TwoFactorStatus) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Ikki bosqichli kirishni o‘chirish" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const clean = cleanTotpCode(code);
          if (!clean) return;
          setBusy(true);
          setError(null);
          try {
            onDone(await twoFactorApi.disable(clean));
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] text-soft">Tasdiqlash uchun ilovadagi joriy kodni kiriting.</p>
        <input
          className="input h-12 text-center text-[20px] tracking-[0.35em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          autoFocus
          aria-label="Kod"
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" block loading={busy} disabled={code.length !== 6}>
          O‘chirish
        </Button>
      </form>
    </Modal>
  );
}

/** Server administrator uchun 2FA ni majburiy qilgan bo'lsa — sozlamaguncha shu oyna. */
export function TwoFactorGate() {
  const { token, twoFactorRequired, logout } = useAuth();
  const [forced, setForced] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    const onRequired = () => setForced(true);
    window.addEventListener(TWO_FACTOR_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(TWO_FACTOR_REQUIRED_EVENT, onRequired);
  }, []);

  if (!token || !(forced || twoFactorRequired)) return null;

  if (setupOpen) {
    return <TwoFactorSetupModal onClose={() => setSetupOpen(false)} onDone={() => window.location.reload()} />;
  }

  return (
    <Modal title="Ikki bosqichli kirishni yoqing" onClose={logout}>
      <p className="text-[15px] leading-relaxed text-soft">
        Administratorlar uchun ikki bosqichli kirish majburiy. Uni yoqqaningizdan keyin tizim to‘liq ochiladi.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button variant="primary" block onClick={() => setSetupOpen(true)}>
          Hozir yoqish
        </Button>
        <Button variant="ghost" icon={LogOut} block onClick={logout}>
          Chiqish
        </Button>
      </div>
    </Modal>
  );
}
