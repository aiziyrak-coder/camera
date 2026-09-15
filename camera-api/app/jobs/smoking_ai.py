"""TT kriteriya 15 — qo'l og'izga yaqin postura (chekish taxminiy signal)."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.services.confidence import below_confidence, weakest
from app.database import SessionLocal
from app.jobs.camera_health import is_reachable
from app.jobs.module_status import camera_allows_module, is_module_active
from app.jobs.sweep_guard import SweepGuard
from app.jobs.sweep_concurrency import camera_sweep_slot
from app.models import Camera, Event
from app.services.event_bus import raise_event
from app.services.frame_grabber import grab_frame_pair_for_camera
from app.services.pose_detection import detect_poses
from app.services.smoking_detection import closest_smoking_distance, is_smoking_posture

logger = logging.getLogger("app.smoking_ai")

SMOKING_MODULE_CODE = 15
SMOKING_MODULE_NAME = "Chekish / elektron sigareta"

_sweep_guard = SweepGuard("smoking_ai")


async def _recently_flagged(db: AsyncSession, camera_id) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.smoking_dedup_minutes)
    result = await db.execute(
        select(Event.id)
        .where(Event.module_code == SMOKING_MODULE_CODE)
        .where(Event.camera_id == camera_id)
        .where(Event.occurred_at >= cutoff)
    )
    return result.scalar_one_or_none() is not None


async def _frame_smoking_distance(frame_bytes: bytes) -> float | None:
    poses = await detect_poses(frame_bytes)
    return closest_smoking_distance(poses)


async def _frame_smoking_posture(frame_bytes: bytes) -> bool:
    return await _frame_smoking_distance(frame_bytes) is not None


async def process_camera_frame_pair_for_smoking(
    frame_a: bytes, frame_b: bytes, db: AsyncSession, camera: Camera
) -> bool:
    distance_b = await _frame_smoking_distance(frame_b)
    if distance_b is None:
        return False
    distance_a = await _frame_smoking_distance(frame_a)
    if distance_a is None:
        return False
    if await _recently_flagged(db, camera.id):
        return False

    await raise_event(
        db,
        camera=camera,
        module_code=SMOKING_MODULE_CODE,
        module_name=SMOKING_MODULE_NAME,
        group="D",
        # Bilak og'izga qanchalik yaqin (chegarada 35, tegib turganda 80);
        # ikki kadrdan zaifrog'i.
        confidence=weakest(
            below_confidence(distance_a, settings.smoking_wrist_mouth_distance, floor=35, ceiling=80),
            below_confidence(distance_b, settings.smoking_wrist_mouth_distance, floor=35, ceiling=80),
            default=35,
        ),
        severity="o'rta",
        details={
            "reason": (
                f"Qo'l og'izga yaqin — ikki kadrda ham (masofa {min(distance_a, distance_b):.2f}, "
                f"chegara {settings.smoking_wrist_mouth_distance:.2f})"
            ),
            "metrics": {
                "distance_a": round(distance_a, 3),
                "distance_b": round(distance_b, 3),
                "threshold": settings.smoking_wrist_mouth_distance,
            },
        },
        frame_bytes=frame_b,
    )
    return True


async def run_smoking_ai_sweep_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    async with session_factory() as db:
        if not await is_module_active(db, SMOKING_MODULE_CODE):
            return 0
        result = await db.execute(
            select(Camera).where(Camera.status == "faol").where(camera_allows_module(SMOKING_MODULE_CODE))
        )
        cameras = [c for c in result.scalars().all() if c.stream_url and is_reachable(c.last_seen_at)]

    async def _process_one(camera: Camera) -> bool:
        async with camera_sweep_slot():
            frames = await grab_frame_pair_for_camera(camera)
            if frames is None:
                return False
            async with session_factory() as camera_db:
                return await process_camera_frame_pair_for_smoking(frames[0], frames[1], camera_db, camera)

    results = await asyncio.gather(*(_process_one(c) for c in cameras), return_exceptions=True)
    total = 0
    for camera, result in zip(cameras, results, strict=True):
        if isinstance(result, BaseException):
            logger.exception("smoking AI failed", extra={"camera_id": str(camera.id)}, exc_info=result)
            continue
        if result:
            total += 1
    return total


async def smoking_ai_loop() -> None:
    while True:
        try:
            count = await _sweep_guard.run(run_smoking_ai_sweep_once)
            if count:
                logger.info("smoking AI raised events", extra={"events": count})
        except Exception:
            logger.exception("smoking AI sweep failed")
        await asyncio.sleep(settings.smoking_ai_interval_seconds)
