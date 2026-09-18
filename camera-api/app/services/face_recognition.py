"""Real biometric face comparison via InsightFace (ArcFace embeddings) —
replaces the frontend's average-hash (aHash) placeholder in
camera/src/lib/imageSimilarity.ts, which explicitly documented itself as
"not true face recognition, but a real, deterministic comparison of pixel
data". This is the real thing: a RetinaFace-family detector finds faces,
a ResNet-50 recognition model (trained with ArcFace loss) embeds each
into a 512-d vector, and cosine similarity between embeddings is the
match score — the same category of model real biometric systems use.
"""

import asyncio
import logging
from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from insightface.app.common import Face
from insightface.utils import face_align

from app.config import settings
from app.services.inference_gate import PRIORITY_BACKGROUND, PRIORITY_LIVE, face_inference_gate

logger = logging.getLogger("app.face_recognition")

_app: FaceAnalysis | None = None
# Tizim o'qiydigan InsightFace modellari — _get_app() izohiga qarang.
REQUIRED_FACE_MODELS = ["detection", "recognition", "landmark_3d_68"]

# Cosine similarity threshold for buffalo_l embeddings. This is a
# reasonable starting point, not a validated production number — real
# deployments should tune this against their own enrollment photos and
# accept a false-accept/false-reject tradeoff explicitly (see TT bo'lim on
# biometrics if it specifies a target FAR/FRR).
MATCH_THRESHOLD = 0.45

# How similar every enrollment frame's embedding must be to the first
# ("frontal") frame — guards the multi-angle enrollment flow
# (extract_enrollment_embedding) against a bad capture session (camera
# handed to someone else mid-scan, wrong face detected in one frame,
# etc.). Deliberately looser than MATCH_THRESHOLD: these are the SAME
# person's own frames from one session, just at different head angles,
# which reduces ArcFace similarity more than two straight-on photos of
# the same person would — but two genuinely different people's embeddings
# still land far below this.
ENROLLMENT_CONSISTENCY_THRESHOLD = 0.35


class NoFaceDetectedError(Exception):
    pass


class InconsistentFacesError(Exception):
    """Raised by extract_enrollment_embedding when the captured frames
    don't look like the same person — see ENROLLMENT_CONSISTENCY_THRESHOLD."""

    pass


# InsightFace/ONNX inference is CPU/GPU-bound. Found from real testing
# (not hypothetical): with the live-detection overlay endpoint polling
# every few seconds AND the background attendance/sleep sweep loops each
# doing their own inference every ~30s, several calls landing around the
# same moment made every one of them slower — which cascaded into sweeps
# that should complete in seconds instead stretching to minutes apart,
# since each sweep's grab-then-infer step was queued behind the others'
# work. Capping how many inference calls run at once keeps each one's
# latency bounded, regardless of how many callers show up together.
#
# The cap itself is configurable (settings.face_recognition_inference_
# concurrency) because the right number depends entirely on the hardware
# actually running this: 2 is sane for a CPU-only dev machine, but a
# production GPU server should raise this a lot — GPUs get their
# throughput specifically from many concurrent/batched operations, so a
# CPU-tuned cap of 2 would leave most of a real GPU deployment's capacity
# unused. Read once at import time (like the rest of this module's
# settings-derived state) — changing it requires a restart, same as
# MATCH_THRESHOLD.
# Slot allocation is via app/services/inference_gate.py — live-detection
# and enrollment jump ahead of background AI sweeps.


def _limit_session_threads(app: FaceAnalysis, providers: list[str]) -> None:
    """Har bir InsightFace modelining ONNX sessiyasini cheklangan oqimlar bilan
    qayta yaratadi (settings.face_recognition_intra_op_threads).

    Nega bu yerda, FaceAnalysis(...) argumenti orqali emas: insightface 1.0.1
    modellarga faqat providers/provider_options uzatadi, sess_options esa
    yo'lda tushib qoladi (insightface/model_zoo/model_zoo.py, get_model).
    Har bir model sessiyani `session`, faylni `model_file` da saqlaydi va
    kirish/chiqish nomlarini fayldan oladi — o'sha fayldan qayta yaratilgan
    sessiya bir xil ishlaydi."""
    threads = settings.face_recognition_intra_op_threads
    if threads <= 0:
        return
    import onnxruntime

    for model in app.models.values():
        model_file = getattr(model, "model_file", None)
        if not model_file:
            continue
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
        model.session = onnxruntime.InferenceSession(model_file, sess_options=options, providers=providers)
    logger.info(
        "InsightFace ONNX sessions limited",
        extra={
            "intra_op_threads": threads,
            "inference_concurrency": settings.face_recognition_inference_concurrency,
            "models": sorted(app.models),
        },
    )


