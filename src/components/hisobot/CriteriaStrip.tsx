import { Select } from '../../ui';
import type { HisobotCriterion } from '../../lib/hisobotApi';

/**
 * Ko'rsatkich tanlash — bitta ochiladigan ro'yxat.
 *
 * Ilgari har ko'rsatkich alohida tugma edi (8–9 ta "#7 KELGAN-KELMAGANI"
 * lentasi) va hisobot yuklanayotganda hammasi o'chib qolardi — tugmalar
 * "ishlamayapti" deb tuyulardi (2026-11-04, buyurtmachi). Endi bitta
 * tanlagich, yuklanish paytida ham ishlaydi; tanlangan ko'rsatkich nimani
 * o'lchashi ostida yoziladi. Hisoblab bo'lmaydigan ko'rsatkich ro'yxatda
 * xira turadi va sababi izohda.
 */
export default function CriteriaStrip({
  criteria,
  value,
  onChange,
}: {
  criteria: HisobotCriterion[] | null;
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
}) {
  const active = criteria?.find((c) => c.key === value) ?? criteria?.find((c) => c.available) ?? null;
  const unavailable = criteria?.filter((c) => !c.available) ?? [];

  return (
    <div className="flex flex-col gap-1 border-b border-border px-3 py-2">
      <Select
        label="Ko'rsatkich:"
        value={active?.key ?? ''}
        onChange={onChange}
        disabled={!criteria}
        ariaLabel="Ko'rsatkich"
        className="sm:max-w-md"
        options={(criteria ?? []).map((item) => ({
          value: item.key,
          label: `${item.label}${item.code ? ` (№${item.code})` : ''}${item.available ? '' : " — hozir o'lchanmaydi"}`,
          disabled: !item.available,
        }))}
      />
      {/* Tanlangan ko'rsatkich nimani o'lchashi — doim ko'rinib turadi:
          "kech keldi" nimaga nisbatan hisoblanganini bilmasdan raqamga
          ishonib bo'lmaydi. */}
      {active && (
        <p className="text-[12px] leading-snug text-muted">{active.available ? active.description : active.unavailable}</p>
      )}
      {unavailable.length > 0 && (
        <details className="text-[11px] text-muted">
          <summary className="cursor-pointer select-none">
            Nega ba&apos;zi ko&apos;rsatkichlar o&apos;lchanmaydi? ({unavailable.length} ta)
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {unavailable.map((c) => (
              <li key={c.key}>
                <b className="text-fg">{c.label}</b> — {c.unavailable ?? 'bu ko‘rsatkich uchun ma’lumot yo‘q'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
