/* Tanlangan odam: katta ekranda o'ngdagi panel, kichik ekranda chiquvchi oyna. */
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Check, Pencil, QrCode as QrIcon, Trash2, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { useFaculties } from '../lib/useFaculties';
import type { StudentStaffDetail, StudentStaffRecord } from '../types';
import { Alert, Badge, Button, Confirm, Drawer, Field, IconButton, Modal, Photo, Segmented, Select, Skeleton, errorText, useToast } from '../kit';
import { faceStatus } from './Faces';
import { EnrollLinkModal } from './EnrollLink';

interface Props {
  person: StudentStaffRecord;
  onClose: () => void;
  /** null — odam o'chirildi. */
  onChanged: (next: StudentStaffRecord | null) => void;
}

const WIDE = '(min-width: 1280px)';

function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

export default function PersonPanel({ person, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const toast = useToast();
  const wide = useWide();
  const [detail, setDetail] = useState<StudentStaffDetail | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    api
      .get<StudentStaffDetail>(`/api/students-staff/${person.id}/details`, token)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [person.id, token]);

  // Keng ekranda panel oyna emas — Esc bilan yopilsin.
  useEffect(() => {
    if (!wide) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, onClose]);

  const p = detail ?? person;

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      const updated = await api.post<StudentStaffRecord>(`/api/students-staff/${p.id}/biometrics/${decision}`, {}, token);
      toast(decision === 'approve' ? 'Yuz tasdiqlandi' : 'Yuz rad etildi');
      onChanged(updated);
    } catch (err) {
      toast(errorText(err), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const group = p.type === 'talaba' ? p.group || p.reportedGroup : null;
  const footer = (
    <>
      <Button size="sm" icon={Pencil} onClick={() => setEditOpen(true)} disabled={!detail}>
        Tahrirlash
      </Button>
      <Button size="sm" icon={QrIcon} onClick={() => setLinkOpen(true)}>
        Havola
      </Button>
      {p.hemisLinked ? (
        <span className="ml-auto self-center text-[12px] text-faint" title="HEMIS ID, guruh va davomat yo‘qolmasligi uchun HEMIS yozuvi o‘chirilmaydi">
          HEMIS yozuvi
        </span>
      ) : (
        <Button size="sm" variant="danger-ghost" icon={Trash2} className="ml-auto" onClick={() => setDeleteOpen(true)}>
          O‘chirish
        </Button>
      )}
    </>
  );
  const body = <PersonBody p={p} detail={detail} busy={busy} onDecide={decide} group={group} />;

  return (
    <>
      {wide ? (
        <aside className="anim-slide flex w-[400px] shrink-0 flex-col border-l border-line bg-white" aria-label={p.fullName}>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pl-5 pr-2.5">
            <span className="label-xs">Ma’lumot</span>
            <IconButton icon={X} label="Yopish (Esc)" size="sm" className="ml-auto" onClick={onClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
          <div className="flex shrink-0 gap-2 border-t border-line px-4 py-3">{footer}</div>
        </aside>
      ) : (
        <Drawer title={p.fullName} onClose={onClose} footer={footer}>
          {body}
        </Drawer>
      )}

      {editOpen && detail && (
        <EditPerson
          person={detail}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            setDetail(next);
            setEditOpen(false);
            toast('Saqlandi');
            onChanged(next);
          }}
        />
      )}
      {deleteOpen && (
        <Confirm
          title="O‘chirilsinmi?"
          danger
          confirmLabel="Ha, o‘chirish"
          text={
            <>
              <b className="text-ink">{p.fullName}</b> yozuvi va uning yuz rasmlari butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.
            </>
          }
          onConfirm={async () => {
            await api.del(`/api/students-staff/${p.id}`, token);
            toast('O‘chirildi');
            onChanged(null);
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
      {linkOpen && <EnrollLinkModal group={group ?? ''} onClose={() => setLinkOpen(false)} />}
    </>
  );
}

function PersonBody({
  p,
  detail,
  busy,
  onDecide,
  group,
}: {
  p: StudentStaffRecord | StudentStaffDetail;
  detail: StudentStaffDetail | null;
  busy: 'approve' | 'reject' | null;
  onDecide: (d: 'approve' | 'reject') => void;
  group: string | null | undefined;
}) {
  const status = faceStatus(p);
  const angles = [
    { url: p.biometricPhotoUrl, label: 'Old' },
    { url: p.biometricPhotoLeftUrl, label: 'Chap' },
    { url: p.biometricPhotoRightUrl, label: 'O‘ng' },
  ].filter((a) => a.url);

  return (
    <>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-start gap-4">
          <Photo src={p.biometricPhotoUrl || p.hemisPhotoUrl} name={p.fullName} className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-snug text-ink">{p.fullName}</p>
            <p className="mt-0.5 text-[12.5px] text-soft">{p.type === 'talaba' ? 'Talaba' : 'Xodim'}{group ? ` · ${group}` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={status.tone}>{status.label}</Badge>
              {p.selfRegistered && <Badge>O‘zi ro‘yxatdan o‘tgan</Badge>}
            </div>
          </div>
        </div>
      </div>

      {p.awaitingApproval && (
        <div className="mx-5 mb-4 rounded-lg border border-line bg-side p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Tasdiqingizni kutmoqda
          </p>
          <p className="mt-1 text-[12.5px] text-soft">{p.reviewReason || 'Rasmlar shu odamga tegishli ekanini tekshiring.'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="primary" icon={Check} loading={busy === 'approve'} disabled={busy !== null} onClick={() => onDecide('approve')}>
              Tasdiqlash
            </Button>
            <Button icon={X} loading={busy === 'reject'} disabled={busy !== null} onClick={() => onDecide('reject')}>
              Rad etish
            </Button>
          </div>
        </div>
      )}

      <Section title="Yuz rasmlari">
        {angles.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {angles.map((a) => (
              <figure key={a.label}>
                <Photo src={a.url} name={p.fullName} className="aspect-[4/5] w-full rounded-lg" />
                <figcaption className="mt-1 text-center text-[11.5px] text-faint">{a.label}</figcaption>
              </figure>
            ))}
            {p.hemisPhotoUrl && (
              <figure>
                <Photo src={p.hemisPhotoUrl} name={p.fullName} className="aspect-[4/5] w-full rounded-lg opacity-90" />
                <figcaption className="mt-1 text-center text-[11.5px] text-faint">HEMIS</figcaption>
              </figure>
            )}
          </div>
        ) : (
          <div className="flex gap-3 rounded-lg border border-dashed border-line p-3">
            {p.hemisPhotoUrl && <Photo src={p.hemisPhotoUrl} name={p.fullName} className="h-20 w-16 shrink-0 rounded-md" />}
            <p className="text-[12.5px] leading-relaxed text-soft">
              Yuz hali kiritilmagan. Odamga <b className="font-medium text-ink">ro‘yxatdan o‘tish havolasini</b> bering — u yuzini telefonidan o‘zi kiritadi.
              {p.hemisPhotoUrl && <span className="mt-1 block text-faint">Chapdagi rasm HEMIS’dan olingan.</span>}
            </p>
          </div>
        )}
      </Section>

      <Section title="Ma’lumotlar">
        <dl className="text-[13px]">
          <Row label="Fakultet" value={p.faculty} />
          {p.type === 'talaba' ? (
            <>
              <Row label="Kurs" value={p.course ? `${p.course}-kurs` : null} />
              <Row label="Guruh" value={group} />
            </>
          ) : (
            <>
              <Row label="Bo‘lim" value={p.orgUnit} />
              <Row label="Lavozim" value={p.position || p.groupOrPosition} />
            </>
          )}
          <Row
            label="JSHSHIR"
            value={detail ? detail.pinfl : p.hasPinfl ? <Skeleton className="ml-auto h-3 w-28" /> : null}
            mono
          />
          <Row label="Yuz kiritilgan" value={p.confirmedLabel} />
          {p.type === 'talaba' && <Row label="Ota-ona telefoni" value={detail ? detail.parentPhone : null} />}
          {p.type === 'talaba' && detail && <Row label="Ota-ona Telegram" value={detail.parentTelegramLinked ? 'Ulangan' : 'Ulanmagan'} />}
        </dl>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="label-xs mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-soft">{label}</dt>
      <dd className={mono ? 'tnum text-right font-mono text-[12.5px] text-ink' : 'text-right text-ink'}>{value || <span className="text-faint">—</span>}</dd>
    </div>
  );
}

function EditPerson({ person, onClose, onSaved }: { person: StudentStaffDetail; onClose: () => void; onSaved: (p: StudentStaffDetail) => void }) {
  const { token } = useAuth();
  const { faculties } = useFaculties();
  const [fullName, setFullName] = useState(person.fullName);
  const [type, setType] = useState<'talaba' | 'xodim'>(person.type);
  const [faculty, setFaculty] = useState(person.faculty);
  const [course, setCourse] = useState(person.course ? String(person.course) : '');
  const [group, setGroup] = useState(person.group || person.reportedGroup || '');
  const [position, setPosition] = useState(person.type === 'xodim' ? person.groupOrPosition : '');
  const [pinfl, setPinfl] = useState(person.pinfl ?? '');
  const [parentPhone, setParentPhone] = useState(person.parentPhone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid =
    fullName.trim().length >= 5 &&
    Boolean(faculty) &&
    (type === 'talaba' ? Boolean(course || group.trim()) : Boolean(position.trim())) &&
    (pinfl === '' || pinfl.length === 14);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      fullName: fullName.trim(),
      type,
      faculty,
      groupOrPosition: type === 'xodim' ? position.trim() : group.trim(),
    };
    if (type === 'talaba') {
      body.course = course ? Number(course) : null;
      body.group = group.trim() || null;
    }
    if (pinfl !== (person.pinfl ?? '')) body.pinfl = pinfl || null;
    if (type === 'talaba' && parentPhone !== (person.parentPhone ?? '')) body.parentPhone = parentPhone || null;
    try {
      onSaved(await api.patch<StudentStaffDetail>(`/api/students-staff/${person.id}`, body, token));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Ma’lumotlarni tahrirlash"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" type="submit" form="edit-person" loading={busy} disabled={!valid}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="edit-person" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="F.I.Sh.">
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'talaba', label: 'Talaba' },
            { value: 'xodim', label: 'Xodim' },
          ]}
        />
        <Field label="Fakultet">
          <Select value={faculty} onChange={setFaculty} placeholder="Tanlang" options={faculties.map((f) => ({ value: f.name, label: f.name }))} />
        </Field>
        {type === 'talaba' ? (
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Kurs">
              <Select value={course} onChange={setCourse} placeholder="—" options={[1, 2, 3, 4, 5, 6].map((c) => ({ value: String(c), label: `${c}-kurs` }))} />
            </Field>
            <Field label="Guruh">
              <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Lavozim">
            <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
        )}
        <Field label="JSHSHIR" hint="14 raqam" error={pinfl && pinfl.length !== 14 ? `${pinfl.length}/14 raqam` : null}>
          <input
            className="input font-mono"
            value={pinfl}
            onChange={(e) => setPinfl(e.target.value.replace(/\D/g, '').slice(0, 14))}
            inputMode="numeric"
          />
        </Field>
        {type === 'talaba' && (
          <Field label="Ota-ona telefoni" hint="Masalan: +998 90 123 45 67">
            <input className="input" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} inputMode="tel" />
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
