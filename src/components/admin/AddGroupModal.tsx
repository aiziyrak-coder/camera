import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, ErrorState, Field, Input, Modal, Select } from '../../ui';
import { required, numberRange } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { Faculty, StudentGroup } from '../../types';

export default function AddGroupModal({
  open,
  faculties,
  onClose,
  onAdd,
}: {
  open: boolean;
  faculties: Faculty[];
  onClose: () => void;
  onAdd: (group: StudentGroup) => void;
}) {
  const { token } = useAuth();
  const formId = useId();
  const [name, setName] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [course, setCourse] = useState('1');
  const [errors, setErrors] = useState<{ name?: string; faculty?: string; course?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Har ochilishda oyna toza bo'ladi — bekor qilingan yozuv keyingi
  // ochilishda maydonda turib qolmasin.
  useEffect(() => {
    if (open) {
      setName('');
      setFacultyId('');
      setCourse('1');
      setErrors({});
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: required(name, 'Guruh nomi kiritilishi shart'),
      faculty: facultyId ? undefined : 'Fakultetni tanlang',
      course: numberRange(course, 1, 6, "1 dan 6 gacha bo'lgan qiymat kiriting"),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    try {
      const group = await api.post<StudentGroup>('/api/student-groups', { name: name.trim(), facultyId, course: Number(course) }, token);
      onAdd(group);
      setName('');
      setFacultyId('');
      setCourse('1');
      setErrors({});
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={!submitting}
      title="Yangi guruh qo'shish"
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={submitting}>
            Qo&apos;shish
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {errors.form && <ErrorState title="Saqlab bo'lmadi" message={errors.form} />}
        <Field label="Guruh nomi" required error={errors.name}>
          <Input placeholder="DI-2301" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {/* Fakultetsiz guruh yaratib bo'lmaydi: bo'sh tanlagich o'rniga
            nima qilish kerakligi aytiladi. */}
        <Field
          label="Fakultet"
          required
          error={errors.faculty}
          hint={faculties.length === 0 ? "Hali bitta ham fakultet yo'q — avval «Fakultetlar» bo'limida fakultet qo'shing." : undefined}
        >
          <Select
            value={facultyId}
            onChange={setFacultyId}
            placeholder={faculties.length === 0 ? "Fakultet yo'q" : 'Tanlang'}
            options={faculties.map((f) => ({ value: f.id, label: f.name }))}
            disabled={faculties.length === 0}
            className="sm:w-full"
          />
        </Field>
        <Field label="Kurs" required error={errors.course}>
          <Input type="number" min={1} max={6} value={course} onChange={(e) => setCourse(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
