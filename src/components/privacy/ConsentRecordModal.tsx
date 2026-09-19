import { useEffect, useState } from 'react';
import { FileSignature, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { ApiError } from '../../lib/apiClient';
import { recordConsent, type ConsentSource, type PrivacyPerson } from '../../lib/privacyApi';

interface ConsentRecordModalProps {
  person: PrivacyPerson | null;
  token: string | null;
  consentVersion: string | null;
  onClose: () => void;
  onSaved: (person: PrivacyPerson) => void;
}

const SOURCES: { value: ConsentSource; label: string; hint: string }[] = [
  { value: 'qogoz', label: "Qog'ozdagi yozma rozilik", hint: 'Imzolangan ariza muassasada saqlanadi' },
  { value: 'admin', label: "Og'zaki / boshqa", hint: 'Administrator shaxsan qayd etdi' },
];

/** Qog'ozda (yoki boshqa yo'l bilan) olingan rozilikni tizimga kiritish.
 *  Izoh (masalan ariza raqami) audit jurnaliga yoziladi. */
export default function ConsentRecordModal({ person, token, consentVersion, onClose, onSaved }: ConsentRecordModalProps) {
  const [source, setSource] = useState<ConsentSource>('qogoz');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (person) {
      setSource('qogoz');
      setNote('');
      setPending(false);
      setError(null);
    }
  }, [person]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    setPending(true);
    setError(null);
    try {
      const updated = await recordConsent(token, person.id, source, note.trim() || undefined);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rozilikni saqlab bo'lmadi");
      setPending(false);
    }
  }

  return (
    <Modal open={!!person} onClose={onClose} title="Rozilikni qayd etish" maxWidth="max-w-md">
      {person && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="rounded-xl bg-white/60 p-3">
            <p className="text-sm font-bold text-slate-900">{person.fullName}</p>
            <p className="text-xs text-slate-500">{person.groupOrPosition}</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold text-slate-500">Rozilik qanday olingan</legend>
            {SOURCES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  source === option.value ? 'border-indigo-300 bg-indigo-50/70' : 'border-white/80 bg-white/50 hover:bg-white/80'
                }`}
              >
                <input
                  type="radio"
                  name="consent-source"
                  value={option.value}
                  checked={source === option.value}
                  onChange={() => setSource(option.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                  <span className="block text-xs text-slate-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Izoh (ixtiyoriy)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Masalan: ariza №125, 19.09.2026"
              className="w-full rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
          </label>

          {consentVersion && (
            <p className="text-xs text-slate-400">Rozilik matnining joriy versiyasi qayd etiladi: {consentVersion}</p>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn-glass">
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
              Saqlash
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
