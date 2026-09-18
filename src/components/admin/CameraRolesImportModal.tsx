import { useState } from 'react';
import { Download, FileUp, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { ROOM_TYPE_LABELS } from '../../lib/cameraRoles';
import type { RoomType } from '../../types';

interface RoleChange {
  cameraId: string;
  cameraName: string;
  field: 'room_type' | 'room_code';
  old: string | null;
  new: string | null;
}

interface RolesImportResult {
  rows: number;
  changes: RoleChange[];
  errors: { row: number; message: string }[];
  applied: boolean;
}

function show(field: RoleChange['field'], value: string | null): string {
  if (value === null) return 'belgilanmagan';
  return field === 'room_type' ? (ROOM_TYPE_LABELS[value as RoomType] ?? value) : value;
}

/**
 * Kamera rollarini CSV orqali ommaviy belgilash (backend
 * app/services/camera_roles_csv.py): shablonni yuklab olish -> Excel'da
 * `xona_turi` va `xona_raqami` ni to'ldirish -> "Tekshirish" -> "Saqlash".
 */
export default function CameraRolesImportModal({
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
  const [result, setResult] = useState<RolesImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  }

  async function downloadTemplate() {
    setError(null);
    try {
      downloadBlob(await api.blob('/api/cameras/roles.csv', token), 'kamera-rollari.csv');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shablonni yuklab bo'lmadi");
    }
  }

  async function send(apply: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.postForm<RolesImportResult>(`/api/cameras/roles/import?apply=${apply}`, form, token);
      setResult(res);
      if (res.applied) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import xatosi');
    } finally {
      setBusy(false);
    }
  }

  const canSave = result !== null && !result.applied && result.changes.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Kamera rollari (xona turi va raqami)" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4 text-xs">
        <ol className="list-decimal space-y-1 pl-4 text-slate-600">
          <li>Shablonni yuklab oling — unda barcha kameralar bor.</li>
          <li>
            Excel&apos;da <span className="font-mono">xona_turi</span> ({Object.keys(ROOM_TYPE_LABELS).join(', ')}) va{' '}
            <span className="font-mono">xona_raqami</span> ni to&apos;ldiring. Bo&apos;sh katak — o&apos;zgarmaydi,
            «-» — belgini olib tashlaydi.
          </li>
          <li>Faylni yuklab «Tekshirish», keyin «Saqlash».</li>
        </ol>
        <p className="rounded-xl bg-indigo-50 px-3 py-2 text-indigo-800">
          Xona turi AI modullarini yo&apos;naltiradi: kunlik davomat faqat kirishda, uyqu faqat auditoriyada, oq
          xalat va niqob faqat laboratoriyada. Turi belgilanmagan kamerada faqat xavfsizlik mezonlari ishlaydi.
        </p>

        <button type="button" onClick={downloadTemplate} className="btn-glass flex w-fit items-center gap-1.5">
          <Download size={14} />
          Shablonni yuklab olish
        </button>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5">
          <FileUp size={22} className="text-indigo-500" />
          <span className="text-sm font-medium text-slate-700">{file ? file.name : "To'ldirilgan CSV faylni tanlang"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-600">{error}</p>}

        {result && (
          <div className="flex flex-col gap-2">
            <p
              className={`rounded-xl px-3 py-2 font-semibold ${result.applied ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}
            >
              {result.rows} qator o&apos;qildi, {result.changes.length} ta o&apos;zgarish
              {result.applied ? ' saqlandi.' : ' — hali saqlanmagan.'}
            </p>
            {result.errors.length > 0 && (
              <ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl bg-red-50 px-3 py-2 text-red-600">
                {result.errors.map((err) => (
                  <li key={`${err.row}-${err.message}`}>
                    Qator {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            )}
            {result.changes.length > 0 && (
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white/60 px-3">
                {result.changes.map((change) => (
                  <li key={`${change.cameraId}-${change.field}`} className="flex flex-wrap gap-x-2 py-1">
                    <span className="font-medium text-slate-900">{change.cameraName}</span>
                    <span className="text-slate-500">{change.field === 'room_type' ? 'tur' : 'xona'}:</span>
                    <span className="text-slate-400 line-through">{show(change.field, change.old)}</span>
                    <span className="text-slate-700">→ {show(change.field, change.new)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="btn-glass">
            Yopish
          </button>
          <button type="button" onClick={() => send(false)} disabled={!file || busy} className="btn-glass disabled:opacity-50">
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
