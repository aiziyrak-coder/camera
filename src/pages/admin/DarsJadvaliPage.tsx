import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  Button,
  CodeText,
  DataTable,
  DateRangePicker,
  ErrorState,
  IntelPanel,
  MicroLabel,
  Page,
  Readout,
  StatusLamp,
  formatUzDate,
  useToast,
  type DataTableColumn,
  type DateRangeValue,
} from '../../ui';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { downloadBlob } from '../../lib/download';
import { getLessonSessionsInRange } from '../../lib/teachersApi';
import { useViewDate } from '../../lib/viewDate';
import {
  TEMPLATE_PATH,
  defaultRange,
  previewSummary,
  uploadWeekly,
  type ImportResult,
} from '../../lib/darsJadvaliApi';
import type { LessonSession } from '../../types';

/**
 * Dars jadvali.
 *
 * Ish tartibi: namunani yuklab olish → kafedra to'ldiradi → shu yerga
 * qaytarib yuklash. Namuna HAFTALIK: bitta dars uchun bitta qator,
 * tizim uni semestrga o'zi yoyadi.
 *
 * Yuklash ikki bosqichli: avval ko'rish (hech narsa yozilmaydi), keyin
 * tasdiqlash. Jadval bo'yicha davomat keyin o'z-o'zidan hisoblanadi
 * (camera-api/app/jobs/lesson_attendance.py).
 */
export default function DarsJadvaliPage() {
  const { today } = useViewDate();
  const { token } = useAuth();
  const toast = useToast();

  const [range, setRange] = useState<DateRangeValue>(() => {
    const preset = defaultRange(today);
    return { from: preset.from, to: preset.to, preset: 'custom' };
  });
  const [lessons, setLessons] = useState<LessonSession[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setListError(null);
      try {
        const items = await getLessonSessionsInRange(range.from, range.to, {}, { signal });
        setLessons(items);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setListError(err instanceof ApiError ? err.message : "Jadvalni olib bo'lmadi");
      }
    },
    [range.from, range.to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function downloadTemplate() {
    setBusy(true);
    try {
      const blob = await api.blob(TEMPLATE_PATH, token);
      downloadBlob(blob, 'dars-jadvali-namuna.xlsx');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Namunani yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function run(apply: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadWeekly(file, range, apply, token);
      setPreview(result);
      if (apply) {
        toast.success(`${result.imported.toLocaleString('ru-RU')} dars qo'shildi`);
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
        await load();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Faylni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  const withoutCamera = useMemo(
    () => (lessons ?? []).filter((lesson) => !lesson.cameraId).length,
    [lessons],
  );
  const groups = useMemo(() => new Set((lessons ?? []).map((lesson) => lesson.group)).size, [lessons]);

  const columns: DataTableColumn<LessonSession>[] = [
    {
      key: 'date',
      header: 'Sana',
      sortValue: (row) => row.date,
      cell: (row) => <CodeText className="text-[13px]">{formatUzDate(row.date)}</CodeText>,
    },
    {
      key: 'start',
      header: 'Vaqt',
      sortValue: (row) => row.scheduledStartTime ?? '',
      cell: (row) => (
        <CodeText className="text-[13px]">
          {row.scheduledStartTime
            ? new Date(row.scheduledStartTime).toLocaleTimeString('uz-UZ', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Tashkent',
              })
            : '—'}
        </CodeText>
      ),
    },
    { key: 'group', header: 'Guruh', sortValue: (row) => row.group },
    { key: 'subject', header: 'Fan', sortValue: (row) => row.subject },
    {
      key: 'camera',
      header: 'Kamera',
      cell: (row) =>
        row.cameraId ? (
          <StatusLamp status="ok" label="Bor" />
        ) : (
          <StatusLamp status="warn" label="Yo'q" />
        ),
    },
    { key: 'teacher', header: "O'qituvchi", sortValue: (row) => row.teacher },
  ];

  return (
    <Page
      title="Dars jadvali"
      actions={
        <span className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={downloadTemplate} loading={busy && !file}>
            Namuna
          </Button>
        </span>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-surface px-3 py-2">
          <Readout label="Darslar" value={lessons ? lessons.length.toLocaleString('ru-RU') : '—'} />
          <Readout label="Guruhlar" value={lessons ? String(groups) : '—'} />
          <Readout label="Kamerasiz" value={lessons ? String(withoutCamera) : '—'} />
          <span className="ms-auto">
            <DateRangePicker value={range} onChange={setRange} />
          </span>
        </div>

        <IntelPanel title="Jadval yuklash">
          <div className="flex flex-wrap items-center gap-3 px-3 py-3">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv"
              aria-label="Haftalik jadval fayli"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
              className="text-[13px]"
            />
            <Button icon={Upload} onClick={() => run(false)} disabled={!file || busy}>
              Ko&apos;rish
            </Button>
            {preview?.preview && preview.imported > 0 && (
              <Button variant="primary" onClick={() => run(true)} loading={busy}>
                Tasdiqlash
              </Button>
            )}
            <MicroLabel className="ms-auto">Namunani to&apos;ldirib shu yerga yuklang</MicroLabel>
          </div>

          {preview && (
            <div className="border-t border-border px-3 py-2">
              <p className="text-[13px] text-fg">{previewSummary(preview)}</p>
              {preview.unmatchedRooms.length > 0 && (
                <p className="mt-1 text-[12px] text-warning">
                  Kamerasiz xona: {preview.unmatchedRooms.slice(0, 8).join(', ')}
                </p>
              )}
              {preview.unmatchedTeachers.length > 0 && (
                <p className="mt-1 text-[12px] text-warning">
                  Topilmagan o&apos;qituvchi: {preview.unmatchedTeachers.slice(0, 5).join(', ')}
                </p>
              )}
              {preview.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {preview.errors.slice(0, 5).map((error, index) => (
                    <li key={`${error.row}-${index}`} className="text-[12px] text-danger">
                      {error.row > 0 ? `${error.row}-qator: ` : ''}
                      {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </IntelPanel>

        <IntelPanel title="Darslar" code={lessons ? `${lessons.length} ta` : undefined}>
          {listError ? (
            <ErrorState title="Jadval yuklanmadi" message={listError} onRetry={() => void load()} />
          ) : (
            <DataTable
              rows={lessons ?? []}
              columns={columns}
              rowKey={(row) => row.id}
              loading={lessons === null}
              dense
              emptyTitle="Bu davrda dars yo'q"
              emptyDescription="Namunani to'ldirib yuklang"
            />
          )}
        </IntelPanel>
      </div>
    </Page>
  );
}
