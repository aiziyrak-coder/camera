import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Field, Input, Modal } from '../../ui';
import { Notice } from '../settings/kit';
import { matchesConfirmation } from '../../lib/privacyApi';

interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Tasdiqlash uchun aynan shu so'z yozilishi kerak (katta-kichik harf farqsiz). */
  expected: string;
  confirmLabel: string;
  pendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/** Qaytarib bo'lmaydigan amal (biometrikani o'chirish) uchun tasdiq:
 *  oddiy "Ha" tugmasi tasodifiy bosilib ketishi mumkin, shuning uchun
 *  odamning familiyasini yozish talab qilinadi. src/ui ConfirmDialog bilan
 *  bir xil ko'rinish va xatti-harakat. */
export default function TypedConfirmDialog({
  open,
  title,
  message,
  expected,
  confirmLabel,
  pendingLabel = "O'chirilmoqda...",
  onCancel,
  onConfirm,
}: TypedConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Har yangi ochilishda holat tozalanadi (ConfirmDialog izohiga qarang).
  useEffect(() => {
    if (open) {
      setTyped('');
      setPending(false);
      setError(null);
    }
  }, [open]);

  const matches = matchesConfirmation(typed, expected);

  async function handleConfirm() {
    if (!matches) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onCancel}
      size="sm"
      ariaLabel={title}
      dismissible={!pending}
      footer={
        <>
          <Button onClick={onCancel} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="typed-confirm-form" variant="danger" disabled={!matches} loading={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id="typed-confirm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirm();
        }}
        className="flex flex-col gap-4 pt-2"
      >
        <div className="flex gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-danger/40 bg-danger-soft text-danger">
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 pt-1">
            <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted">{message}</p>
          </div>
        </div>
        <Field
          label={
            <>
              Tasdiqlash uchun <span className="intel-code font-semibold text-fg">{expected}</span> deb yozing
            </>
          }
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-autofocus
            autoComplete="off"
            className="intel-code"
            invalid={typed !== '' && !matches}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </Modal>
  );
}
