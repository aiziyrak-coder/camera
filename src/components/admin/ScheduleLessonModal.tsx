import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, Select } from '../../ui';
import { required } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useFaculties } from '../../lib/useFaculties';
import { useGroups } from '../../lib/useGroups';
import { useTeachers } from '../../lib/useTeachers';
import { useCameras } from '../../lib/useCameras';
import { todayInTashkent } from '../../lib/uzDate';
import type { LessonSession } from '../../types';

/** Jadvali tahrirlanadigan dars (situation `Lesson` yoki `LessonSession`dan). */
export interface ScheduleTarget {
  id: string;
  date: string;
  group: string;
  subject: string;
  teacherId?: string | null;
  cameraId?: string | null;
  /** Kamera nomi — `cameraId` noma'lum bo'lsa shu bo'yicha topiladi. */
  room?: string | null;
  /** "HH:MM" (Toshkent vaqti). */
  startsAt?: string | null;
}

interface FormState {
  date: string;
  group: string;
  faculty: string;
  subject: string;
  teacherId: string;
  cameraId: string;
  time: string;
}

type Errors = Partial<Record<keyof FormState, string>> & { form?: string };

function emptyForm(date?: string): FormState {
  return { date: date ?? todayInTashkent(), group: '', faculty: '', subject: '', teacherId: '', cameraId: '', time: '' };
}

/** Ikki holat: `target` yo'q — yangi (rejalashtirilgan) dars yaratiladi (POST);
 *  `target` bor — mavjud darsga faqat jadval (o'qituvchi/kamera/vaqt)
 *  biriktiriladi (PATCH .../schedule). Kamera va vaqt belgilansa, AI darsni
 *  avtomatik kuzatadi (#19, #21, #22). */
export default function ScheduleLessonModal({
  open,
  target,
  defaultDate,
  onClose,
  onSave,
}: {
  open: boolean;
  target?: ScheduleTarget | null;
  /** Yangi dars uchun standart sana (ko'rilayotgan sana). */
  defaultDate?: string;
  onClose: () => void;
  onSave: (session: LessonSession) => void;
}) {
  const { faculties } = useFaculties();
  const { groups } = useGroups();
  const { teachers } = useTeachers();
  const { cameras } = useCameras();
  const isReschedule = Boolean(target);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (target) {
      setForm({
        date: target.date,
        group: target.group,
        faculty: '',
        subject: target.subject,
        teacherId: target.teacherId ?? '',
        cameraId: target.cameraId ?? '',
        time: target.startsAt?.slice(0, 5) ?? '',
      });
    } else {
      setForm(emptyForm(defaultDate));
    }
  }, [open, target, defaultDate]);

  // Kamera id'si ma'lum bo'lmasa (situation darsida faqat nomi bor) — nom bo'yicha.
  useEffect(() => {
    if (!open || !target || target.cameraId || !target.room || cameras.length === 0) return;
    const match = cameras.find((c) => c.name === target.room);
    if (match) setForm((f) => (f.cameraId ? f : { ...f, cameraId: match.id }));
  }, [open, target, cameras]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const groupOptions = useMemo(() => groups.filter((g) => !form.faculty || g.faculty === form.faculty), [groups, form.faculty]);

  function validate(): boolean {
    const next: Errors = isReschedule
      ? {}
      : {
          date: required(form.date, 'Sana kiritilishi shart'),
          group: required(form.group, 'Guruh kiritilishi shart'),
          faculty: form.faculty ? undefined : 'Fakultetni tanlang',
          subject: required(form.subject, 'Fan nomi kiritilishi shart'),
          teacherId: form.teacherId ? undefined : "O'qituvchini tanlang",
        };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      // Vaqt zonasisiz — server uni institut vaqti (Toshkent) deb oladi.
      const scheduledStartTime = form.time ? `${form.date}T${form.time}` : null;
      const saved = target
        ? await api.patch<LessonSession>(`/api/lesson-sessions/${target.id}/schedule`, {
            teacherId: form.teacherId || null,
            cameraId: form.cameraId || null,
            scheduledStartTime,
          })
        : await api.post<LessonSession>('/api/lesson-sessions', {
            date: form.date,
            group: form.group.trim(),
            faculty: form.faculty,
            subject: form.subject.trim(),
            teacherId: form.teacherId,
            cameraId: form.cameraId || null,
            scheduledStartTime,
          });
      onSave(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSaving(false);
    }
  }

  const formId = 'schedule-lesson-form';

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title={isReschedule ? 'Dars jadvalini belgilash' : 'Yangi dars rejalashtirish'}
      description={target ? `${target.group} · ${target.subject} · ${target.date}` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSave} noValidate className="flex flex-col gap-4 pb-2">
        {errors.form && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
            {errors.form}
          </p>
        )}

        {!isReschedule && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Sana" error={errors.date} required>
                <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
              </Field>
              <Field label="Fakultet" error={errors.faculty} required>
                <Select
                  value={form.faculty}
                  onChange={(value) => setForm((f) => ({ ...f, faculty: value, group: '' }))}
                  placeholder="Tanlang"
                  options={faculties.map((f) => ({ value: f.name, label: f.name }))}
                  className="sm:w-full"
                />
              </Field>
            </div>
            <Field label="Guruh" error={errors.group} required>
              <Input placeholder="DI-2301" value={form.group} onChange={(e) => set('group', e.target.value)} list="lesson-group-options" />
            </Field>
            <datalist id="lesson-group-options">
              {groupOptions.map((g) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>
            <Field label="Fan" error={errors.subject} required>
              <Input placeholder="Anatomiya" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
            </Field>
          </>
        )}

        <Field label="O'qituvchi" error={errors.teacherId} required={!isReschedule}>
          <Select
            value={form.teacherId}
            onChange={(value) => set('teacherId', value)}
            placeholder={isReschedule ? "O'zgartirilmaydi" : 'Tanlang'}
            options={teachers.map((t) => ({ value: t.id, label: t.fullName }))}
            className="sm:w-full"
          />
        </Field>
        <Field label="Xona kamerasi" hint="Kamera va vaqt belgilansa, tizim darsni avtomatik kuzatadi: o'qituvchining vaqtida kelishi, talaba diqqati va o'qituvchi faolligi.">
          <Select
            value={form.cameraId}
            onChange={(value) => set('cameraId', value)}
            placeholder={isReschedule ? "O'zgartirilmaydi" : 'Kuzatuv uchun tanlanmagan'}
            options={cameras.map((c) => ({ value: c.id, label: `${c.name}${c.zone ? ` (${c.zone})` : ''}` }))}
            className="sm:w-full"
          />
        </Field>
        <Field label="Boshlanish vaqti" hint={isReschedule ? "Bo'sh qoldirilsa — jadval vaqti olib tashlanadi." : undefined}>
          <Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
