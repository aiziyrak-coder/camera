import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Badge, DataTable, ErrorState, SkeletonTiles, StatTile, cn, type DataTableColumn } from '../../ui';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { getAttendanceCameras } from '../../lib/teachersApi';
import type { AttendanceCamera, AttendanceCameras } from '../../types';

const COLUMNS: DataTableColumn<AttendanceCamera>[] = [
  {
    key: 'name',
    header: 'Kamera',
    sortValue: (c) => c.name,
    cell: (c) => (
      <div className={cn('min-w-0', !c.attendanceEnabled && 'opacity-60')}>
        <p className="font-medium text-fg">{c.name}</p>
        <p className="text-xs text-muted">
          {c.building} · {c.zone}
        </p>
      </div>
    ),
  },
  {
    key: 'role',
    header: 'Vazifasi',
    hideOnMobile: true,
    cell: (c) => (
      <span className="text-[13px] text-muted">
        {c.role}
        {c.checkIntervalSeconds ? ` · har ${c.checkIntervalSeconds} s` : ''}
      </span>
    ),
  },
  {
    key: 'attendance',
    header: 'Davomat',
    sortValue: (c) => (c.attendanceEnabled ? 1 : 0),
    cell: (c) =>
      c.attendanceEnabled ? (
        <Badge tone="success" dot>
          Ishlaydi
        </Badge>
      ) : (
        <span className="text-xs text-muted">{c.disabledReason}</span>
      ),
  },
  {
    key: 'online',
    header: 'Tarmoq / tasvir',
    cell: (c) => (
      <span className="inline-flex gap-1.5">
        <Badge tone={c.online ? 'success' : 'danger'}>{c.online ? 'Tarmoqda' : "Tarmoq yo'q"}</Badge>
        <Badge tone={c.video ? 'success' : 'warning'}>{c.video ? 'Tasvir bor' : "Tasvir yo'q"}</Badge>
      </span>
    ),
  },
  {
    key: 'recognized',
    header: 'Bugun tanigan',
    align: 'right',
    sortValue: (c) => c.recognizedToday,
    sortFirst: 'desc',
    cell: (c) => (
      <div>
        <p className="font-semibold tabular-nums text-fg">{c.recognizedToday}</p>
        <p className="text-xs tabular-nums text-muted">{c.lastRecognition ?? '—'}</p>
      </div>
    ),
  },
  {
    key: 'ai',
    header: 'Bugun AI',
    hideOnMobile: true,
    cell: (c) =>
      c.framesCheckedToday > 0 ? (
        <div className="whitespace-nowrap text-xs tabular-nums text-muted">
          <p className="text-fg">
            {c.framesCheckedToday} kadr · {c.facesSeenToday} yuz
          </p>
          <p>
            {c.facePxMedian ? `~${c.facePxMedian} px` : '—'}
            {c.bestSimilarityToday != null ? ` · max ${c.bestSimilarityToday.toFixed(2)}` : ''}
            {c.relaxedPendingToday > 0 ? ` · ${c.relaxedPendingToday} kutilmoqda` : ''}
          </p>
          {(c.lastCycleSeconds != null || c.streamInUse) && (
            <p>
              {c.lastCycleSeconds != null ? `aylanish ${Math.round(c.lastCycleSeconds)} s (kadr ${Math.round(c.lastGrabSeconds ?? 0)} s)` : ''}
              {c.streamInUse ? ` · ${c.streamInUse}` : ''}
            </p>
          )}
        </div>
      ) : (
        <span className="text-xs text-subtle">{c.lastChecked ?? '—'}</span>
      ),
  },
  {
    key: 'diagnosis',
    header: 'Tashxis',
    cell: (c) => (c.diagnosis ? <span className="block min-w-[12rem] text-xs text-warning">{c.diagnosis}</span> : <span className="text-subtle">—</span>),
  },
];

/** Davomat kameralari tashxisi: qaysi kamera davomatga yozadi, tarmoq/tasvir
 *  holati, bugun kimni tanigani va nima uchun tanimayotgani. */
export function AttendanceCamerasPanel() {
  const [data, setData] = useState<AttendanceCameras | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    getAttendanceCameras({ signal: controller.signal })
      .then(setData)
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof ApiError ? err.message : "Ma'lumotni olib bo'lmadi");
      });
    return () => controller.abort();
  }, [nonce]);

  if (error) return <ErrorState variant="block" message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!data)
    return (
      <div className="flex flex-col gap-5">
        <SkeletonTiles count={4} />
        <DataTable columns={COLUMNS} rows={[]} rowKey={(c) => c.id} loading />
      </div>
    );

  const problems = data.cameras.filter((c) => c.attendanceEnabled && c.diagnosis);

  return (
    <div className="flex flex-col gap-5">
      {(!data.staffModuleActive || !data.studentModuleActive) && (
        <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {!data.staffModuleActive && 'Xodimlar davomati (#6) o‘chirilgan. '}
            {!data.studentModuleActive && 'Talabalar davomati (#7) o‘chirilgan.'}
          </span>
        </div>
      )}
      {problems.length > 0 && data.peopleRecognizedToday === 0 && (
        <div className="rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <p className="font-semibold">Bugun hali hech kim davomatga tushmadi.</p>
          <p className="mt-1">
            "Tashxis" ustuni sababini ko&apos;rsatadi: kamera tekshirilmayaptimi, kadrda yuz yo&apos;qmi, yuzlar juda kichikmi yoki
            o&apos;xshashlik chegaradan pastmi.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Davomatda ishlaydigan" value={`${data.attendanceEnabled} / ${data.total}`} hint={`Kirish ${data.entrance} · chiqish ${data.exit}`} />
        <StatTile label="Tarmoqda / tasvir" value={`${data.online} / ${data.video}`} tone={data.video < data.attendanceEnabled ? 'warning' : 'success'} />
        <StatTile label="Bugun tanigan kameralar" value={data.recognizingToday} />
        <StatTile label="Bugun tanilgan odamlar" value={data.peopleRecognizedToday} hint={`Yuzi saqlangan: ${data.enrolledFaces}`} />
      </div>

      <DataTable
        columns={COLUMNS}
        rows={data.cameras}
        rowKey={(c) => c.id}
        rowTone={(c) => (c.attendanceEnabled && c.diagnosis ? 'warning' : null)}
        defaultSort={{ key: 'attendance', dir: 'desc' }}
        emptyTitle="Kameralar yo'q"
        ariaLabel="Davomat kameralari"
      />
      <p className="text-xs leading-relaxed text-muted">
        "Tasvir" — kamera so&apos;nggi daqiqalarda AI uchun kadr bergani. "Bugun tanigan" — shu kamerada bugun tanilgan turli odamlar
        soni. "Bugun AI" — server qayta ishga tushgandan beri: tekshirilgan kadrlar, ko&apos;rilgan yuzlar, yuzning o&apos;rtacha
        balandligi va ro&apos;yxatdagi eng yaqin odamga eng yuqori o&apos;xshashlik (tanish chegarasi {data.matchThreshold}
        {data.relaxedThreshold ? `; ${data.relaxedThreshold}–${data.matchThreshold} oralig'i ikkinchi ko'rinish bilan tasdiqlanadi` : ''}).
      </p>
    </div>
  );
}
