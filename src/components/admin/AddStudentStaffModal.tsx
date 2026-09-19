import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import Modal from '../Modal';
import { TextField, SelectField } from '../FormField';
import { required, minLength } from '../../lib/validation';
import PassportUploadStep from './PassportUploadStep';
import FaceCapture from './FaceCapture';
import FaceMatchStep from './FaceMatchStep';
import { ApiError, api, buildQuery } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { useFaculties } from '../../lib/useFaculties';
import { normalizeUzPhone } from '../../lib/notificationsApi';
import ParentNotifyFields, { type ParentFieldsValue } from '../notifications/ParentNotifyFields';
import type { StudentStaffRecord } from '../../types';

interface FormState extends ParentFieldsValue {
  fullName: string;
  type: 'talaba' | 'xodim' | '';
  faculty: string;
  groupOrPosition: string;
}

const EMPTY_FORM: FormState = {
  fullName: '',
  type: '',
  faculty: '',
  groupOrPosition: '',
  parentPhone: '',
  parentNotifyEnabled: false,
  cardNumber: '',
};

const STEPS = ["Ma'lumotlar", 'Pasport', 'Yuz skani', 'Tekshiruv'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-6 flex items-center">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'active' : 'pending';
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  state === 'done'
                    ? 'bg-indigo-600 text-white'
                    : state === 'active'
                      ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {state === 'done' ? <Check size={14} /> : n}
              </div>
              <span
                className={`whitespace-nowrap text-[10px] font-semibold ${
                  state === 'pending' ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {label}
              </span>
            </div>
            {n < STEPS.length && (
              <div className={`mx-2 h-0.5 flex-1 ${n < step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AddStudentStaffModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (record: StudentStaffRecord) => void;
}) {
  const { token } = useAuth();
  const { faculties } = useFaculties();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [passportPhoto, setPassportPhoto] = useState<string | null>(null);
  const [passportFileName, setPassportFileName] = useState<string | null>(null);
  const [capturedFace, setCapturedFace] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Dublikatdan himoya: bazada o'xshash ismli odamlar, tanlangan mavjud yozuv
  // va "bu boshqa odam" tasdig'i. Ro'yxatdagi xodimni qayta qo'shish bitta
  // odamni ikki yozuvga bo'lib yuborardi (scripts/merge_duplicate_people.py).
  const [similar, setSimilar] = useState<StudentStaffRecord[] | null>(null);
  const [existing, setExisting] = useState<StudentStaffRecord | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'fullName' || key === 'type') {
      setSimilar(null);
      setExisting(null);
      setAllowDuplicate(false);
    }
  }

  function resetAll() {
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
    setPassportPhoto(null);
    setPassportFileName(null);
    setCapturedFace(null);
    setMatchResult(null);
    setSaveError(null);
    setSimilar(null);
    setExisting(null);
    setAllowDuplicate(false);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  function validateStep1(): boolean {
    const next: typeof errors = {
      fullName: required(form.fullName) ?? minLength(form.fullName, 5, "F.I.Sh. to'liq kiritilishi kerak"),
      type: form.type ? undefined : 'Turini tanlang',
      faculty: form.faculty ? undefined : 'Fakultetni tanlang',
      groupOrPosition: required(form.groupOrPosition, 'Guruh yoki lavozim kiritilishi shart'),
      parentPhone:
        form.type === 'talaba' && form.parentPhone.trim() && !normalizeUzPhone(form.parentPhone)
          ? "Telefon raqami noto'g'ri (+998 90 123 45 67)"
          : undefined,
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  async function handleStep1Submit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep1()) return;
    if (existing || allowDuplicate) {
      setStep(2);
      return;
    }
    setChecking(true);
    try {
      const found = await api.get<StudentStaffRecord[]>(
        `/api/students-staff/similar${buildQuery({ fullName: form.fullName.trim(), type: form.type })}`,
        token,
      );
      if (found.length > 0) {
        setSimilar(found);
        return;
      }
    } catch {
      // Tekshiruv ishlamasa ham davom etiladi — saqlashda backend baribir tekshiradi
    } finally {
      setChecking(false);
    }
    setStep(2);
  }

  function chooseExisting(record: StudentStaffRecord) {
    setExisting(record);
    setSimilar(null);
    setStep(2);
  }

  function confirmNewPerson() {
    setAllowDuplicate(true);
    setSimilar(null);
    setStep(2);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Mavjud odam tanlangan bo'lsa — yangi yozuv yaratilmaydi, yuz o'shanga biriktiriladi
      const record =
        existing ??
        (await api.post<StudentStaffRecord>(
          '/api/students-staff',
          {
            fullName: form.fullName.trim(),
            type: form.type as 'talaba' | 'xodim',
            faculty: form.faculty,
            groupOrPosition: form.groupOrPosition.trim(),
            biometricsStatus: matchResult?.passed ? 'tasdiqlangan' : 'kutilmoqda',
            allowDuplicate,
            parentPhone: form.type === 'talaba' ? normalizeUzPhone(form.parentPhone) : null,
            parentNotifyEnabled: form.type === 'talaba' && form.parentNotifyEnabled,
            cardNumber: form.cardNumber.trim() || null,
          },
          token,
        ));

      // Faqat mos kelgan yuz saqlanadi — "qo'lda tekshirish" yo'li orqali
      // yaratilgan yozuv uchun rasm/embedding hali yo'q, chunki mos kelish
      // tasdiqlanmagan (biometrics_status = 'kutilmoqda' shu holatni aks
      // ettiradi, keyinroq operator qo'lda ko'rib chiqishi kerak).
      let finalRecord = record;
      if (matchResult?.passed && capturedFace) {
        const photoBlob = await (await fetch(capturedFace)).blob();
        const form2 = new FormData();
        form2.append('photo', photoBlob, 'face.png');
        finalRecord = await api.postForm<StudentStaffRecord>(
          `/api/students-staff/${record.id}/biometrics`,
          form2,
          token,
        );
      }

      onAdd(finalRecord);
      handleClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Yangi biriktirish" maxWidth="max-w-lg">
      <Stepper step={step} />

      {step === 1 && (
        <form onSubmit={handleStep1Submit} noValidate className="flex flex-col gap-4">
          <TextField
            label="F.I.Sh."
            placeholder="Karimova Dildora Baxtiyorovna"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            error={errors.fullName}
          />
          <SelectField
            label="Turi"
            placeholder="Tanlang"
            value={form.type}
            onChange={(e) => set('type', e.target.value as FormState['type'])}
            error={errors.type}
            options={[
              { value: 'talaba', label: 'Talaba' },
              { value: 'xodim', label: 'Xodim' },
            ]}
          />
          <SelectField
            label="Fakultet"
            placeholder="Tanlang"
            value={form.faculty}
            onChange={(e) => set('faculty', e.target.value)}
            error={errors.faculty}
            options={faculties.map((f) => ({ value: f.name, label: f.name }))}
          />
          <TextField
            label="Guruh / Lavozim"
            placeholder={form.type === 'xodim' ? "O'qituvchi, Anatomiya" : '302-guruh, 3-kurs'}
            value={form.groupOrPosition}
            onChange={(e) => set('groupOrPosition', e.target.value)}
            error={errors.groupOrPosition}
          />
          {form.type && (
            <ParentNotifyFields
              isStudent={form.type === 'talaba'}
              value={{ parentPhone: form.parentPhone, parentNotifyEnabled: form.parentNotifyEnabled, cardNumber: form.cardNumber }}
              onChange={(next) => setForm((f) => ({ ...f, ...next }))}
              errors={{ parentPhone: errors.parentPhone }}
            />
          )}

          {similar && similar.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">Bu odam bazada allaqachon bo&apos;lishi mumkin</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                Ro&apos;yxatdagi odamni qayta qo&apos;shsangiz, u ikki marta sanaladi. O&apos;zi bo&apos;lsa — yuzni
                mavjud yozuvga biriktiring.
              </p>
              <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {similar.map((person) => (
                  <li
                    key={person.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{person.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {[person.faculty, person.groupOrPosition].filter(Boolean).join(' · ')} ·{' '}
                        {person.biometricsStatus === 'tasdiqlangan' ? 'yuzi tasdiqlangan' : 'yuzi tasdiqlanmagan'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => chooseExisting(person)}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Shu odamga yuz biriktirish
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={confirmNewPerson}
                className="mt-2 text-xs font-semibold text-amber-900 underline hover:text-amber-950"
              >
                Bu boshqa odam — yangi yozuv yaratish
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className="btn-glass">
              Bekor qilish
            </button>
            {!(similar && similar.length > 0) && (
              <button
                type="submit"
                disabled={checking}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? 'Tekshirilmoqda...' : 'Keyingi'}
              </button>
            )}
          </div>
        </form>
      )}

      {step > 1 && existing && (
        <p className="mb-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Yangi yozuv yaratilmaydi — yuz mavjud yozuvga biriktiriladi:{' '}
          <span className="font-semibold">{existing.fullName}</span> ({existing.groupOrPosition})
          {existing.biometricsStatus === 'tasdiqlangan' && ' · oldingi yuz rasmi yangisiga almashtiriladi'}
          {(form.parentPhone || form.cardNumber || form.parentNotifyEnabled) &&
            ". Ota-ona va karta ma'lumotlarini mavjud yozuvning tahrirlash oynasida kiriting"}
        </p>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-xs text-slate-500">
            {form.fullName} uchun pasport nusxasini (PDF) yuklang — rasm avtomatik ajratib olinadi
          </p>
          <PassportUploadStep
            onLoaded={(url, name) => {
              setPassportPhoto(url);
              setPassportFileName(name);
            }}
          />
          <div className="flex justify-between gap-2 pt-2">
            <button type="button" onClick={() => setStep(1)} className="btn-glass">
              Orqaga
            </button>
            <button
              type="button"
              disabled={!passportPhoto}
              onClick={() => setStep(3)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keyingi
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-xs text-slate-500">
            Endi kamera orqali jonli yuzingizni suratga oling
          </p>
          <FaceCapture
            onConfirm={(dataUrl) => {
              setCapturedFace(dataUrl);
              setMatchResult(null);
              setStep(4);
            }}
          />
          <div className="flex justify-start pt-2">
            <button type="button" onClick={() => setStep(2)} className="btn-glass">
              Orqaga
            </button>
          </div>
        </div>
      )}

      {step === 4 && passportPhoto && capturedFace && (
        <div className="flex flex-col gap-4">
          <FaceMatchStep
            passportPhotoUrl={passportPhoto}
            capturedFaceUrl={capturedFace}
            onRetake={() => setStep(3)}
            onResult={(score, passed) => setMatchResult({ score, passed })}
          />

          {passportFileName && (
            <p className="text-center text-[11px] text-slate-400">
              Pasport fayli: {passportFileName}
            </p>
          )}

          {saveError && (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-xs font-semibold text-red-600">
              {saveError}
            </p>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <button type="button" onClick={() => setStep(3)} className="btn-glass">
              Orqaga
            </button>
            <div className="flex items-center gap-3">
              {matchResult && !matchResult.passed && !existing && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="text-xs font-semibold text-slate-400 underline hover:text-slate-600 disabled:cursor-not-allowed"
                >
                  Qo'lda tekshirish uchun saqlash
                </button>
              )}
              <button
                type="button"
                disabled={!matchResult?.passed || saving}
                onClick={handleSave}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
