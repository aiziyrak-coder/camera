import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../Modal';
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
 *  odamning familiyasini yozish talab qilinadi. ConfirmDialog bilan bir
 *  xil ko'rinish va xatti-harakat. */
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
    <Modal open={open} onClose={pending ? () => undefined : onCancel} maxWidth="max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirm();
        }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={22} />
        </div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{message}</p>
        <label className="w-full text-left">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Tasdiqlash uchun <span className="font-mono text-slate-800">{expected}</span> deb yozing
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            aria-invalid={typed !== '' && !matches}
            className="w-full rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm outline-none focus:border-red-300 focus-visible:ring-2 focus-visible:ring-red-100"
          />
        </label>
        {error && (
          <p className="w-full rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>
        )}
        <div className="mt-2 flex w-full justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={pending || !matches}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
