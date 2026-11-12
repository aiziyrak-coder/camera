/* Bitta odam: yuz rasmlari, ma'lumotlari va amallar. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Pencil, QrCode as QrIcon, Trash2, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { useFaculties } from '../lib/useFaculties';
import type { StudentStaffDetail, StudentStaffRecord } from '../types';
import { Alert, Badge, Button, Confirm, Drawer, Field, Modal, Photo, Segmented, Select, errorText, useToast } from '../kit';
import { faceStatus } from './Faces';
import { EnrollLinkModal } from './EnrollLink';

interface Props {
  person: StudentStaffRecord;
  onClose: () => void;
  /** null — odam o'chirildi. */
  onChanged: (next: StudentStaffRecord | null) => void;
}

export default function PersonPanel({ person, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const toast = useToast();
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
      .then((d) => !cancelled && setDetail(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [person.id, token]);

  const p = detail ?? person;
  const status = faceStatus(p);
  const hasFace = Boolean(p.biometricPhotoUrl);
  const angles = [
    { url: p.biometricPhotoUrl, label: 'Old' },
    { url: p.biometricPhotoLeftUrl, label: 'Chap' },
    { url: p.biometricPhotoRightUrl, label: 'O‘ng' },
  ].filter((a) => a.url);

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

  return (
    <>
      <Drawer
        title={p.fullName}
        onClose={onClose}
        footer={
          <>
            <Button icon={Pencil} onClick={() => setEditOpen(true)} disabled={!detail}>
              Tahrirlash
            </Button>
            <Button icon={QrIcon} onClick={() => setLinkOpen(true)}>
              Havola
            </Button>
            <Button variant="danger-ghost" icon={Trash2} className="ml-auto" onClick={() => setDeleteOpen(true)}>
              O‘chirish
            </Button>
          </>
        }
      >
        {/* Rasmlar */}
        <div className="bg-page p-5">
          {angles.length > 1 ? (
            <div className="grid grid-cols-3 gap-2">
              {angles.map((a) => (
                <figure key={a.label}>
                  <Photo src={a.url} name={p.fullName} className="aspect-square w-full rounded-xl" />
                  <figcaption className="mt-1 text-center text-[12px] text-faint">{a.label}</figcaption>
                </figure>
              ))}
            </div>
          ) : angles.length === 1 ? (
            <Photo src={angles[0].url} name={p.fullName} className="mx-auto aspect-square w-48 rounded-2xl" />
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {p.hemisPhotoUrl ? (
                <Photo src={p.hemisPhotoUrl} name={p.fullName} className="h-40 w-40 rounded-2xl" />
              ) : (
                <Photo name={p.fullName} className="h-28 w-28 rounded-2xl" />
              )}
              <p className="max-w-[280px] text-[14px] text-soft">
                Yuz hali kiritilmagan. Odamga ro‘yxatdan o‘tish havolasini bering — u yuzini telefonidan o‘zi kiritadi.
              </p>
              {p.hemisPhotoUrl && <p className="text-[12px] text-faint">Yuqoridagi rasm HEMIS’dan olingan</p>}
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge>{p.type === 'talaba' ? 'Talaba' : 'Xodim'}</Badge>
            {p.selfRegistered && <Badge tone="brand">O‘zi ro‘yxatdan o‘tgan</Badge>}
          </div>

          {p.awaitingApproval && (
            <div className="mt-4 rounded-2xl border border-warn/20 bg-warn-tint p-4">
              <p className="text-[15px] font-medium text-ink">Yuz tasdiqingizni kutmoqda</p>
              <p className="mt-1 text-[14px] text-soft">
                {p.reviewReason || 'Rasmlar shu odamga tegishli ekanini tekshiring.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="primary" icon={Check} loading={busy === 'approve'} disabled={busy !== null} onClick={() => decide('approve')}>
                  Tasdiqlash
                </Button>
                <Button icon={X} loading={busy === 'reject'} disabled={busy !== null} onClick={() => decide('reject')}>
                  Rad etish
                </Button>
              </div>
            </div>
          )}

          <dl className="mt-5 divide-y divide-line">
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
            <Row label="JSHSHIR" value={detail ? detail.pinfl : p.hasPinfl ? '••••••••••••••' : null} mono />
            {hasFace && <Row label="Yuz kiritilgan" value={p.confirmedLabel} />}
            {p.type === 'talaba' && detail && <Row label="Ota-ona telefoni" value={detail.parentPhone} />}
          </dl>
        </div>
      </Drawer>

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

function Row({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-[14px] text-soft">{label}</dt>
      <dd className={mono ? 'text-right font-mono text-[14px] text-ink' : 'text-right text-[14px] text-ink'}>{value || <span className="text-faint">—</span>}</dd>
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
