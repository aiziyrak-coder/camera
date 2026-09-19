import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, FileUp, TriangleAlert } from 'lucide-react';
import { Button, DataTable, Modal, cn, focusRing, type DataTableColumn } from '../../ui';
import { ApiError, api } from '../../lib/apiClient';

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

const PREVIEW_COLUMNS: DataTableColumn<PreviewRow>[] = [
  { key: 'date', header: 'Sana', cell: (r) => <span className="tabular-nums">{r.date}</span> },
  { key: 'start', header: 'Vaqt', cell: (r) => <span className="tabular-nums">{r.start ?? '—'}</span> },
  { key: 'group', header: 'Guruh' },
  { key: 'subject', header: 'Fan' },
  {
    key: 'teacher',
    header: "O'qituvchi",
    cell: (r) => <span className={cn(r.teacher && !r.teacherMatched && 'text-warning')}>{r.teacher ?? '—'}</span>,
  },
  {
    key: 'room',
    header: 'Xona → kamera',
    cell: (r) => (
      <span className={cn(r.room && !r.camera && 'text-warning')}>
        {r.room ?? '—'} {r.camera ? `→ ${r.camera}` : r.room ? '→ topilmadi' : ''}
      </span>
    ),
  },
];

function Notice({ tone, children }: { tone: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const cls = {
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return <div className={cn('rounded-control px-3 py-2 text-[13px] leading-5', cls)}>{children}</div>;
}

/**
 * Dars jadvali importi — ikki bosqich: avval "Tekshirish" (hech narsa
 * yozilmaydi, qaysi xona kameraga va qaysi o'qituvchi xodimga bog'langani
 * ko'rinadi), keyin "Saqlash". Xona kameraga Camera.roomCode orqali
 * bog'lanadi — kameralar sahifasida xona raqamlari to'ldirilgan bo'lishi kerak.
 */
export default function LessonImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    if (busy) return;
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  }

  async function send(apply: boolean) {
    if (!file) return;
    setBusy(apply ? 'save' : 'check');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.postForm<ImportResult>(`/api/lesson-sessions/import?apply=${apply}`, form);
      setResult(res);
      if (apply && res.imported > 0) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import xatosi');
    } finally {
      setBusy(null);
    }
  }

  const canSave = Boolean(result?.preview && result.imported > 0);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      dismissible={!busy}
      size="xl"
      title="Dars jadvalini import qilish"
      description="CSV yoki Excel. Avval tekshiring — hech narsa yozilmaydi; keyin saqlang."
      footer={
        <>
          <Button onClick={handleClose} disabled={Boolean(busy)}>
            Yopish
          </Button>
          <Button onClick={() => send(false)} disabled={!file || Boolean(busy)} loading={busy === 'check'}>
            Tekshirish
          </Button>
          <Button variant="primary" onClick={() => send(true)} disabled={!canSave || Boolean(busy)} loading={busy === 'save'}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-[13px] leading-5 text-muted">
          Majburiy ustunlar: <span className="font-mono text-fg">sana, guruh, fan</span>. Ixtiyoriy:{' '}
          <span className="font-mono text-fg">xona, o&apos;qituvchi, boshlanish, fakultet</span> (fakultet bo&apos;lmasa guruh
          talabalaridan olinadi). Xona kameraga kameralar sahifasidagi «Xona raqami» orqali bog&apos;lanadi.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary-soft/40',
            focusRing,
          )}
        >
          <FileUp size={22} className="text-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-fg">{file ? file.name : 'CSV yoki Excel fayl tanlang'}</span>
          <span className="text-xs text-muted">.csv, .xlsx — 5 MB gacha</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-label="Jadval fayli"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />

        <details className="rounded-control border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted">Namuna format</summary>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-muted">{CSV_TEMPLATE}</pre>
        </details>

        {error && <Notice tone="danger">{error}</Notice>}

        {result && (
          <div className="flex flex-col gap-3">
            <Notice tone={result.preview ? 'info' : 'success'}>
              <span className="inline-flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {result.preview ? 'Tekshiruv: ' : 'Saqlandi: '}
                  {result.imported} ta dars{result.preview ? ' qo‘shiladi' : ' qo‘shildi'}, {result.skipped} ta avval bor edi.
                  Kameraga bog&apos;langan: {result.withCamera}, o&apos;qituvchisi topilgan: {result.withTeacher}.
                </span>
              </span>
            </Notice>
            {result.unmatchedRooms.length > 0 && (
              <Notice tone="warning">
                <span className="inline-flex items-start gap-2">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Kamerasi topilmagan xonalar ({result.unmatchedRooms.length}): {result.unmatchedRooms.join(', ')} — kameralar
                    sahifasida shu xonalar kamerasiga «Xona raqami»ni kiriting va qayta import qiling.
                  </span>
                </span>
              </Notice>
            )}
            {result.unmatchedTeachers.length > 0 && (
              <Notice tone="warning">
                Xodimlar ro&apos;yxatida topilmagan o&apos;qituvchilar ({result.unmatchedTeachers.length}):{' '}
                {result.unmatchedTeachers.join(', ')}
              </Notice>
            )}
            {result.errors.length > 0 && (
              <Notice tone="danger">
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {result.errors.map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Qator {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {result.rows.length > 0 && (
              <DataTable columns={PREVIEW_COLUMNS} rows={result.rows} rowKey={(r) => String(r.row)} dense maxHeight="16rem" mobile="scroll" ariaLabel="Import oldindan ko'rish" />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
