import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, ErrorState, Field, Input, Modal } from '../../ui';
import { required, numberRange } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { Faculty } from '../../types';

export default function AddFacultyModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (faculty: Faculty) => void;
}) {
  const { token } = useAuth();
  const formId = useId();
  const [name, setName] = useState('');
  const [courseCount, setCourseCount] = useState('6');
  const [errors, setErrors] = useState<{ name?: string; courseCount?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Har ochilishda oyna toza bo'ladi. Ilgari faqat xatolar tozalanardi:
  // "Bekor qilish" bosilgandan keyin qayta ochilganda oldingi yozuv
  // maydonda turar, admin bilmasdan uni saqlab yuborishi mumkin edi.
  useEffect(() => {
    if (open) {
      setName('');
      setCourseCount('6');
      setErrors({});
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: required(name, 'Fakultet nomi kiritilishi shart'),
      courseCount: numberRange(courseCount, 1, 8, "1 dan 8 gacha bo'lgan qiymat kiriting"),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    try {
      const faculty = await api.post<Faculty>('/api/faculties', { name: name.trim(), courseCount: Number(courseCount) }, token);
      onAdd(faculty);
      setName('');
      setCourseCount('6');
      setErrors({});
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Tarmoq xatosi' });
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
      title="Yangi fakultet qo'shish"
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
        <Field label="Fakultet nomi" required error={errors.name}>
          <Input placeholder="Stomatologiya" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Kurslar soni" required error={errors.courseCount}>
          <Input type="number" min={1} max={8} value={courseCount} onChange={(e) => setCourseCount(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
