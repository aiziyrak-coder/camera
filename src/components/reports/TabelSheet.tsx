import { cn } from '../../ui';
import { todayInTashkent } from '../../lib/uzDate';
import {
  TABEL_MARKS,
  TABEL_MARK_CELL,
  TABEL_MARK_CLASS,
  normalizeMark,
  weekdayLetter,
  weekdayName,
  type TabelPerson,
  type TabelReport,
} from '../../lib/tabelApi';

interface TabelSheetProps {
  data: TabelReport;
  /** Talaba — "Guruh", xodim — "Bo'linma". */
  groupLabel: string;
  today?: string;
}

/** O'ngdagi jami ustunlari — qog'ozda ham, ekranda ham bir xil tartib. */
const TOTAL_COLUMNS: { key: keyof TabelPerson['totals']; label: string; hint: string }[] = [
  { key: 'present', label: 'Keldi', hint: 'Kelgan kunlar soni' },
  { key: 'late', label: 'Kech', hint: 'Kech kelgan kunlar soni' },
  { key: 'absent', label: 'Kelmadi', hint: 'Kelmagan kunlar soni' },
  { key: 'unknown', label: 'Aniqlanmadi', hint: "Ma'lumot yo'q bo'lgan kunlar soni" },
  { key: 'workDays', label: 'Ish kuni', hint: 'Oydagi ish kunlari soni' },
];

/** Yuzi ro'yxatga olinmagan odam uchun sabab — server katak izohini
 *  bermasa ham qator o'zini tushuntirib tursin. */
const NOT_ENROLLED_REASON = "Yuzi ro'yxatga olinmagan — davomat qayd etilmaydi";

const HEAD = 'border-b border-border px-2 py-1.5 text-[11px] font-semibold text-muted';
const BODY = 'px-2 py-1.5 align-middle';
/** Chap uchta ustunning aniq kengligi — yopishgan ustunlar shu
 *  o'lchamlar bo'yicha joylashadi (left-0 / left-10 / left-[15.5rem]). */
const COL = {
  no: 'w-10 min-w-[2.5rem] max-w-[2.5rem]',
  name: 'w-52 min-w-[13rem] max-w-[13rem]',
  group: 'w-28 min-w-[7rem] max-w-[7rem]',
};
const OFFSET = { no: 'left-0', name: 'left-10', group: 'left-[15.5rem]' };

/**
 * Oylik tabel jadvali.
 *
 * Chap uchta ustun (tartib raqami, F.I.Sh., guruh) yopishib turadi —
 * 31 ta kun ustunini aylantirganda ham kimning qatori ekani ko'rinadi.
 * Har katakdagi BELGI asosiy signal: qog'oz oq-qora bosiladi, shuning
 * uchun rang faqat ekranda yordam beradi.
 */
export default function TabelSheet({ data, groupLabel, today = todayInTashkent() }: TabelSheetProps) {
  const todayDay = today.slice(0, 7) === data.month ? Number(today.slice(8, 10)) : null;

  return (
    <div data-tabel-scroll className="overflow-x-auto rounded-card border border-border bg-surface">
      <table data-tabel className="w-full border-collapse text-[13px] tabular-nums">
        <caption className="sr-only">
          {data.title} — {data.scope}, {data.monthLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, STICKY_HEAD, OFFSET.no, COL.no, 'z-30 text-center')}>
              №
            </th>
            <th scope="col" className={cn(HEAD, STICKY_HEAD, OFFSET.name, COL.name, 'z-30 text-left')}>
              F.I.Sh.
            </th>
            <th scope="col" className={cn(HEAD, STICKY_HEAD, OFFSET.group, COL.group, 'z-30 text-left')}>
              {groupLabel}
            </th>
            {data.days.map((day) => {
              const name = weekdayName(day.weekday, data.month, day.day);
              const isToday = todayDay === day.day;
              return (
                <th
                  key={day.day}
                  scope="col"
                  data-day={day.day}
                  data-rest={day.isWorkDay ? undefined : ''}
                  data-today={isToday ? '' : undefined}
                  title={`${day.day}-kun, ${name}${day.isWorkDay ? '' : ' — dam olish kuni'}`}
                  className={cn(
                    HEAD,
                    'sticky top-0 z-20 w-7 min-w-[1.75rem] px-0 text-center',
                    day.isWorkDay ? 'bg-surface-2' : 'bg-surface-3 text-subtle',
                    isToday && 'bg-primary-soft text-primary',
                  )}
                >
                  <span className="block text-[10px] font-normal leading-tight opacity-70">
                    {weekdayLetter(data.month, day.day)}
                  </span>
                  <span className="block leading-tight">{day.day}</span>
                </th>
              );
            })}
            {TOTAL_COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={column.hint}
                className={cn(HEAD, 'sticky top-0 z-20 w-12 min-w-[3rem] border-l border-border bg-surface-2 text-center')}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.people.map((person, index) => {
            const byDay = new Map(person.cells.map((cell) => [cell.day, cell]));
            // Zebra chiziq yopishgan ustunlarda ham ko'rinsin — shuning
            // uchun fon qatorga emas, HAR katakka beriladi.
            const stripe = index % 2 === 1 ? 'bg-surface-2/50' : 'bg-surface';
            return (
              <tr key={person.id} data-tabel-row className="border-t border-border/70">
                <td className={cn(BODY, STICKY_BODY, OFFSET.no, COL.no, stripe, 'text-center text-muted')}>
                  {index + 1}
                </td>
                <th
                  scope="row"
                  title={person.fullName}
                  className={cn(BODY, STICKY_BODY, OFFSET.name, COL.name, stripe, 'truncate text-left font-medium')}
                >
                  {person.fullName}
                  {!person.enrolled && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted" title={NOT_ENROLLED_REASON}>
                      (yuzi yo&apos;q)
                    </span>
                  )}
                </th>
                <td
                  title={person.group}
                  className={cn(BODY, STICKY_BODY, OFFSET.group, COL.group, stripe, 'truncate text-left text-muted')}
                >
                  {person.group}
                </td>
                {data.days.map((day) => {
                  const cell = byDay.get(day.day);
                  // Server katak bermagan kun ham bo'sh qolmasin: "·" va sababi.
                  const mark = normalizeMark(cell?.mark ?? '·');
                  const title =
                    cell?.title ||
                    (person.enrolled
                      ? `${day.day}-kun: ${TABEL_MARKS[mark].label}`
                      : `${day.day}-kun: ${NOT_ENROLLED_REASON}`);
                  return (
                    <td
                      key={day.day}
                      data-tabel-cell
                      data-day={day.day}
                      data-mark={mark}
                      data-rest={day.isWorkDay ? undefined : ''}
                      data-today={todayDay === day.day ? '' : undefined}
                      tabIndex={0}
                      title={title}
                      aria-label={`${person.fullName}, ${title}`}
                      className={cn(
                        BODY,
                        'px-0 text-center font-semibold outline-offset-[-2px]',
                        TABEL_MARK_CLASS[mark],
                        TABEL_MARK_CELL[mark] || stripe,
                        !day.isWorkDay && 'bg-surface-3/70',
                        todayDay === day.day && 'ring-1 ring-inset ring-primary',
                      )}
                    >
                      {mark}
                    </td>
                  );
                })}
                {TOTAL_COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    data-total={column.key}
                    className={cn(BODY, stripe, 'border-l border-border text-center')}
                  >
                    {person.totals?.[column.key] ?? 0}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STICKY_HEAD = 'sticky top-0 bg-surface-2';
const STICKY_BODY = 'sticky z-10';
