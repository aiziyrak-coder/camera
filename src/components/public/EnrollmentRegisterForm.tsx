import { useEffect, useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button, Field, Input, Select } from '../../ui';
import { Notice, Segmented } from '../settings/kit';
import { type EnrollmentFaculty, type EnrollmentRegisterInput, listEnrollmentFaculties } from '../../lib/enrollment';

interface EnrollmentRegisterFormProps {
  /** Qidiruvda kiritilgan identifikator — qayta so'ralmaydi. */
  pinfl?: string;
  passportSeries?: string;
  passportNumber?: string;
  /** Guruh QR kartasidan kelganda (?guruh=) — maydon oldindan to'ldiriladi. */
  initialGroup?: string;
  onSubmit: (input: EnrollmentRegisterInput) => void;
  onCancel: () => void;
  submitting?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'talaba' as const, label: 'Talaba' },
  { value: 'xodim' as const, label: 'Xodim' },
];

/**
 * Tizimda yozuvi yo'q odam uchun ro'yxatdan o'tish formasi.
 *
 * Ilgari pasport topilmasa jarayon shu yerda tugardi — "yozuv topilmadi"
 * degan xato chiqib, odam administratorni kutishi kerak edi. Endi u
 * o'zini o'zi kiritadi va darhol yuzini yuklashga o'tadi.
 *
 * Pasport qayta so'ralmaydi: u allaqachon qidiruvda kiritilgan va aynan
 * o'sha qiymatlar bilan yozuv yaratiladi. Qayta terish faqat xato
 * kiritish ehtimolini oshirardi.
 */
export default function EnrollmentRegisterForm({
  pinfl,
  passportSeries,
  passportNumber,
  initialGroup = '',
  onSubmit,
  onCancel,
  submitting = false,
}: EnrollmentRegisterFormProps) {
  const [fullName, setFullName] = useState('');
  const [type, setType] = useState<'talaba' | 'xodim'>('talaba');
  const [groupOrPosition, setGroupOrPosition] = useState(initialGroup);
  const [facultyId, setFacultyId] = useState('');
  const [faculties, setFaculties] = useState<EnrollmentFaculty[]>([]);

  // Fakultet ro'yxati bo'lmasa ham forma ishlayveradi — maydon
  // ixtiyoriy, va ro'yxatni yuklab bo'lmagani odamning ro'yxatdan
  // o'tishiga to'sqinlik qilmasligi kerak.
  useEffect(() => {
    let cancelled = false;
    listEnrollmentFaculties()
      .then((rows) => {
        if (!cancelled) setFaculties(rows);
      })
      .catch(() => {
        /* ixtiyoriy maydon — ro'yxatsiz davom etamiz */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Telefonda 16px dan kichik shrift iOS'da maydonni kattalashtirib yuboradi.
  const mobileText = '[&_input]:text-base';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          fullName: fullName.trim(),
          type,
          groupOrPosition: groupOrPosition.trim(),
          facultyId: facultyId || undefined,
          pinfl,
          passportSeries,
          passportNumber,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-base font-semibold text-fg">Ma&apos;lumotlaringizni kiriting</h2>
        <Notice tone="warning" className="mt-2">
          Bu raqam bo&apos;yicha tizimda yozuv topilmadi. Ma&apos;lumotlaringizni kiriting — ro&apos;yxatdan o&apos;tkazamiz.
        </Notice>
      </div>

      <Field label="F.I.SH." required>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Familiya Ism Sharif"
          autoComplete="name"
          required
          minLength={3}
          size="lg"
          className={mobileText}
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-fg">Kim sifatida</legend>
        <Segmented ariaLabel="Kim sifatida" value={type} onChange={setType} options={TYPE_OPTIONS} size="lg" />
      </fieldset>

      <Field label={type === 'talaba' ? 'Guruh' : 'Lavozim'} required>
        <Input
          value={groupOrPosition}
          onChange={(e) => setGroupOrPosition(e.target.value)}
          placeholder={type === 'talaba' ? '301-guruh' : 'Laborant'}
          required
          size="lg"
          className={mobileText}
        />
      </Field>

      {faculties.length > 0 && (
        <Field label={<>Fakultet <span className="font-normal text-muted">(ixtiyoriy)</span></>}>
          <Select
            value={facultyId}
            onChange={setFacultyId}
            placeholder="Tanlanmagan"
            options={faculties.map((f) => ({ value: f.id, label: f.name }))}
            size="lg"
            className="sm:!w-full [&_select]:text-base"
          />
        </Field>
      )}

      <p className="rounded-control border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted">
        {pinfl ? 'JSHSHIR: ' : 'Pasport: '}
        <span className="font-mono font-semibold text-fg">{pinfl || `${passportSeries} ${passportNumber}`}</span>
      </p>

      <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={submitting} fullWidth>
        {submitting ? 'Saqlanmoqda...' : "Ro'yxatdan o'tish"}
      </Button>

      <Button variant="ghost" icon={ArrowLeft} onClick={onCancel} fullWidth>
        Boshqa raqam bilan qayta urinish
      </Button>
    </form>
  );
}
