import { Radio } from 'lucide-react';
import Badge from '../Badge';
import type { LiveAttendanceMessage } from '../../lib/realtime';

/**
 * Hozirgina kamera orqali davomatga yozilganlar — WebSocket orqali keladi
 * (app/jobs/attendance_ai.py _announce_attendance). Ilgari yozuv bazada
 * bo'lsa ham sahifa qayta yuklanguncha ko'rinmasdi va "davomat kechikyapti"
 * degan taassurot qolardi.
 */
export default function LiveArrivals({
  items,
  onOpen,
}: {
  items: LiveAttendanceMessage[];
  onOpen: (personId: string) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-white/60 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
        <Radio size={14} className="text-emerald-600" aria-hidden />
        Jonli: hozirgina kelganlar
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sahifa ochiq turganda kamera tanigan har bir odam shu yerda darhol ko'rinadi.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-live="polite">
          {items.map((item) => (
            <li key={`${item.personId}-${item.date}`}>
              <button
                type="button"
                onClick={() => onOpen(item.personId)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-left text-sm hover:text-indigo-600"
              >
                <span className="font-medium text-slate-900">{item.fullName ?? "Noma'lum"}</span>
                <span className="text-xs text-slate-500">{item.group ?? ''}</span>
                <Badge tone={item.status === 'kech_keldi' ? 'amber' : 'green'}>
                  {item.status === 'kech_keldi' ? 'Kech keldi' : 'Keldi'}
                  {item.checkIn ? ` · ${item.checkIn}` : ''}
                </Badge>
                {item.camera && <span className="ml-auto text-xs text-slate-400">{item.camera}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
