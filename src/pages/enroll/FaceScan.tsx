/* Kamera orqali yuzni 3 tomondan olish (old, chap, o'ng) — tiriklik tekshiruvi bilan.
 * Mantiq eski versiyadagidek: server har kadrda yuz qayerga qaraganini tekshiradi,
 * 3 marta ketma-ket mos kelsa, AYNAN shu kadr saqlanadi. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, VideoOff } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { type LivenessStep, LIVENESS_STEPS, checkPose } from '../../lib/enrollment';
import { Alert, Button, cn } from '../../kit';

const STEP_TEXT: Record<LivenessStep, string> = {
  front: 'To‘g‘riga qarang',
  left: 'Boshingizni chapga buring',
  right: 'Boshingizni o‘ngga buring',
};

const PROBE_WIDTH = 480;
const PROBE_INTERVAL_MS = 700;
const MAX_FRAME_WIDTH = 1280;
const FRAME_QUALITY = 0.85;
const STABLE_HITS = 3;

const BUSY_CAMERA = 'Kamerani boshqa dastur band qilgan. Zoom, Telegram yoki kamera ochiq boshqa oynani yoping va qayta urinib ko‘ring.';
const NO_PERMISSION = 'Kameraga ruxsat berilmadi. Manzil satridagi qulf belgisini bosib, kameraga ruxsat bering va «Qayta urinish»ni bosing.';
const NO_CAMERA = 'Bu qurilmada kamera topilmadi. Kamerasi bor telefondan oching.';

const CAMERA_ERRORS: Record<string, string> = {
  NotAllowedError: NO_PERMISSION,
  PermissionDeniedError: NO_PERMISSION,
  NotFoundError: NO_CAMERA,
  DevicesNotFoundError: NO_CAMERA,
  NotReadableError: BUSY_CAMERA,
  TrackStartError: BUSY_CAMERA,
  OverconstrainedError: 'Kamera kerakli sifatni bera olmadi. Boshqa qurilmadan urinib ko‘ring.',
  SecurityError: 'Brauzer bu sahifada kameraga ruxsat bermayapti.',
  AbortError: 'Kamera kutilmaganda uzildi. Qayta urinib ko‘ring.',
};

export default function FaceScan({
  onSubmit,
  submitting = false,
  externalError = null,
}: {
  onSubmit: (frames: Blob[]) => void;
  submitting?: boolean;
  externalError?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<Blob[]>([]);
  const hitsRef = useRef(0);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const urlsRef = useRef<string[]>([]);

  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [hint, setHint] = useState('');
  const [matching, setMatching] = useState(false);
  const [captured, setCaptured] = useState<string[]>([]);

  const step = LIVENESS_STEPS[stepIndex];
  const finished = stepIndex >= LIVENESS_STEPS.length;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Kamerani ochish
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setCameraError(null);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          window.isSecureContext
            ? 'Bu brauzer kamerani qo‘llab-quvvatlamaydi. Boshqa brauzerda oching.'
            : 'Sahifa xavfsiz ulanishda (https) ochilmagan — kamera ishlamaydi.',
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (!cancelled && !doneRef.current) {
              setReady(false);
              setCameraError('Kamera uzildi. Qayta urinib ko‘ring.');
            }
          };
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setCameraError(CAMERA_ERRORS[name] ?? 'Kamerani ochib bo‘lmadi. Qayta urinib ko‘ring.');
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [attempt, stopStream]);

  // Uchala kadr olingach kamera darhol o'chadi.
  useEffect(() => {
    if (finished) stopStream();
  }, [finished, stopStream]);

  /** Bitta video kadrdan ikki nusxa: tekshirish uchun kichik, saqlash uchun to'liq. */
  const grabPair = useCallback(async (): Promise<{ probe: Blob; full: Blob } | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
    const full = document.createElement('canvas');
    full.width = Math.round(video.videoWidth * scale);
    full.height = Math.round(video.videoHeight * scale);
    full.getContext('2d')?.drawImage(video, 0, 0, full.width, full.height);
    const small = document.createElement('canvas');
    const s2 = Math.min(1, PROBE_WIDTH / full.width);
    small.width = Math.round(full.width * s2);
    small.height = Math.round(full.height * s2);
    small.getContext('2d')?.drawImage(full, 0, 0, small.width, small.height);
    const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', q));
    const [probe, fullBlob] = await Promise.all([toBlob(small, 0.65), toBlob(full, FRAME_QUALITY)]);
    return probe && fullBlob ? { probe, full: fullBlob } : null;
  }, []);

  // Jonli yo'naltirish
  useEffect(() => {
    if (!ready || finished || cameraError || submitting) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped || busyRef.current || doneRef.current) return;
      busyRef.current = true;
      try {
        const pair = await grabPair();
        if (!pair || stopped) return;
        const result = await checkPose(step, pair.probe);
        if (stopped) return;
        setHint(result.hint);
        setMatching(result.ok);
        if (!result.ok) {
          hitsRef.current = 0;
          return;
        }
        hitsRef.current += 1;
        if (hitsRef.current < STABLE_HITS) return;
        hitsRef.current = 0;
        framesRef.current = [...framesRef.current, pair.full];
        const url = URL.createObjectURL(pair.full);
        urlsRef.current = [...urlsRef.current, url];
        setCaptured((prev) => [...prev, url]);
        setMatching(false);
        setHint('');
        setStepIndex((i) => i + 1);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setHint('Hozir ko‘p odam ro‘yxatdan o‘tmoqda. Bir necha soniya kuting — jarayon o‘zi davom etadi.');
        }
      } finally {
        busyRef.current = false;
      }
    }, PROBE_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [ready, finished, cameraError, submitting, step, grabPair]);

  // Uch kadr yig'ilgach yuborish
  useEffect(() => {
    if (!finished || doneRef.current || submitting) return;
    doneRef.current = true;
    onSubmit(framesRef.current);
  }, [finished, submitting, onSubmit]);

  const reset = useCallback(() => {
    doneRef.current = false;
    hitsRef.current = 0;
    framesRef.current = [];
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
    setCaptured([]);
    setStepIndex(0);
    setMatching(false);
    setHint('');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (externalError) reset();
  }, [externalError, reset]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    },
    [],
  );

  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad-tint text-bad">
          <VideoOff size={28} aria-hidden />
        </span>
        <p className="text-[17px] font-semibold text-ink">Kamera ochilmadi</p>
        <p className="text-[15px] leading-relaxed text-soft">{cameraError}</p>
        <Button variant="primary" size="lg" icon={RotateCcw} block onClick={() => setAttempt((n) => n + 1)}>
          Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Bosqichlar: 3 ta nuqta */}
      <div className="flex items-center gap-2" aria-hidden>
        {LIVENESS_STEPS.map((s, i) => (
          <span key={s} className={cn('h-2 rounded-full transition-all', i < captured.length ? 'w-8 bg-ok' : i === stepIndex ? 'w-8 bg-brand/40' : 'w-2 bg-ink/10')} />
        ))}
      </div>

      <div className="relative mt-5 aspect-square w-full max-w-[300px]">
        <div
          className={cn(
            'absolute inset-0 overflow-hidden rounded-full border-[5px] bg-ink/5 transition-colors duration-200',
            matching || finished ? 'border-ok' : 'border-white shadow-lift',
          )}
        >
          <video ref={videoRef} playsInline muted autoPlay aria-label="Kameradan jonli tasvir" className="h-full w-full scale-x-[-1] object-cover" />
          {!ready && !finished && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/50 text-white">
              <Loader2 size={30} className="animate-spin" aria-hidden />
            </div>
          )}
          {finished && (
            <div className="absolute inset-0 flex items-center justify-center bg-ok/85 text-white">
              {submitting ? <Loader2 size={40} className="animate-spin" aria-hidden /> : <Check size={56} aria-hidden />}
            </div>
          )}
        </div>
        {!finished && step === 'left' && (
          <ArrowLeft size={36} className="absolute -left-3 top-1/2 -translate-y-1/2 animate-pulse text-brand" aria-hidden />
        )}
        {!finished && step === 'right' && (
          <ArrowRight size={36} className="absolute -right-3 top-1/2 -translate-y-1/2 animate-pulse text-brand" aria-hidden />
        )}
      </div>

      <div className="mt-6 min-h-[64px] text-center" role="status" aria-live="polite" aria-atomic="true">
        {finished ? (
          <p className="text-[18px] font-semibold text-ink">{submitting ? 'Saqlanmoqda...' : 'Tayyor'}</p>
        ) : (
          <>
            <p className="text-[20px] font-semibold text-ink">{STEP_TEXT[step]}</p>
            <p className={cn('mt-1 text-[15px]', matching ? 'font-medium text-ok' : 'text-soft')}>
              {!ready ? 'Kamera ishga tushmoqda...' : hint || 'Yuzingiz doira ichida to‘liq ko‘rinsin'}
            </p>
          </>
        )}
      </div>

      {externalError && (
        <Alert tone="warn" className="mt-4 w-full">
          {externalError} Qaytadan boshlandi.
        </Alert>
      )}

      {!finished && (
        <p className="mt-4 text-center text-[13px] text-faint">Yorug‘ joyda turing, ko‘zoynak va niqobni yeching.</p>
      )}

      {captured.length > 0 && !submitting && !finished && (
        <button type="button" onClick={reset} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-soft hover:text-ink">
          <RotateCcw size={15} aria-hidden /> Boshidan boshlash
        </button>
      )}
    </div>
  );
}
