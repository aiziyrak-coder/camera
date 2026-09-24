"""TT kriteriya 13 — SIZ (niqob) yo'qligi sanitariya zonalarida."""

from contextvars import ContextVar
import asyncio
import logging
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.services.cpu_pool import run_cpu
from app.services.confidence import below_confidence, weakest
from app.services.ppe_detection import mask_fraction, uses_heuristic
from app.database import SessionLocal
from app.jobs.camera_health import is_reachable
from app.jobs.module_status import camera_allows_module, is_module_active
from app.jobs.sweep_guard import SweepGuard
from app.jobs.sweep_concurrency import camera_sweep_slot
from app.models import Camera, Event
from app.services.event_bus import raise_event
from app.services.face_recognition import detect_faces
from app.services.frame_grabber import grab_frame_pair_for_camera
from app.services.ppe_detection import detect_ppe

logger = logging.getLogger("app.ppe_ai")

PPE_MODULE_CODE = 13
PPE_MODULE_NAME = "Qo'lqop/niqob (kerakli xonalarda)"

_sweep_guard = SweepGuard("ppe_ai")


async def _recently_flagged(db: AsyncSession, camera_id) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.ppe_dedup_minutes)
    result = await db.execute(
        select(Event.id)
        .where(Event.module_code == PPE_MODULE_CODE)
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


async def _frame_missing_ppe(frame_bytes: bytes) -> bool:
    # Faqat yuz o'rni kerak — embedding va landmark hisoblanmaydi.
    faces = await detect_faces(frame_bytes, analyse=False)
    if not faces:
        return False
    # Yuz topilgandagina, va event loop'dan tashqarida dekodlanadi.
    image = await run_cpu(_decode, frame_bytes)
    if image is None:
        return False
    fractions: list[float] = []
    for face in faces:
        x1, y1, x2, y2 = face.bbox
        bbox = (float(x1), float(y1), float(x2), float(y2))
        if await detect_ppe(image, bbox):
            return False
        if uses_heuristic():
            fraction = mask_fraction(image, bbox)
            if fraction is not None:
                fractions.append(fraction)
    _last_mask_fraction.set(max(fractions) if fractions else None)
    return True


# Oxirgi _frame_missing_ppe() dagi eng katta "niqobga o'xshash" ulush —
# ishonch uchun (YOLO modeli bo'lsa None: model "yo'q" deydi, ulush bermaydi).
# ContextVar: asyncio.gather qilgan har kamera vazifasi o'z nusxasini ko'radi
# (oddiy global boshqa kameraning qiymati bilan almashib qolardi).
_last_mask_fraction: ContextVar[float | None] = ContextVar("_last_mask_fraction", default=None)


async def process_camera_frame_pair_for_ppe(
    frame_a: bytes, frame_b: bytes, db: AsyncSession, camera: Camera
) -> bool:
    if not await _frame_missing_ppe(frame_b):
        return False
    fraction_b = _last_mask_fraction.get()
    if not await _frame_missing_ppe(frame_a):
        return False
    fraction_a = _last_mask_fraction.get()
    if await _recently_flagged(db, camera.id):
        return False

    await raise_event(
        db,
        camera=camera,
        module_code=PPE_MODULE_CODE,
        module_name=PPE_MODULE_NAME,
        group="C",
        confidence=weakest(
            *(
                below_confidence(f, settings.ppe_mask_fraction_threshold, floor=40, ceiling=85)
                for f in (fraction_a, fraction_b)
                if f is not None
            ),
            default=40,
        ),
        severity="o'rta",
        details={
            "reason": "Yuz atrofida niqob topilmadi — ikki kadrda ham",
            "metrics": {
                "mask_a": round(fraction_a, 3) if fraction_a is not None else None,
                "mask_b": round(fraction_b, 3) if fraction_b is not None else None,
                "threshold": settings.ppe_mask_fraction_threshold,
            },
        },
        frame_bytes=frame_b,
    )
    return True


async def run_ppe_ai_sweep_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    async with session_factory() as db:
        if not await is_module_active(db, PPE_MODULE_CODE):
            return 0
        result = await db.execute(
            select(Camera).where(Camera.status == "faol").where(camera_allows_module(PPE_MODULE_CODE))
        )
        cameras = [c for c in result.scalars().all() if c.stream_url and is_reachable(c.last_seen_at)]

    async def _process_one(camera: Camera) -> bool:
        # Kalit kadrni kutish slotdan tashqarida — slot faqat tahlil uchun
        # (app/jobs/unified_face_sweep.py _process_camera izohiga qarang).
        frames = await grab_frame_pair_for_camera(camera)
        if frames is None:
            return False
        async with camera_sweep_slot():
            async with session_factory() as camera_db:
                return await process_camera_frame_pair_for_ppe(frames[0], frames[1], camera_db, camera)

    results = await asyncio.gather(*(_process_one(c) for c in cameras), return_exceptions=True)
    total = 0
    for camera, result in zip(cameras, results, strict=True):
        if isinstance(result, BaseException):
            logger.exception("ppe AI failed", extra={"camera_id": str(camera.id)}, exc_info=result)
            continue
        if result:
            total += 1
    return total


async def ppe_ai_loop() -> None:
    while True:
        try:
            count = await _sweep_guard.run(run_ppe_ai_sweep_once)
            if count:
                logger.info("ppe AI raised events", extra={"events": count})
        except Exception:
            logger.exception("ppe AI sweep failed")
        await asyncio.sleep(settings.ppe_ai_interval_seconds)
