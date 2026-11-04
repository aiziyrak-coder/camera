"""Dars xonasi kameralaridan 4K surat yig'ish (kunduzgi tahlil uchun).

NIMA UCHUN. NVR'da xotira yo'q, server esa kameralarning substream'ini
(1280x720) yozadi. O'lchov (2026-11-04, 34/15/4-xona): substream kadrida
talaba yuzi ~15 px — birorta yuz tanilmadi; o'sha paytdagi 4K (3840x2160)
kadrda yuz 40-55 px, 51-xonada bitta suratda guruhning yarmi (6/12)
tanildi. 4K videoni uzluksiz yozish soatiga ~40 GB va uni dekodlash CPU'ni
yeydi. Kameraning o'z JPEG surati (ISAPI .../channels/101/picture) esa
dekodlashsiz, sifati videodan yomon emas (o'lchandi).

QANDAY. Kun oynasida har `classroom_snapshot_interval_seconds` soniyada
har bir dars xonasi kamerasidan bitta surat olinib,
`<classroom_snapshots_dir>/snap-<kamera id>/%Y-%m-%d_%H-%M-%S.jpg` (UTC)
ga yoziladi. Kunduzgi tahlil (app/jobs/video_analysis.py) dars xonasini
shu suratlardan o'qiydi (app/services/nvr/sources.py SnapshotSource).
Eski suratlar `classroom_snapshot_retention_hours` dan keyin o'chiriladi;
disk bo'sh joyi `recording_min_free_percent` dan kam bo'lsa yozilmaydi.
Javob bermagan kamera `classroom_snapshot_retry_after_seconds` davomida
o'tkazib yuboriladi — har aylanishda timeout kutib qolmaslik uchun.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from datetime import datetime, time as time_type, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy import select

from app.config import settings
from app.crypto import decrypt
from app.database import SessionLocal
from app.models import Camera
from app.services.camera_roles import effective_room_type
from app.services.nvr.sources import CLASSROOM_SNAPSHOT_TYPES, snapshot_dir, snapshot_name
from app.timezone import INSTITUTE_TZ

logger = logging.getLogger("app.jobs.classroom_snapshots")

CAMERA_REFRESH_SECONDS = 600
PRUNE_EVERY_SECONDS = 600
# Dars rejasi boshlanish oynasini darsdan 10 daqiqa oldin ochadi.
WINDOW_LEAD = timedelta(minutes=30)


def in_window(now: datetime) -> bool:
    local = now.astimezone(INSTITUTE_TZ)
    start = datetime.combine(local.date(), _clock(settings.video_analysis_day_start), tzinfo=INSTITUTE_TZ) - WINDOW_LEAD
    end = datetime.combine(local.date(), _clock(settings.video_analysis_start), tzinfo=INSTITUTE_TZ)
    return start <= local < end


def _clock(value: str) -> time_type:
    return time_type.fromisoformat(value.strip())


def disk_has_room(base: str) -> bool:
    try:
        usage = shutil.disk_usage(base)
    except OSError:
        return False
    return usage.free / max(1, usage.total) * 100 >= settings.recording_min_free_percent


def write_snapshot(base: str, camera_id: str, at: datetime, data: bytes) -> Path:
    directory = snapshot_dir(base, camera_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / snapshot_name(at)
    tmp = directory / f".{target.name}.part"
    tmp.write_bytes(data)
    os.replace(tmp, target)  # tahlil yarim yozilgan faylni o'qimasin
    return target


def prune_snapshots(base: str, now: datetime, hours: int) -> int:
    """Muddati o'tgan suratlarni o'chiradi (fayl nomidagi vaqt bo'yicha)."""
    root = Path(base)
    if not root.is_dir():
        return 0
    cutoff = now - timedelta(hours=hours)
    removed = 0
    for directory in root.glob("snap-*"):
        if not directory.is_dir():
            continue
        for path in directory.iterdir():
            try:
                stamp = datetime.strptime(path.name[:19], "%Y-%m-%d_%H-%M-%S").replace(tzinfo=timezone.utc)
            except ValueError:
                # Yarim qolgan .part yoki begona fayl — o'zgartirilgan vaqti bo'yicha.
                stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if stamp < cutoff:
                try:
                    path.unlink()
                    removed += 1
                except OSError:
                    pass
    return removed


class SnapshotCollector:
    def __init__(self, fetch=None, clock=time.monotonic) -> None:
        self.fetch = fetch or self._fetch
        self.clock = clock
        self.skip_until: dict[str, float] = {}

    async def _fetch(self, client: httpx.AsyncClient, camera: Camera) -> bytes | None:
        auth = None
        if camera.rtsp_username:
            auth = httpx.DigestAuth(decrypt(camera.rtsp_username), decrypt(camera.rtsp_password) if camera.rtsp_password else "")
        url = f"http://{camera.ip}:{settings.classroom_snapshot_http_port}/ISAPI/Streaming/channels/101/picture"
        response = await client.get(url, auth=auth)
        if response.status_code != 200 or response.content[:2] != b"\xff\xd8":
            return None
        return response.content

    async def round(self, cameras: list[Camera], now: datetime, client: httpx.AsyncClient | None = None) -> dict[str, int]:
        stats = {"olindi": 0, "xato": 0, "otkazildi": 0}
        semaphore = asyncio.Semaphore(max(1, settings.classroom_snapshot_concurrency))
        base = settings.classroom_snapshots_dir

        async def one(camera: Camera) -> None:
            key = str(camera.id)
            if self.skip_until.get(key, 0.0) > self.clock():
                stats["otkazildi"] += 1
                return
            async with semaphore:
                try:
                    data = await self.fetch(client, camera)
                except (httpx.HTTPError, OSError):
                    data = None
            if data is None:
                stats["xato"] += 1
                self.skip_until[key] = self.clock() + settings.classroom_snapshot_retry_after_seconds
                return
            self.skip_until.pop(key, None)
            await asyncio.to_thread(write_snapshot, base, key, now, data)
            stats["olindi"] += 1

        await asyncio.gather(*(one(camera) for camera in cameras))
        return stats


async def classroom_cameras() -> list[Camera]:
    async with SessionLocal() as db:
        cameras = (await db.execute(select(Camera).where(Camera.status == "faol"))).scalars().all()
    return [camera for camera in cameras if effective_room_type(camera) in CLASSROOM_SNAPSHOT_TYPES]


async def classroom_snapshots_loop() -> None:
    if not settings.classroom_snapshots_enabled:
        logger.info("classroom snapshots disabled")
        return
    collector = SnapshotCollector()
    cameras: list[Camera] = []
    cameras_at = pruned_at = 0.0
    low_disk_logged = 0.0
    interval = max(5, settings.classroom_snapshot_interval_seconds)
    timeout = httpx.Timeout(settings.classroom_snapshot_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            started = time.monotonic()
            try:
                now = datetime.now(timezone.utc)
                if started - pruned_at >= PRUNE_EVERY_SECONDS:
                    removed = await asyncio.to_thread(
                        prune_snapshots, settings.classroom_snapshots_dir, now, settings.classroom_snapshot_retention_hours
                    )
                    pruned_at = started
                    if removed:
                        logger.info("classroom snapshots pruned", extra={"removed": removed})
                if in_window(now):
                    if started - cameras_at >= CAMERA_REFRESH_SECONDS or not cameras:
                        cameras = await classroom_cameras()
                        cameras_at = started
                    if not await asyncio.to_thread(disk_has_room, settings.classroom_snapshots_dir):
                        if started - low_disk_logged >= 600:
                            logger.warning("classroom snapshots paused: disk almost full")
                            low_disk_logged = started
                    else:
                        stats = await collector.round(cameras, now, client)
                        logger.debug("classroom snapshot round", extra=stats)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 — bitta aylanish xatosi yig'ishni to'xtatmasin
                logger.exception("classroom snapshot round failed")
            await asyncio.sleep(max(1.0, interval - (time.monotonic() - started)))