def _get_app() -> FaceAnalysis:
    global _app
    if _app is None:
        # CUDAExecutionProvider first when GPU is enabled: onnxruntime
        # tries providers in list order and falls back to the next one it
        # actually has support for, so requesting CUDA first is safe even
        # if the CPU-only `onnxruntime` package (not `onnxruntime-gpu`) is
        # what's installed — it just silently falls through to CPU. This
        # config flag exists so the production GPU server (onnxruntime-gpu
        # installed) gets real GPU inference without a code change, while
        # dev machines stay CPU-only by default.
        providers = ["CPUExecutionProvider"]
        if settings.face_recognition_gpu_enabled:
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        logger.info(
            "loading InsightFace buffalo_l model (first use)",
            extra={"gpu_enabled": settings.face_recognition_gpu_enabled},
        )
        # Faqat tizim haqiqatan o'qiydigan modellar. buffalo_l standart
        # bo'yicha 5 ta modelni HAR BIR YUZ uchun ishga tushiradi; kod esa
        # faqat normed_embedding (recognition), bbox (detection) va
        # landmark_3d_68 (uyqu, frontallik, liveness) ni ishlatadi.
        # genderage va landmark_2d_106 hech qayerda o'qilmaydi — productionda
        # kirish kamerasida kadrga ~21 yuz tushadi, ya'ni kadr boshiga ~42
        # ta befoyda model chaqiruvi CPU chegarasida turgan konteynerda.
        _app = FaceAnalysis(name="buffalo_l", providers=providers, allowed_modules=REQUIRED_FACE_MODELS)
        _limit_session_threads(_app, providers)
        # ctx_id=0 selects GPU device 0 when CUDAExecutionProvider is
        # active, and is harmless/ignored when it isn't (the CPU-only path
        # this codebase already ran and tested with before GPU support
        # existed also used ctx_id=0).
        _app.prepare(ctx_id=0, det_size=(640, 640))
    return _app


@dataclass
class FaceCompareResult:
    matched: bool
    confidence: float  # 0-100, rescaled cosine similarity — for display only
    similarity: float  # raw cosine similarity — what MATCH_THRESHOLD is actually compared against
    faces_detected_a: int
    faces_detected_b: int


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """JPEG baytlarini rasmga aylantiradi yoki NoFaceDetectedError tashlaydi.

    Nima uchun alohida funksiya: cv2.imdecode buzuq bufer uchun None
    qaytaradi, lekin BO'SH bufer uchun cv2.error TASHLAYDI. Ikkala holat
    ham "kadrni o'qib bo'lmadi" degani, lekin ikkinchisi tutilmasa
    ishlov beruvchini butunlay yiqitadi.

    Bu ochiq sahifadagi jonli yo'naltirishda aniqlandi: brauzer video
    hali tayyor bo'lmaganda nol baytli kadr yuborishi mumkin, va u har
    safar 500 xatosini berardi. Kamera oqimida ham xuddi shu bo'lishi
    mumkin — ffmpeg uzilish paytida bo'sh kadr qaytaradi.
    """
    if not image_bytes:
        raise NoFaceDetectedError("Rasm bo'sh")
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    try:
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except cv2.error as exc:
        raise NoFaceDetectedError("Rasm formatini o'qib bo'lmadi") from exc
    if img is None:
        raise NoFaceDetectedError("Rasm formatini o'qib bo'lmadi")
    return img


def _embed(image_bytes: bytes) -> tuple[np.ndarray | None, int]:
    img = _decode_image(image_bytes)
    faces = _get_app().get(img)
    if not faces:
        return None, 0

    # Largest face by bounding-box area is treated as the photo's subject —
    # relevant for passport scans that might catch a second face in the background.
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return best.normed_embedding, len(faces)


def _compare_sync(image_a: bytes, image_b: bytes) -> FaceCompareResult:
    emb_a, count_a = _embed(image_a)
    emb_b, count_b = _embed(image_b)
    if emb_a is None or emb_b is None:
        raise NoFaceDetectedError(f"Yuz aniqlanmadi (1-rasmda {count_a} ta, 2-rasmda {count_b} ta yuz topildi)")

    similarity = float(np.dot(emb_a, emb_b))  # both are L2-normalized -> dot product IS cosine similarity
    confidence = max(0.0, min(100.0, (similarity + 1) / 2 * 100))
    return FaceCompareResult(
        matched=similarity >= MATCH_THRESHOLD,
        confidence=round(confidence, 1),
        similarity=round(similarity, 4),
        faces_detected_a=count_a,
        faces_detected_b=count_b,
    )


