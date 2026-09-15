import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import FaceCapture from './FaceCapture';
import { TextField, SelectField } from '../FormField';
import { required } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useFaculties } from '../../lib/useFaculties';
import type { StudentStaffDetail, StudentStaffRecord } from '../../types';

interface FormState {
  fullName: string;
  type: 'talaba' | 'xodim';
  faculty: string;
  course: string;
  group: string;
  position: string;
  pinfl: string;
  passportSeries: string;
  passportNumber: string;
}

const COURSE_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}-kurs` }));

function toForm(r: StudentStaffDetail | StudentStaffRecord): FormState {
  const detail = r as Partial<StudentStaffDetail>;
  const isStudent = r.type === 'talaba';
  return {
    fullName: r.fullName,
    type: r.type,
    faculty: r.faculty,
    course: isStudent && r.course ? String(r.course) : '',
    // Kurs ajratib bo'lmagan eski yozuvda butun matn guruh maydoniga tushadi.
    group: isStudent ? (r.course ? (r.group ?? '') : r.groupOrPosition) : '',
    position: isStudent ? '' : r.groupOrPosition,
    pinfl: detail.pinfl ?? '',
    passportSeries: detail.passportSeries ?? '',
    passportNumber: detail.passportNumber ?? '',
  };
}

type Errors = Partial<Record<keyof FormState, string>> & { form?: string };

export default function EditStudentStaffModal({
  record,
  onClose,
  onSave,
}: {
  record: StudentStaffRecord | null;
  onClose: () => void;
  onSave: (record: StudentStaffRecord) => void;
}) {
  const { token } = useAuth();
  const { faculties } = useFaculties();
  const [form, setForm] = useState<FormState | null>(record ? toForm(record) : null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [newFace, setNewFace] = useState<string | null>(null);

  useEffect(() => {
    if (!record) return;
    setForm(toForm(record));
    setOriginal(null);
    setErrors({});
    setCapturing(false);
    setNewFace(null);
    if (!token) return;
    // JSHSHIR va pasport ro'yxatda yuborilmaydi — faqat tahrirlash ochilganda.
    let cancelled = false;
    setLoadingDetail(true);
    api
      .get<StudentStaffDetail>(`/api/students-staff/${record.id}/details`, token)
      .then((detail) => {
        if (cancelled) return;
        const next = toForm(detail);
        setForm(next);
        setOriginal(next);
      })
      .catch((err) => {
        if (!cancelled)
          setErrors({ form: err instanceof ApiError ? err.message : "Shaxsiy ma'lumotlarni yuklab bo'lmadi" });
      })
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [record, token]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function validate(f: FormState): Errors {
    const pinflDigits = f.pinfl.replace(/\D/g, '');
    const series = f.passportSeries.trim();
    const number = f.passportNumber.replace(/\D/g, '');
    const next: Errors = {
      fullName: required(f.fullName, "F.I.Sh. kiritilishi shart"),
      faculty: f.faculty ? undefined : 'Fakultetni tanlang',
    };
    if (f.type === 'talaba') {
      if (!f.course && !f.group.trim()) next.course = 'Kursni tanlang';
    } else {
      next.position = required(f.position, 'Lavozim kiritilishi shart');
    }
    if (pinflDigits && pinflDigits.length !== 14) next.pinfl = 'JSHSHIR 14 ta raqam bo‘lishi kerak';
    if ((series || number) && !/^[A-Za-z]{2}$/.test(series)) next.passportSeries = '2 ta harf (masalan AD)';
    if ((series || number) && number.length !== 7) next.passportNumber = '7 ta raqam';
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!record || !form) return;

    const next = validate(form);
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const payload: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      type: form.type,
      faculty: form.faculty,
    };
    if (form.type === 'talaba') {
      payload.course = form.course ? Number(form.course) : null;
      payload.group = form.group.trim();
      payload.groupOrPosition = form.course ? '' : form.group.trim();
    } else {
      payload.groupOrPosition = form.position.trim();
    }
    // Faqat tafsilot yuklangan va o'zgargan identifikatorlar yuboriladi —
    // tafsilot yuklanmagan bo'lsa, bo'sh maydon mavjud JSHSHIRni o'chirib yubormasin.
    if (original) {
      if (form.pinfl !== original.pinfl) payload.pinfl = form.pinfl;
      if (form.passportSeries !== original.passportSeries || form.passportNumber !== original.passportNumber) {
        payload.passportSeries = form.passportSeries;
        payload.passportNumber = form.passportNumber;
      }
    }

    setSaving(true);
    try {
      let updated: StudentStaffRecord = await api.patch<StudentStaffDetail>(
        `/api/students-staff/${record.id}`,
        payload,
        token,
      );
      if (newFace) {
        const blob = await (await fetch(newFace)).blob();
        const data = new FormData();
        data.append('photo', blob, 'face.png');
        updated = await api.postForm<StudentStaffRecord>(`/api/students-staff/${record.id}/biometrics`, data, token);
      }
      onSave(updated);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSaving(false);
    }
  }

  const isStudent = form?.type === 'talaba';

  return (
    <Modal open={!!record} onClose={onClose} title="Ma'lumotlarni tahrirlash" maxWidth="max-w-lg">
      {form && record && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {errors.form && (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{errors.form}</p>
          )}
          <TextField
            label="F.I.Sh."
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={errors.fullName}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Turi"
              value={form.type}
              onChange={(e) => set('type', e.target.value as FormState['type'])}
              options={[
                { value: 'talaba', label: 'Talaba' },
                { value: 'xodim', label: 'Xodim' },
              ]}
            />
            <SelectField
              label="Fakultet"
              value={form.faculty}
              onChange={(e) => set('faculty', e.target.value)}
              error={errors.faculty}
              options={faculties.map((f) => ({ value: f.name, label: f.name }))}
            />
          </div>

          {isStudent ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Kurs"
                value={form.course}
                onChange={(e) => set('course', e.target.value)}
                error={errors.course}
                placeholder="Kursni tanlang"
                options={COURSE_OPTIONS}
              />
              <TextField
                label="Guruh"
                value={form.group}
                placeholder="masalan DI-1625"
                onChange={(e) => set('group', e.target.value)}
                error={errors.group}
              />
            </div>
          ) : (
            <TextField
              label="Lavozim"
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              error={errors.position}
            />
          )}

          <fieldset className="flex flex-col gap-3 rounded-xl border border-white/80 bg-white/40 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Shaxsni tasdiqlovchi ma&apos;lumot
              {loadingDetail && <Loader2 size={12} className="ml-1.5 inline animate-spin" />}
            </legend>
            <TextField
              label="JSHSHIR"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              value={form.pinfl}
              disabled={loadingDetail || !original}
              onChange={(e) => set('pinfl', e.target.value)}
              error={errors.pinfl}
            />
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <TextField
                label="Seriya"
                autoComplete="off"
                maxLength={2}
                value={form.passportSeries}
                disabled={loadingDetail || !original}
                onChange={(e) => set('passportSeries', e.target.value.toUpperCase())}
                error={errors.passportSeries}
              />
              <TextField
                label="Pasport raqami"
                inputMode="numeric"
                autoComplete="off"
                maxLength={7}
                value={form.passportNumber}
                disabled={loadingDetail || !original}
                onChange={(e) => set('passportNumber', e.target.value)}
                error={errors.passportNumber}
              />
            </div>
            <p className="text-[11px] text-slate-400">Bo‘sh qoldirilsa, maydon o‘chiriladi.</p>
          </fieldset>

          <div className="rounded-xl border border-white/80 bg-white/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">Yuz rasmi</p>
                <p className="text-[11px] text-slate-500">
                  {newFace
                    ? 'Yangi rasm olindi — "Saqlash" bosilganda almashtiriladi'
                    : record.biometricsStatus === 'tasdiqlangan'
                      ? `Tasdiqlangan${record.confirmedLabel ? ` · ${record.confirmedLabel}` : ''}`
                      : 'Yuzi hali tasdiqlanmagan — davomatda tanilmaydi'}
                </p>
              </div>
              {!capturing && (
                <button
                  type="button"
                  onClick={() => setCapturing(true)}
                  className="btn-glass flex items-center gap-1.5 !py-1.5 text-xs"
                >
                  <Camera size={13} />
                  {newFace || record.biometricsStatus === 'tasdiqlangan' ? 'Yuzni yangilash' : 'Yuzni olish'}
                </button>
              )}
            </div>
            {capturing && (
              <div className="mt-3">
                <FaceCapture
                  onConfirm={(dataUrl) => {
                    setNewFace(dataUrl);
                    setCapturing(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCapturing(false)}
                  className="mt-2 text-xs font-semibold text-slate-500 hover:underline"
                >
                  Bekor qilish
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-glass">
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={saving || loadingDetail}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
