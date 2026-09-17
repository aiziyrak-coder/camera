import { useEffect, useState } from 'react';
import { Check, Loader2, UserRoundX } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import type { StudentStaffRecord } from '../../types';

type Decision = 'approve' | 'reject';

interface Props {
  record: StudentStaffRecord | null;
  onClose: () => void;
  onDone: (decision: Decision, record: StudentStaffRecord) => void;
}

/**
 * Ochiq sahifada o'zini o'zi ro'yxatdan o'tkazgan odamning yuzini ko'rib
 * chiqish. Tasdiqlanmaguncha kameralar uni tanimaydi va "begona shaxs"
 * deb belgilaydi — tasdiqlash shuning uchun yuzni katta ko'rib, ism va
 * lavozim bilan solishtirgandan keyin qilinadi.
 */
export default function SelfEnrollmentReviewModal({ record, onClose, onDone }: Props) {
  const { token } = useAuth();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setPending(null);
      setError(null);
    }
  }, [record]);

  async function decide(decision: Decision) {
    if (!record) return;
    setPending(decision);
    setError(null);
    try {
      const updated = await api.post<StudentStaffRecord>(
        `/api/students-staff/${record.id}/biometrics/${decision}`,
        {},
        token,
      );
      onDone(decision, updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi");
      setPending(null);
    }
  }

  return (
    <Modal open={!!record} onClose={pending ? () => undefined : onClose} title="Yuzni tasdiqlash" maxWidth="max-w-md">
      {record && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Bu odam ochiq sahifada o&apos;zini o&apos;zi ro&apos;yxatdan o&apos;tkazdi — institut ro&apos;yxatida
            yo&apos;q edi. Tasdiqlaganingizdan keyin kameralar uni taniydi va davomatga yozadi.
          </p>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 text-center">
            {record.biometricPhotoUrl ? (
              <img
                src={record.biometricPhotoUrl}
                alt={`${record.fullName} — yuborilgan yuz rasmi`}
                className="h-48 w-48 rounded-2xl object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-400">
                Rasm topilmadi
              </div>
            )}
            <div>
              <p className="text-base font-bold text-slate-900">{record.fullName}</p>
              <p className="text-xs text-slate-500">
                {record.type === 'talaba' ? 'Talaba' : 'Xodim'} · {record.groupOrPosition}
                {record.faculty ? ` · ${record.faculty}` : ''}
              </p>
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">{error}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => decide('reject')}
              disabled={pending !== null}
              title="Rasm va yuz ma'lumoti o'chiriladi, odam qayta yuborishi mumkin"
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <UserRoundX size={14} />}
              Rad etish
            </button>
            <button
              type="button"
              onClick={() => decide('approve')}
              disabled={pending !== null}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Tasdiqlash
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