async def compare_faces(image_a: bytes, image_b: bytes) -> FaceCompareResult:
    """Runs on a worker thread — InsightFace/ONNX inference is CPU-bound
    and synchronous; running it directly on the event loop would stall
    every other request for the ~100-300ms a comparison takes. Gated by
    face_inference_gate — see inference_gate.py."""
    async with face_inference_gate.slot(priority=PRIORITY_LIVE):
        return await asyncio.to_thread(_compare_sync, image_a, image_b)


def _extract_embedding_sync(image_bytes: bytes) -> list[float]:
    emb, count = _embed(image_bytes)
    if emb is None:
        raise NoFaceDetectedError(f"Yuz aniqlanmadi ({count} ta yuz topildi)")
    return emb.tolist()


async def extract_embedding(image_bytes: bytes) -> list[float]:
    """Used at enrollment time (app/routers/students_staff.py) to persist
    the enrollment photo's embedding — separate from compare_faces() since
    enrollment only ever has one photo to embed, not two to compare. Gated
    by face_inference_gate with live priority."""
    async with face_inference_gate.slot(priority=PRIORITY_LIVE):
        return await asyncio.to_thread(_extract_embedding_sync, image_bytes)


def _extract_enrollment_embedding_sync(frames: list[bytes]) -> list[float]:
    embeddings: list[np.ndarray] = []
    for i, frame in enumerate(frames):
        emb, count = _embed(frame)
        if emb is None:
            raise NoFaceDetectedError(f"{i + 1}-kadrda yuz aniqlanmadi ({count} ta yuz topildi)")
        embeddings.append(emb)

    reference = embeddings[0]
    for i, emb in enumerate(embeddings[1:], start=2):
        similarity = float(np.dot(reference, emb))  # both L2-normalized -> dot product is cosine similarity
        if similarity < ENROLLMENT_CONSISTENCY_THRESHOLD:
            raise InconsistentFacesError(
                f"{i}-kadr birinchi kadrdagi yuzga mos kelmadi — bir xil odam ekanligiga ishonch hosil qiling"
            )

    # Average the per-angle embeddings into one "prototype" vector — a
    # standard technique for multi-shot enrollment: it's more robust to any
    # single frame's noise (motion blur, a harsh shadow at one angle) than
    # picking just one frame, without needing to store N separate vectors
    # per person. Re-normalized since the mean of unit vectors isn't itself
    # unit length, and every consumer (face_matching.py) assumes normalized
    # embeddings for its dot-product-as-cosine-similarity shortcut.
    mean = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(mean)
    prototype = mean / norm if norm > 0 else mean
    return prototype.tolist()


async def extract_enrollment_embedding(frames: list[bytes]) -> list[float]:
    """Multi-angle enrollment (app/routers/enrollment.py's public
    self-service flow): takes several frames of one capture session (e.g.
    straight-on, turned left, turned right) and returns one averaged
    embedding — see _extract_enrollment_embedding_sync for why averaging
    beats picking a single frame, and why the frames are cross-checked for
    consistency first. Gated by face_inference_gate with live priority,
    same as extract_embedding()."""
    async with face_inference_gate.slot(priority=PRIORITY_LIVE):
        return await asyncio.to_thread(_extract_enrollment_embedding_sync, frames)


@dataclass
class DetectedFace:
    # Ikkalasi ham None — yuz tahlil qilinmagan: juda kichik (min_face_px dan
    # past) yoki chaqiruvchi faqat aniqlashni so'ragan (analyse=False).
    # Tanish uchun recognizable_faces() dan o'tkaziladi.
    embedding: np.ndarray | None
    landmarks_68: np.ndarray | None  # (68, 3) — the standard iBUG scheme; see app/services/sleep_detection.py
    bbox: np.ndarray  # (4,) — [x1, y1, x2, y2] in the source image's pixel coordinates


def recognizable_faces(faces: list) -> list:
    """Embedding'i bor yuzlar — faqat ularni ro'yxat bilan solishtirish mumkin."""
    return [face for face in faces if getattr(face, "embedding", None) is not None]


