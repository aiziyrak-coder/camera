import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronFirst,
  ChevronLast,
  Download,
  History,
  MonitorPlay,
  Pause,
  Play,
  Rewind,
  FastForward,
  Search,
  VideoOff,
} from 'lucide-react';
import { Button, Card, DatePicker, EmptyState, ErrorState, IconButton, Page, Skeleton, cn, useToast } from '../../ui';
import { ApiError, isAbortError } from '../../lib/apiClient';
import { absoluteApiUrl, getArchiveDay, getArchiveLink, type ArchiveDay, type ArchiveMarker } from '../../lib/archiveApi';
import { todayInTashkent } from '../../lib/uzDate';
import { useWallCameras } from '../../components/videowall/useWallCameras';
import ArchiveTimeline from '../../components/archive/ArchiveTimeline';
import { clockLabel, defaultWindow, playableFrom } from '../../components/archive/timeline';

/**
 * VIDEO ARXIV — yozilgan videoni vaqt chizig'i bo'yicha ko'rish.
 *
 * Pleyer arxivdan 10 daqiqalik bo'laklarni oladi va bo'lak tugashi bilan
 * keyingisini o'zi so'raydi; ko'rilayotgan lahza = bo'lak boshi +
 * video.currentTime. Havola imzolangan va qisqa muddatli, har ochilishi
 * audit jurnaliga yoziladi.
 */

const CHUNK_SECONDS = 600;
const SPEEDS = [1, 2, 4, 8] as const;

interface Chunk {
  start: number;
  url: string;
  downloadUrl: string;
  h264: boolean;
}

