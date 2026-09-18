"""TT kriteriya 10 ("Oq xalat kiyilganligi").

Quvur liniyasi: kadr olish -> yuz orqali xodimni aniqlash -> poza orqali
tana hududini topish -> rang tahlili.

2026-09 gacha bu sweep #11 ("Bosh kiyim / kalpakcha") ni ham bajarardi.
O'sha kriteriya buyurtmachi qarori bilan olib tashlandi va aniqlash kodi
(app/services/head_covering_detection.py) butunlay o'chirildi. Uning
o'lchov usuli printsipial cheklovga ega edi: kalpakcha istalgan rangda
bo'lgani uchun aniq rang emas, faqat bosh tepasidagi rang BIR XILLIGI
o'lchanardi — ya'ni juda tekis qisqa soch bilan mato orasidagi farqni
usulning o'zi ajrata olmasdi. Oq xalatning esa aniq rangi bor va o'lchov
shunga mos keladi, shuning uchun u qoldi.

Faqat TANILGAN XODIMLAR (StudentStaff.type == 'xodim') uchun tekshiriladi
— tasodifiy talaba yoki mehmonning oddiy kiyimda ekanligi "qoidabuzarlik"
emas, shuning uchun har bir aniqlangan odamni tekshirish shunchaki shovqin
(false positive) yaratardi. Bu — app/jobs/unauthorized_person_ai.py'ning
yuz moslashtirish quvuridan foydalanadi, faqat xodimlarga cheklangan va
teskari: bu yerda Event — TANILGAN xodim kutilgan kiyim/bosh kiyimsiz
ko'rilganini bildiradi, kimdir kiyib olganini emas.

Haqiqiy aniqlash usuli (klassik HSV rang evristikasi, o'qitilgan model
EMAS) uchun app/services/coat_detection.py docstringiga qarang — u yerda
halol ko'lam va cheklovlar batafsil yozilgan.

Yuz (InsightFace) -> xodim identifikatsiyasi; poza (mediapipe) ->
tana hududi rang namunasi uchun; ikkalasi bir-biriga yuz bbox
markazini eng yaqin pozaning burun landmarkiga solishtirib bog'lanadi
(app/jobs/lesson_quality_ai.py'ning _closest_pose_to_point naqshi bilan
bir xil). Tizimdagi har bir boshqa kriteriya kabi ikki-kadrli
tasdiqlash bilan."""

import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.services.cpu_pool import run_cpu
from app.services.confidence import below_confidence, weakest
from app.database import SessionLocal
from app.jobs.camera_health import is_reachable
from app.jobs.module_status import camera_allows_module, is_module_active
from app.jobs.sweep_guard import SweepGuard
from app.jobs.sweep_concurrency import camera_sweep_slot
from app.models import Camera, Event, StudentStaff
from app.services.coat_detection import torso_bbox, white_fraction
from app.services.event_bus import raise_event
from app.services.face_matching import CandidateMatrix, load_candidate_matrix_for_sweep
from app.services.face_recognition import detect_faces, recognizable_faces
from app.services.frame_grabber import grab_frame_pair_for_camera
from app.services.pose_detection import NOSE, PoseLandmarks, detect_poses

logger = logging.getLogger("app.dress_code_ai")

COAT_MODULE_CODE = 10
COAT_MODULE_NAME = "Oq xalat kiyilganligi"

# See app/jobs/attendance_ai.py's _camera_semaphore docstring.
_sweep_guard = SweepGuard("dress_code_ai")


async def _load_staff_ids(db: AsyncSession) -> set[str]:
    result = await db.execute(select(StudentStaff.id).where(StudentStaff.type == "xodim"))
    return {str(row) for row in result.scalars().all()}


async def _recently_flagged(db: AsyncSession, camera_id) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.coat_dedup_minutes)
    result = await db.execute(
        select(Event.id)
        .where(Event.module_code == COAT_MODULE_CODE)
        .where(Event.camera_id == camera_id)
        .where(Event.occurred_at >= cutoff)
        .limit(1)
    )
    # first(), scalar_one_or_none() emas: oynada ikkita hodisa bo'lsa
    # (parallel kameralar, qo'lda yaratilgan hodisa) u xato otardi.
    return result.scalars().first() is not None


