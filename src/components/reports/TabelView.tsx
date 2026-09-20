import { CalendarOff, Info, UsersRound } from 'lucide-react';
import { EmptyState, cn } from '../../ui';
import { branding } from '../../lib/branding';
import { formatUzMonth } from '../../lib/uzDate';
import {
  TABEL_MARKS,
  TABEL_MARK_CLASS,
  grandTotals,
  normalizeMark,
  type TabelLegendItem,
  type TabelReport,
} from '../../lib/tabelApi';
import TabelSheet from './TabelSheet';

interface TabelViewProps {
  data: TabelReport;
  /** 'talabalar' — guruh ustuni, 'xodimlar' — bo'linma. */
  section: 'talabalar' | 'xodimlar';
}

/** Server `legend` bermasa ham qog'oz o'z belgilarini tushuntirsin. */
const FALLBACK_LEGEND: TabelLegendItem[] = (Object.keys(TABEL_MARKS) as (keyof typeof TABEL_MARKS)[]).map((mark) => ({
  mark,
  label: TABEL_MARKS[mark].label,
}));

/**
 * Oylik tabel — buyurtmachi imzolaydigan hujjat.
 *
 * Tepada tanlov, oy va odamlar soni SO'Z bilan yozilgan: qog'ozga
 * tushganda varaq o'zi nima ekanini aytib tursin. Pastda esa doim
 * shartli belgilar — chop etilgan varaqni tushuntiradigan boshqa
 * hech narsa bo'lmaydi.
 */
export default function TabelView({ data, section }: TabelViewProps) {
  const groupLabel = section === 'talabalar' ? 'Guruh' : "Bo'linma";
  const peopleWord = section === 'talabalar' ? 'talaba' : 'xodim';
  const legend = data.legend?.length ? data.legend : FALLBACK_LEGEND;
  const monthText = data.monthLabel || formatUzMonth(data.month);
  // Yakunlar jadvaldagi belgilardan sanaladi (tabelApi.grandTotals) —
  // ekrandagi "N talaba, M tasining yuzi yo'q" satri va jadvalning
  // pastidagi "Jami" satri bitta manbadan chiqsin. Ilgari bu yerda
  // server `totals`i turardi va jadval bilan farq qilishi mumkin edi.
  const total = grandTotals(data);

  // Oy tanlangan, odamlar bor, lekin birorta ham qayd yo'q: bo'sh
  // jadvalni jim ko'rsatish o'rniga sababini aytamiz.
  const marked = total.present + total.late + total.absent;

  if (!data.days?.length) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="Bu oy uchun tabel tuzilmagan"
        description={`${monthText} uchun ish kunlari aniqlanmadi. Boshqa oyni tanlang yoki ish taqvimi sozlanganini tekshiring.`}
      />
    );
  }

  if (!data.people?.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Bu tanlovda odam yo'q"
        description="Filtrlarni kengaytiring — fakultet, kurs yoki guruh tanlovini bo'shating, qidiruv matnini olib tashlang."
      />
    );
  }

  return (
    <div className="tabel-print flex min-w-0 flex-col gap-4">
      {/* Qog'ozdagi sarlavha — ekranda ko'rinmaydi. */}
      <header className="print-only tabel-print-head">
        <p className="tabel-print-org">{branding.orgFullName}</p>
        <p className="tabel-print-title">Davomat tabeli</p>
        <p className="tabel-print-scope">
          {data.scope} · {monthText}
        </p>
      </header>

      {/* Ekrandagi qamrov satri. */}
      <div className="print-hide flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <span className="font-semibold text-fg">{data.scope}</span>
        <span aria-hidden="true">·</span>
        <span>{monthText}</span>
        <span aria-hidden="true">·</span>
        <span>
          {(total.people || data.people.length).toLocaleString('ru-RU')} {peopleWord}
        </span>
        {total.notEnrolled > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{total.notEnrolled.toLocaleString('ru-RU')} tasining yuzi ro&apos;yxatga olinmagan</span>
          </>
        )}
      </div>

      {data.note && (
        <p className="tabel-note flex items-start gap-2 rounded-card border border-border bg-surface-2 px-3 py-2 text-[13px] text-muted">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{data.note}</span>
        </p>
      )}

      {marked === 0 && (
        <p
          role="status"
          className="tabel-note rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-fg"
        >
          Bu oyda hali birorta davomat qayd etilmagan — jadvaldagi hamma katak «·». Kameralar ishlayotganini va
          odamlarning yuzi ro&apos;yxatga olinganini tekshiring.
        </p>
      )}

      <TabelSheet data={data} groupLabel={groupLabel} />

      {/* Shartli belgilar — DOIM, chop etilgan varaq o'zini tushuntirishi kerak. */}
      <section className="tabel-legend" aria-label="Shartli belgilar">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Shartli belgilar</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
          {legend.map((item, index) => {
            const mark = normalizeMark(item.mark);
            return (
              // Kalitda indeks ham bor: server bitta belgini ikki marta
              // yuborsa React kalitlari to'qnashib, ro'yxat buzilardi.
              <li key={`${item.mark}-${index}`} className="flex items-center gap-1.5">
                <span className={cn('w-4 text-center font-bold', TABEL_MARK_CLASS[mark])}>{item.mark}</span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
        {/* O'ngdagi ustunlar nimani anglatishi qog'ozda hech qayerda
            yozilmagan edi — imzolovchi "Ish kuni" nimadan hisoblanganini
            so'rardi. Bitta gap bilan tushuntiriladi. */}
        <p className="mt-1.5 text-[11px] text-muted">
          O&apos;ngdagi ustunlar — shu odamning oy bo&apos;yicha yakuni. «Ish kuni» — dam olish («D») bo&apos;lmagan
          kunlar soni; «Keldi» + «Kech» + «Kelmadi» + «Ma&apos;lumot yo&apos;q» ayni shunga teng.
        </p>
      </section>

      {/* Imzo bloki — faqat qog'ozda. */}
      <section className="print-only tabel-sign" aria-hidden="true">
        <div className="tabel-sign-row">
          <span>Mas&apos;ul shaxs:</span>
          <span className="tabel-sign-line" />
          <span className="tabel-sign-hint">(F.I.Sh., imzo)</span>
        </div>
        <div className="tabel-sign-row">
          <span>Bo&apos;linma rahbari:</span>
          <span className="tabel-sign-line" />
          <span className="tabel-sign-hint">(F.I.Sh., imzo)</span>
        </div>
        <div className="tabel-sign-row">
          <span>Sana: «____» ____________ 20____ y.</span>
        </div>
      </section>
    </div>
  );
}