export default function ArchivePage() {
  const [params, setParams] = useSearchParams();
  const cameraId = params.get('kamera') ?? '';
  const day = params.get('sana') ?? todayInTashkent();
  const startAt = params.get('t');
  const toast = useToast();

  const { cameras, loading: camerasLoading } = useWallCameras();
  const [query, setQuery] = useState('');
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...cameras].sort((a, b) => a.name.localeCompare(b.name, 'uz'));
    return q ? sorted.filter((c) => `${c.name} ${c.building} ${c.zone}`.toLowerCase().includes(q)) : sorted;
  }, [cameras, query]);

  const [data, setData] = useState<ArchiveDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!cameraId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getArchiveDay(cameraId, day, { signal: controller.signal })
      .then((result) => setData(result))
      .catch((err) => !isAbortError(err) && setError((err as Error).message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [cameraId, day, reload]);

  const view = useMemo(() => defaultWindow(day, data?.retentionHours ?? 4, new Date()), [day, data?.retentionHours]);

  // ── Pleyer ────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const [chunk, setChunk] = useState<Chunk | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const needsH264 = useRef(false);

  const load = useCallback(
    async (ms: number) => {
      if (!cameraId || !data) return;
      const from = playableFrom(ms, data.ranges);
      if (from == null) {
        setNotice('Bu vaqtdan keyin yozuv yo‘q');
        setCursor(ms);
        return;
      }
      setNotice(from > ms + 1000 ? `Yozuv ${clockLabel(from)} dan boshlanadi` : null);
      try {
        const link = await getArchiveLink(cameraId, new Date(from), CHUNK_SECONDS);
        const suffix = needsH264.current ? '&h264=1' : '';
        setChunk({ start: from, url: absoluteApiUrl(link.url) + suffix, downloadUrl: absoluteApiUrl(link.downloadUrl), h264: needsH264.current });
        setCursor(from);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Arxivni ochib bo‘lmadi');
      }
    },
    [cameraId, data, toast],
  );

  // Havoladan kelgan vaqt (?t=) yoki kamera/kun o'zgarganda.
  useEffect(() => {
    setChunk(null);
    setCursor(null);
    setPlaying(false);
    needsH264.current = false;
  }, [cameraId, day]);
  useEffect(() => {
    if (data && startAt && !chunk) void load(Date.parse(startAt));
    // faqat ma'lumot kelganda bir marta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, chunk]);

  const seek = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (chunk && video && ms >= chunk.start && ms < chunk.start + CHUNK_SECONDS * 1000 && video.seekable.length) {
        const offset = (ms - chunk.start) / 1000;
        if (offset <= video.seekable.end(video.seekable.length - 1)) {
          video.currentTime = offset;
          setCursor(ms);
          return;
        }
      }
      void load(ms);
    },
    [chunk, load],
  );

  const markers = data?.events ?? [];
  const jumpEvent = (direction: 1 | -1) => {
    if (cursor == null) return;
    const times = markers.map((m) => Date.parse(m.at) - 10_000).sort((a, b) => a - b);
    const next = direction > 0 ? times.find((t) => t > cursor + 1000) : [...times].reverse().find((t) => t < cursor - 1000);
    if (next != null) seek(next);
  };

  const openMarker = (marker: ArchiveMarker) => seek(Date.parse(marker.at) - 10_000);

  const selectCamera = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('kamera', id);
    next.delete('t');
    setParams(next, { replace: true });
  };
  const selectDay = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('sana', value);
    next.delete('t');
    setParams(next, { replace: true });
  };

  const selected = cameras.find((c) => c.id === cameraId);

  return (
    <Page
      title="Video arxiv"
      subtitle={data ? `Oxirgi ${data.retentionHours} soat saqlanadi · hodisa kliplari 30 kun` : 'Yozilgan videoni vaqt bo‘yicha ko‘rish'}
      breadcrumbs={[{ label: 'Nazorat', to: '/' }, { label: 'Video arxiv' }]}
      actions={<DatePicker value={day} onChange={selectDay} stepper quick size="sm" ariaLabel="Arxiv kuni" />}
    >
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card padding="none" className="flex max-h-[70vh] min-h-[240px] flex-col overflow-hidden">
          <label className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="shrink-0 text-subtle" aria-hidden="true" />
            <input
              id="arxiv-kamera-qidiruv"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kamera qidirish"
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label="Kameralar">
            {camerasLoading && !cameras.length ? (
              <div className="space-y-1 p-1">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              listed.map((camera) => (
                <button
                  key={camera.id}
                  type="button"
                  role="option"
                  aria-selected={camera.id === cameraId}
                  onClick={() => selectCamera(camera.id)}
                  className={cn(
                    'flex w-full flex-col rounded-control px-2.5 py-1.5 text-left transition-colors',
                    camera.id === cameraId ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="truncate text-[13px] font-semibold">{camera.name}</span>
                  <span className="truncate text-[11px] text-muted">{[camera.building, camera.zone].filter(Boolean).join(' · ')}</span>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          {!cameraId ? (
            <Card padding="lg">
              <EmptyState icon={History} title="Kamerani tanlang" description="Chapdagi ro‘yxatdan kamerani tanlang, keyin vaqt chizig‘ini bosing" />
            </Card>
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
          ) : loading && !data ? (
            <Skeleton className="aspect-video w-full" />
          ) : data && !data.recording ? (
            <Card padding="lg">
              <EmptyState icon={VideoOff} title="Arxiv yozuvi yoqilmagan" description="Administrator serverda yozuvni yoqishi kerak" />
            </Card>
          ) : data ? (
            <>
              <div className="relative overflow-hidden rounded-card bg-black">
                {chunk ? (
                  <video
                    ref={videoRef}
                    key={chunk.url}
                    src={chunk.url}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-video w-full"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={(event) => setCursor(chunk.start + event.currentTarget.currentTime * 1000)}
                    onEnded={() => void load(chunk.start + CHUNK_SECONDS * 1000)}
                    onError={(event) => {
                      const code = event.currentTarget.error?.code;
                      // H.265 yozuvni brauzer o'qiy olmadi — serverda H.264 ga o'tkazib qayta.
                      if (!chunk.h264 && (code === 3 || code === 4)) {
                        needsH264.current = true;
                        void load(cursor ?? chunk.start);
                      } else {
                        setNotice('Videoni ochib bo‘lmadi');
                      }
                    }}
                  />
                ) : (
                  <div className="grid aspect-video w-full place-items-center text-center text-white/60">
                    <span className="flex flex-col items-center gap-2 text-[13px]">
                      <History size={28} aria-hidden="true" />
                      {data.ranges.length ? 'Vaqt chizig‘ida kerakli lahzani bosing' : 'Bu kunda yozuv yo‘q'}
                    </span>
                  </div>
                )}
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                  <span className="rounded bg-black/60 px-2 py-1 text-[12px] font-semibold text-white">{data.cameraName}</span>
                  {cursor != null && (
                    <span className="rounded bg-black/60 px-2 py-1 text-[12px] font-bold tabular-nums text-white">{clockLabel(cursor)}</span>
                  )}
                </div>
                {notice && (
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-[12px] text-white">{notice}</span>
                )}
              </div>

              <Card padding="md" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <IconButton icon={ChevronFirst} label="Oldingi hodisa" onClick={() => jumpEvent(-1)} disabled={!markers.length || cursor == null} />
                  <IconButton icon={Rewind} label="10 soniya orqaga" onClick={() => cursor != null && seek(cursor - 10_000)} disabled={cursor == null} />
                  <IconButton
                    icon={playing ? Pause : Play}
                    label={playing ? 'To‘xtatish' : 'Ijro'}
                    variant="primary"
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return void load(view.end - CHUNK_SECONDS * 1000);
                      if (video.paused) void video.play();
                      else video.pause();
                    }}
                  />
                  <IconButton icon={FastForward} label="10 soniya oldinga" onClick={() => cursor != null && seek(cursor + 10_000)} disabled={cursor == null} />
                  <IconButton icon={ChevronLast} label="Keyingi hodisa" onClick={() => jumpEvent(1)} disabled={!markers.length || cursor == null} />
                  <span className="ms-1 flex items-center rounded-control bg-surface-2 p-0.5" role="group" aria-label="Tezlik">
                    {SPEEDS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={speed === value}
                        onClick={() => setSpeed(value)}
                        className={cn(
                          'h-7 rounded-[6px] px-2 text-[12px] font-semibold tabular-nums',
                          speed === value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                        )}
                      >
                        {value}×
                      </button>
                    ))}
                  </span>
                  <span className="ms-auto flex items-center gap-2">
                    {selected && (
                      <Link
                        to={`/videodevor?kamera=${encodeURIComponent(selected.id)}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-control bg-surface-2 px-2.5 text-[12px] font-semibold hover:bg-primary-soft"
                      >
                        <MonitorPlay size={14} aria-hidden="true" />
                        Jonli
                      </Link>
                    )}
                    <Button
                      size="sm"
                      icon={Download}
                      disabled={!chunk}
                      onClick={() => chunk && window.location.assign(chunk.downloadUrl)}
                    >
                      10 daqiqani yuklab olish
                    </Button>
                  </span>
                </div>
                <ArchiveTimeline view={view} ranges={data.ranges} events={markers} cursor={cursor} onSeek={seek} onEvent={openMarker} />
              </Card>

              {markers.length > 0 && (
                <Card padding="none" className="overflow-hidden">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-bold">Hodisalar · {markers.length}</h2>
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                    {markers.map((marker) => (
                      <li key={marker.id}>
                        <button
                          type="button"
                          onClick={() => openMarker(marker)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="w-16 shrink-0 text-[12px] font-bold tabular-nums">{clockLabel(Date.parse(marker.at)).slice(0, 5)}</span>
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              marker.severity === 'yuqori' ? 'bg-danger' : marker.severity === "o'rta" ? 'bg-warning' : 'bg-info',
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {marker.moduleName}
                            {marker.personName ? <span className="text-muted"> · {marker.personName}</span> : null}
                          </span>
                          {marker.hasClip && <span className="shrink-0 text-[11px] font-semibold text-primary">klip</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
