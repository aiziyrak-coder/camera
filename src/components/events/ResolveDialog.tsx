import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Modal from '../Modal';

const MAX_NOTE = 2000;

/** "Hal qilindi" — qanday chora ko'rilgani majburiy yoziladi (bitta hodisa
 *  uchun ham, bir nechtasi uchun ham). Xato bo'lsa dialog ochiq qoladi. */
export default function ResolveDialog({
  open,
  count = 1,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count?: number;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setError(null);
      setPending(false);
    }
  }, [open]);

  const trimmed = note.trim();

  async function submit() {
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saqlab bo\'lmadi');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={pending ? () => undefined : onCancel} title="Hodisani yopish — hal qilindi" maxWidth="max-w-md">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {count > 1 ? `${count} ta hodisa` : 'Hodisa'} haqiqiy deb hisoblanadi va yopiladi. Qanday chora ko&apos;rilganini
          yozing — bu hodisa tarixida saqlanadi.
        </p>
        <label className="block text-xs font-semibold text-slate-500" htmlFor="resolve-note">
          Yechim izohi
        </label>
        <textarea
          id="resolve-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          rows={4}
          autoFocus
          placeholder="Masalan: navbatchi yuborildi, tartib tiklandi"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300"
        />
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!trimmed || pending}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Hal qilindi
          </button>
        </div>
      </div>
    </Modal>
  );
}
