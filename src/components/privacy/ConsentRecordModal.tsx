import { useEffect, useState, type FormEvent } from 'react';
import { FileSignature } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal } from '../../ui';
import { ChoiceCards, Notice } from '../settings/kit';
import { ApiError } from '../../lib/apiClient';
import { recordConsent, type ConsentSource, type PrivacyPerson } from '../../lib/privacyApi';

interface ConsentRecordModalProps {
  person: PrivacyPerson | null;
  token: string | null;
  consentVersion: string | null;
  onClose: () => void;
  onSaved: (person: PrivacyPerson) => void;
}

const SOURCES: { value: ConsentSource; label: string; description: string }[] = [
  { value: 'qogoz', label: "Qog'ozdagi yozma rozilik", description: 'Imzolangan ariza muassasada saqlanadi' },
  { value: 'admin', label: "Og'zaki / boshqa", description: 'Administrator shaxsan qayd etdi' },
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

  async function handleSubmit(e: FormEvent) {
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
    <Modal
      open={!!person}
      onClose={onClose}
      title="Rozilikni qayd etish"
      description={consentVersion ? `Rozilik matnining joriy versiyasi qayd etiladi: ${consentVersion}` : undefined}
      size="md"
      dismissible={!pending}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="consent-record-form" variant="primary" icon={FileSignature} loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      {person && (
        <form id="consent-record-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-control border border-border bg-surface-2 p-3">
            <Avatar name={person.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{person.fullName}</p>
              <p className="truncate text-xs text-muted">{person.groupOrPosition}</p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-medium text-fg">Rozilik qanday olingan</legend>
            <ChoiceCards name="consent-source" value={source} onChange={setSource} options={SOURCES} columns={1} />
          </fieldset>

          <Field label="Izoh (ixtiyoriy)" hint="Audit jurnaliga yoziladi">
            <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Masalan: ariza №125, 19.09.2026" />
          </Field>

          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      )}
    </Modal>
  );
}
