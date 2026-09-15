import { UZ_WEEKDAYS, UZ_WEEKDAYS_SHORT } from '../../lib/uzDate';

function cellColor(value: number, max: number): string {
  if (!value || !max) return 'rgba(148,163,184,0.12)';
  const alpha = 0.18 + 0.82 * (value / max);
  return `rgba(99,102,241,${alpha.toFixed(2)})`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hafta kuni × soat: signallar QACHON ko'p bo'lishini bir qarashda ko'rsatadi.
 *  Kutubxonasiz — oddiy jadval, har katak ustida aniq son (title). */
export default function Heatmap({ matrix, max }: { matrix: number[][]; max: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[10px]">
        <caption className="sr-only">Hafta kunlari va soatlar bo&apos;yicha signallar soni</caption>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }).map((_, hour) => (
              <th key={hour} scope="col" className="w-5 font-normal text-slate-400">
                {hour % 3 === 0 ? pad(hour) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, day) => (
            <tr key={day}>
              <th scope="row" className="pr-1.5 text-right font-semibold text-slate-500">
                {UZ_WEEKDAYS_SHORT[day]}
              </th>
              {row.map((value, hour) => (
                <td
                  key={hour}
                  title={`${UZ_WEEKDAYS[day]}, ${pad(hour)}:00–${pad(hour)}:59 — ${value} ta signal`}
                  className="h-5 w-5 min-w-5 rounded"
                  style={{ backgroundColor: cellColor(value, max) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span>Kam</span>
        <span className="h-2.5 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(99,102,241,1))' }} />
        <span>Ko&apos;p{max ? ` (${max} ta)` : ''}</span>
      </div>
    </div>
  );
}