def _detect_faces_sync(image_bytes: bytes, min_face_px: int = 0, analyse: bool = True) -> list[DetectedFace]:
    """Every face in the frame (not just the largest) with its bounding box,
    and — for faces worth it — its embedding and 68-point landmarks.

    NEGA FaceAnalysis.get() EMAS. U HAR bir topilgan yuz uchun ArcFace R50
    embedding va 3D landmark hisoblaydi — 8 pikselli yuz uchun ham.
    Productionda (2026-09-18) 96 ta xona kamerasining 60 tasida yuzlar
    o'rtacha 8-20 px edi: tanib bo'lmaydi (chegara 40 px), lekin har biri
    to'liq R50 chaqiruvini olardi — AVX'siz CPU'da AI vaqtining asosiy
    qismi shunga ketardi. Endi get() ning o'zi takrorlanadi, faqat:

      * `min_face_px` dan kichik yuz — faqat bbox (tashxis uchun sanaladi);
      * `analyse=False` — hech bir yuz tahlil qilinmaydi (masalan niqob
        tekshiruvi faqat yuz o'rnini so'raydi);
      * embeddinglar bitta ONNX chaqiruvida (batch) hisoblanadi.

    Katta yuzlar uchun natija get() bilan aynan bir xil: o'sha hizalash
    (face_align.norm_crop), o'sha model va normallash."""
    img = _decode_image(image_bytes)
    app = _get_app()
    bboxes, kpss = app.det_model.detect(img, max_num=0, metric="default")
    faces: list[DetectedFace] = []
    to_analyse: list[tuple[DetectedFace, Face]] = []
    for i in range(bboxes.shape[0]):
        bbox = bboxes[i, 0:4]
        face = DetectedFace(embedding=None, landmarks_68=None, bbox=bbox)
        faces.append(face)
        kps = kpss[i] if kpss is not None else None
        if analyse and kps is not None and (bbox[3] - bbox[1]) >= min_face_px:
            to_analyse.append((face, Face(bbox=bbox, kps=kps, det_score=bboxes[i, 4])))
    if not to_analyse:
        return faces

    recognition = app.models.get("recognition")
    if recognition is not None:
        size = recognition.input_size[0]
        crops = [face_align.norm_crop(img, landmark=raw.kps, image_size=size) for _, raw in to_analyse]
        for (face, _), feat in zip(to_analyse, recognition.get_feat(crops), strict=True):
            norm = np.linalg.norm(feat)
            face.embedding = feat / norm if norm > 0 else feat
    landmarks = app.models.get("landmark_3d_68")
    if landmarks is not None:
        for face, raw in to_analyse:
            landmarks.get(img, raw)
            face.landmarks_68 = raw.landmark_3d_68
    return faces


def _min_face_px(min_face_px: int | None) -> int:
    return settings.face_analysis_min_px if min_face_px is None else max(0, min_face_px)


async def detect_faces(
    image_bytes: bytes,
    *,
    priority: int = PRIORITY_BACKGROUND,
    min_face_px: int | None = None,
    analyse: bool = True,
) -> list[DetectedFace]:
    """Gated by face_inference_gate — pass PRIORITY_LIVE for live-detection.

    `min_face_px` — shundan kichik yuz tahlil qilinmaydi (None:
    settings.face_analysis_min_px). Ro'yxatga olish kabi yuzning har
    burchagi kerak bo'lgan joylar 0 beradi. `analyse=False` — faqat bbox."""
    async with face_inference_gate.slot(priority=priority):
        return await asyncio.to_thread(_detect_faces_sync, image_bytes, _min_face_px(min_face_px), analyse)


def _detect_faces_batch_sync(images: list[bytes], min_face_px: int = 0) -> list[list[DetectedFace]]:
    """Process multiple frames under one inference gate acquisition."""
    return [_detect_faces_sync(img, min_face_px) for img in images]


async def detect_faces_batch(
    image_bytes_list: list[bytes], *, priority: int = PRIORITY_BACKGROUND, min_face_px: int | None = None
) -> list[list[DetectedFace]]:
    """Batch face detection — chunks by face_recognition_batch_size."""
    if not image_bytes_list:
        return []
    batch_size = max(1, settings.face_recognition_batch_size)
    threshold = _min_face_px(min_face_px)
    all_results: list[list[DetectedFace]] = []
    async with face_inference_gate.slot(priority=priority):
        for i in range(0, len(image_bytes_list), batch_size):
            chunk = image_bytes_list[i : i + batch_size]
            chunk_results = await asyncio.to_thread(_detect_faces_batch_sync, chunk, threshold)
            all_results.extend(chunk_results)
    return all_results