def _decode(frame_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _closest_pose_to_point(poses: list[PoseLandmarks], point: tuple[float, float]) -> PoseLandmarks | None:
    best: PoseLandmarks | None = None
    best_distance = float("inf")
    for pose in poses:
        nose = pose.points[NOSE][:2]
        distance = math.hypot(float(nose[0]) - point[0], float(nose[1]) - point[1])
        if distance < best_distance:
            best_distance = distance
            best = pose
    return best


# Oxirgi _staff_missing_coat() chaqiruvi topgan oq rang ulushi (ishonch
# hisoblash uchun). Funksiya bool qaytarishda davom etadi — testlar va
# ikki-kadrli oqim shunga tayanadi.
_last_white_fraction: float | None = None


def _torso_white_fraction(image, points) -> float | None:
    bbox = torso_bbox(points, image.shape[1], image.shape[0])
    return white_fraction(image, bbox) if bbox is not None else None


async def _staff_missing_coat(
    frame_bytes: bytes, candidates: CandidateMatrix, staff_ids: set[str]
) -> bool:
    """True if ANY recognized staff member in this frame reads as being
    without a white coat. False when no staff member is recognized here —
    nothing to evaluate, which is not the same as a compliance pass."""
    global _last_white_fraction
    _last_white_fraction = None
    if candidates.is_empty or not staff_ids:
        return False

    faces = recognizable_faces(await detect_faces(frame_bytes))
    if not faces:
        return False

    embeddings = np.stack([face.embedding for face in faces])
    matches = candidates.best_matches(embeddings, settings.attendance_ai_match_threshold)
    staff_faces = [
        face for face, match in zip(faces, matches, strict=True) if match is not None and match[0] in staff_ids
    ]
    if not staff_faces:
        return False

    poses = await detect_poses(frame_bytes)
    if not poses:
        return False
    # To'liq dekodlash va HSV — CPU ishi, event loop'dan tashqarida.
    image = await run_cpu(_decode, frame_bytes)
    if image is None:
        return False

    for face in staff_faces:
        x1, y1, x2, y2 = face.bbox
        center = ((float(x1) + float(x2)) / 2 / image.shape[1], (float(y1) + float(y2)) / 2 / image.shape[0])
        pose = _closest_pose_to_point(poses, center)
        if pose is None:
            continue
        fraction = await run_cpu(_torso_white_fraction, image, pose.points)
        if fraction is None:
            # Tanasi kadrda ko'rinmaydi — o'lchab bo'lmaydi, bu qoidabuzarlik emas.
            continue
        if fraction < settings.coat_white_fraction_threshold:
            _last_white_fraction = fraction
            return True

    return False


async def process_camera_frame_pair_for_dress_code(
    frame_a: bytes,
    frame_b: bytes,
    db: AsyncSession,
    camera: Camera,
    candidates: CandidateMatrix | None = None,
    staff_ids: set[str] | None = None,
) -> bool:
    """True if a coat Event was raised."""
    if candidates is None:
        candidates = await load_candidate_matrix_for_sweep(db)
    if staff_ids is None:
        staff_ids = await _load_staff_ids(db)

    # Ikki-kadrli tasdiqlash: avval yangiroq kadr tekshiriladi, eskisi
    # esa faqat u qoidabuzarlik ko'rsatgandagina — ya'ni odatiy holatda
    # kadr boshiga bitta tahlil.
    if not await _staff_missing_coat(frame_b, candidates, staff_ids):
        return False
    fraction_b = _last_white_fraction
    if not await _staff_missing_coat(frame_a, candidates, staff_ids):
        return False
    fraction_a = _last_white_fraction
    if await _recently_flagged(db, camera.id):
        return False

    await raise_event(
        db,
        camera=camera,
        module_code=COAT_MODULE_CODE,
        module_name=COAT_MODULE_NAME,
        group="C",
        # Tanada oq rang qanchalik kam: chegarada 40, umuman oq yo'q bo'lsa 85.
        confidence=weakest(
            *(
                below_confidence(f, settings.coat_white_fraction_threshold, floor=40, ceiling=85)
                for f in (fraction_a, fraction_b)
                if f is not None
            ),
            default=40,
        ),
        severity="past",  # xavfsizlik-kritik emas, intizom/qoida masalasi
        details={
            "reason": "Tanilgan xodimning tanasida oq xalat rangi kam — ikki kadrda ham",
            "metrics": {
                "white_a": round(fraction_a, 3) if fraction_a is not None else None,
                "white_b": round(fraction_b, 3) if fraction_b is not None else None,
                "threshold": settings.coat_white_fraction_threshold,
            },
        },
        frame_bytes=frame_b,
    )
    return True


async def run_dress_code_ai_sweep_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    """See app/jobs/attendance_ai.py's run_attendance_ai_sweep_once, which
    this mirrors. Returns how many Events were raised."""
    async with session_factory() as db:
        if not await is_module_active(db, COAT_MODULE_CODE):
            return 0
        result = await db.execute(
            select(Camera)
            .where(Camera.status == "faol")
            .where(camera_allows_module(COAT_MODULE_CODE))
        )
        cameras = [c for c in result.scalars().all() if c.stream_url and is_reachable(c.last_seen_at)]
        candidates = await load_candidate_matrix_for_sweep(db)
        staff_ids = await _load_staff_ids(db)

    if not cameras or not staff_ids:
        return 0

    async def _process_one(camera: Camera) -> bool:
        # Kalit kadrni kutish slotdan tashqarida — slot faqat tahlil uchun
        # (app/jobs/unified_face_sweep.py _process_camera izohiga qarang).
        frames = await grab_frame_pair_for_camera(camera)
        if frames is None:
            return False
        async with camera_sweep_slot():
            frame_a, frame_b = frames
            async with session_factory() as camera_db:
                return await process_camera_frame_pair_for_dress_code(
                    frame_a, frame_b, camera_db, camera, candidates, staff_ids
                )

    results = await asyncio.gather(*(_process_one(camera) for camera in cameras), return_exceptions=True)

    total = 0
    for camera, result in zip(cameras, results, strict=True):
        if isinstance(result, BaseException):
            logger.exception("dress code camera task failed", extra={"camera_id": str(camera.id)}, exc_info=result)
            continue
        total += int(result)
    return total


async def dress_code_ai_loop() -> None:
    while True:
        try:
            count = await _sweep_guard.run(run_dress_code_ai_sweep_once)
            if count:
                logger.info("dress code AI sweep raised events", extra={"events": count})
        except Exception:
            logger.exception("dress code AI sweep failed")
        await asyncio.sleep(settings.dress_code_ai_interval_seconds)
