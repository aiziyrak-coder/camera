"""Video arxivi — /api/arxiv.

  GET /{camera_id}/kun?sana=YYYY-MM-DD  — shu kun: yozilgan oraliqlar va
      hodisa belgilari (timeline uchun).
  GET /{camera_id}/havola?start=&duration=  — imzolangan video havolasi.
      Ko'rish audit jurnaliga yoziladi ("kim, qaysi kamerani, qaysi vaqtni").
  GET /{camera_id}/video?...&exp=&sig=  — MP4 oqimi. <video src> sarlavha
      yubora olmaydi, shuning uchun token o'rniga qisqa muddatli HMAC imzo.

Yozuv va playback — app/services/recording.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import time
import uuid
from datetime import date as date_type, datetime, time as time_type, timedelta
from typing import Annotated
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import Camera, Event
from app.schemas.base import CamelModel
from app.services import recording
from app.timezone import INSTITUTE_TZ, local_now

router = APIRouter(prefix="/api/arxiv", tags=["arxiv"])

LiveDep = Annotated[CurrentUser, Depends(require_permission("viewLive"))]
DbDep = Annotated[AsyncSession, Depends(get_db)]

# Bitta so'rovda beriladigan eng uzun bo'lak: pleyer oxiriga yetganda
# keyingisini o'zi so'raydi. Katta bo'lak — uzoq kutish va ortiqcha trafik.
MAX_CHUNK_SECONDS = 15 * 60


class RangeOut(CamelModel):
    start: str
    end: str


class MarkerOut(CamelModel):
    id: str
    at: str
    module_name: str
    severity: str
    status: str
    person_name: str | None = None
    has_clip: bool = False


class DayOut(CamelModel):
    camera_id: str
    camera_name: str
    day: str
    recording: bool
    retention_hours: int
    ranges: list[RangeOut]
    events: list[MarkerOut]


class LinkOut(CamelModel):
    url: str
    download_url: str
    start: str
    duration: int
    expires_at: str


async def _camera(db: AsyncSession, camera_id: str) -> Camera:
    try:
        key = uuid.UUID(camera_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi") from None
    camera = await db.get(Camera, key)
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")
    return camera


def _parse_moment(value: str) -> datetime:
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Vaqt noto'g'ri") from None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=INSTITUTE_TZ)
    return moment


def _signature(camera_id: str, start: str, duration: int, exp: int) -> str:
    message = f"arxiv|{camera_id}|{start}|{duration}|{exp}".encode()
    return hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).hexdigest()


@router.get("/{camera_id}/kun", response_model=DayOut)
async def archive_day(
    camera_id: str,
    db: DbDep,
    _: LiveDep,
    sana: Annotated[date_type | None, Query()] = None,
) -> DayOut:
    camera = await _camera(db, camera_id)
    day = sana or local_now().date()
    start = datetime.combine(day, time_type.min, tzinfo=INSTITUTE_TZ)
    end = start + timedelta(days=1)
    ranges = await recording.list_segments(camera_id, start, end) if settings.recording_enabled else []
    rows = (
        await db.execute(
            select(Event)
            .where(Event.camera_id == camera.id)
            .where(Event.occurred_at >= start)
            .where(Event.occurred_at < end)
            .order_by(Event.occurred_at)
            .limit(500)
        )
    ).scalars().all()
    return DayOut(
        camera_id=camera_id,
        camera_name=camera.name,
        day=day.isoformat(),
        recording=settings.recording_enabled,
        retention_hours=settings.recording_retention_hours,
        ranges=[RangeOut(start=a.isoformat(), end=b.isoformat()) for a, b in ranges],
        events=[
            MarkerOut(
                id=str(row.id),
                at=row.occurred_at.isoformat(),
                module_name=row.module_name,
                severity=row.severity,
                status=row.status,
                person_name=row.person_name,
                has_clip=bool(row.clip_key),
            )
            for row in rows
        ],
    )


@router.get("/{camera_id}/havola", response_model=LinkOut)
async def archive_link(
    camera_id: str,
    request: Request,
    db: DbDep,
    current_user: LiveDep,
    start: Annotated[str, Query()],
    duration: Annotated[int, Query(ge=1, le=MAX_CHUNK_SECONDS)] = 600,
) -> LinkOut:
    camera = await _camera(db, camera_id)
    if not settings.recording_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Arxiv yozuvi yoqilmagan")
    moment = _parse_moment(start)
    start_text = moment.isoformat()
    exp = int(time.time()) + settings.archive_link_ttl_seconds
    sig = _signature(camera_id, start_text, duration, exp)
    query = urlencode({"start": start_text, "duration": duration, "exp": exp, "sig": sig})
    base = f"/api/arxiv/{camera_id}/video?{query}"
    local = moment.astimezone(INSTITUTE_TZ).strftime("%d.%m.%Y %H:%M")
    await log_action(db, request, current_user.id, f"Arxiv ko'rildi: {camera.name}, {local}", "Video arxiv")
    await db.commit()
    return LinkOut(
        url=base,
        download_url=f"{base}&yuklab=1",
        start=start_text,
        duration=duration,
        expires_at=datetime.fromtimestamp(exp, INSTITUTE_TZ).isoformat(),
    )


@router.get("/{camera_id}/video")
async def archive_video(
    camera_id: str,
    start: Annotated[str, Query()],
    duration: Annotated[int, Query(ge=1, le=MAX_CHUNK_SECONDS)],
    exp: Annotated[int, Query()],
    sig: Annotated[str, Query()],
    yuklab: Annotated[int, Query()] = 0,
    h264: Annotated[int, Query()] = 0,
) -> StreamingResponse:
    if exp < time.time() or not hmac.compare_digest(sig, _signature(camera_id, start, duration, exp)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Havola eskirgan yoki noto'g'ri")
    moment = _parse_moment(start)
    upstream = recording.get_url(camera_id, moment, duration)
    # X-Accel-Buffering: nginx butun faylni buferlab kutib turmasin — video darhol boshlansin.
    headers = {"Cache-Control": "private, max-age=300", "X-Accel-Buffering": "no"}
    if yuklab:
        name = f"arxiv-{camera_id[:8]}-{moment.astimezone(INSTITUTE_TZ).strftime('%Y%m%d-%H%M%S')}.mp4"
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(name)}"
    if h264:
        # H.265 yozuvni brauzer o'qiy olmasa (Chrome'ning ko'p versiyalari) —
        # ko'rish paytida H.264 ga o'tkaziladi. CPU faqat kimdir ko'rayotganda.
        return StreamingResponse(_transcode(upstream), media_type="video/mp4", headers=headers)
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0))
    try:
        response = await client.send(client.build_request("GET", upstream), stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Arxiv serveri javob bermadi") from None
    if response.status_code != 200:
        await response.aclose()
        await client.aclose()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bu vaqt oralig'ida yozuv yo'q")

    async def body():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(body(), media_type="video/mp4", headers=headers)


async def _transcode(upstream: str):
    process = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", upstream,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        assert process.stdout is not None
        while chunk := await process.stdout.read(64 * 1024):
            yield chunk
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
