import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, ErrorState, Field, Input, Modal, Select } from '../../ui';
import { required } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { Building, Department } from '../../types';

/**
 * Yangi kafedra qo'shish.
 *
 * Bino ixtiyoriy, lekin kuchli tavsiya etiladi: monitoring sahifasidagi
 * filtr bino -> kafedra tartibida kaskadli ishlaydi, ya'ni binosi
 * ko'rsatilmagan kafedra bino tanlangach ro'yxatdan yo'qoladi. Shu sabab
 * maydon "ixtiyoriy" deb emas, izoh bilan ko'rsatiladi.
 */
export default function AddDepartmentModal({
  open,
  buildings,
  onClose,
  onAdd,
}: {
  open: boolean;
  buildings: Building[];
  onClose: () => void;
  onAdd: (department: Department) => void;
}) {
  const { token } = useAuth();
  const formId = useId();
  const [name, setName] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setErrors({});
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { name: required(name, 'Kafedra nomi kiritilishi shart') };
    setErrors(next);
    if (next.name) return;

    setSubmitting(true);
    try {
      const department = await api.post<Department>('/api/departments', { name: name.trim(), buildingId: buildingId || null }, token);
      onAdd(department);
      setName('');
      setBuildingId('');
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
      title="Yangi kafedra qo'shish"
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
        <Field label="Kafedra nomi" required error={errors.name}>
          <Input placeholder="Anatomiya kafedrasi" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field
          label="Qaysi binoda"
          hint="Monitoring sahifasidagi filtr avval bino, keyin kafedra bo'yicha ishlaydi — binosi ko'rsatilmagan kafedra bino tanlangach ro'yxatda ko'rinmaydi."
        >
          <Select
            value={buildingId}
            onChange={setBuildingId}
            placeholder="Ko'rsatilmagan"
            options={buildings.map((b) => ({ value: b.id, label: b.name }))}
            className="sm:w-full"
          />
        </Field>
      </form>
    </Modal>
  );
}
