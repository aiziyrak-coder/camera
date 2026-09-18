import { useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';

interface PreviewRow {
  row: number;
  date: string;
  start: string | null;
  group: string;
  subject: string;
  teacher: string | null;
  teacherMatched: boolean;
  room: string | null;
  camera: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  preview: boolean;
  withCamera: number;
  withTeacher: number;
  rows: PreviewRow[];
  unmatchedRooms: string[];
  unmatchedTeachers: string[];
}

const CSV_TEMPLATE = `sana;guruh;fan;xona;o'qituvchi;boshlanish
21.09.2026;DI-1625;Anatomiya;211;Karimov Aziz Olimovich;08:30-09:50
`;

/**
 * Dars jadvali importi — ikki bosqich: avval "Tekshirish" (hech narsa
 * yozilmaydi, qaysi xona kameraga va qaysi o'qituvchi xodimga bog'langani
 * ko'rinadi), keyin "Saqlash". Xona kameraga Camera.roomCode orqali
 * bog'lanadi — kameralar sahifasida xona raqamlari to'ldirilgan bo'lishi kerak.
 */
export default function LessonImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  }

  async function send(apply: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.postForm<ImportResult>(`/api/lesson-sessions/import?apply=${apply}`, form, token);
      setResult(res);
      if (apply && res.imported > 0) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import xatosi');
    } finally {
      setBusy(false);
    }
  }

  const canSave = result?.preview && result.imported > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Dars jadvalini import qilish" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          CSV yoki Excel. Majburiy ustunlar: <span className="font-mono">sana, guruh, fan</span>. Ixtiyoriy:{' '}
          <span className="font-mono">xona, o&apos;qituvchi, boshlanish, fakultet</span> (fakultet bo&apos;lmasa
          guruh talabalaridan olinadi). Xona kameraga kameralar sahifasidagi «Xona raqami» orqali bog&apos;lanadi.
        </p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6">
          <FileUp size={22} className="text-indigo-500" />
          <span className="text-sm font-medium text-slate-700">{file ? file.name : 'CSV yoki Excel fayl tanlang'}</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        <details className="rounded-xl bg-white/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-600">Namuna format</summary>
          <pre className="mt-2 overflow-x-auto font-mono text-[10px] text-slate-500">{CSV_TEMPLATE}</pre>
        </details>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

        {result && (
          <div className="flex flex-col gap-3 text-xs">
            <p
              className={`rounded-xl px-3 py-2 font-semibold ${result.preview ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}
            >
              {result.preview ? 'Tekshiruv: ' : 'Saqlandi: '}
              {result.imported} ta dars{result.preview ? ' qo‘shiladi' : ' qo‘shildi'}, {result.skipped} ta avval bor
              edi. Kameraga bog&apos;langan: {result.withCamera}, o&apos;qituvchisi topilgan: {result.withTeacher}.
            </p>
            {result.unmatchedRooms.length > 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                Kamerasi topilmagan xonalar ({result.unmatchedRooms.length}): {result.unmatchedRooms.join(', ')} —
                kameralar sahifasida shu xonalar kamerasiga «Xona raqami»ni kiriting va qayta import qiling.
              </p>
            )}
            {result.unmatchedTeachers.length > 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                Xodimlar ro&apos;yxatida topilmagan o&apos;qituvchilar ({result.unmatchedTeachers.length}):{' '}
                {result.unmatchedTeachers.join(', ')}
              </p>
            )}
            {result.errors.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl bg-red-50 px-3 py-2 text-red-600">
                {result.errors.map((err) => (
                  <li key={`${err.row}-${err.message}`}>
                    Qator {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            )}
            {result.rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-xl bg-white/60">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="px-2 py-1">Sana</th>
                      <th className="px-2 py-1">Vaqt</th>
                      <th className="px-2 py-1">Guruh</th>
                      <th className="px-2 py-1">Fan</th>
                      <th className="px-2 py-1">O&apos;qituvchi</th>
                      <th className="px-2 py-1">Xona → kamera</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((row) => (
                      <tr key={row.row}>
                        <td className="px-2 py-1 tabular-nums">{row.date}</td>
                        <td className="px-2 py-1 tabular-nums">{row.start ?? '—'}</td>
                        <td className="px-2 py-1">{row.group}</td>
                        <td className="px-2 py-1">{row.subject}</td>
                        <td className={`px-2 py-1 ${row.teacher && !row.teacherMatched ? 'text-amber-700' : ''}`}>
                          {row.teacher ?? '—'}
                        </td>
                        <td className={`px-2 py-1 ${row.room && !row.camera ? 'text-amber-700' : ''}`}>
                          {row.room ?? '—'} {row.camera ? `→ ${row.camera}` : row.room ? '→ topilmadi' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="btn-glass">
            Yopish
          </button>
          <button
            type="button"
            onClick={() => send(false)}
            disabled={!file || busy}
            className="btn-glass disabled:opacity-50"
          >
            {busy && !canSave ? <Loader2 size={14} className="animate-spin" /> : 'Tekshirish'}
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            disabled={!canSave || busy}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy && canSave ? <Loader2 size={14} className="animate-spin" /> : 'Saqlash'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
