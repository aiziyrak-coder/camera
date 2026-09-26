"""Yuz tanilganda "tashrif"ni yozish — qarang app/models/presence_visit.py."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import PresenceVisit


async def record_visit(
    db: AsyncSession,
    student_staff_id: str | uuid.UUID,
    camera_id: str | uuid.UUID,
    seen_at: datetime,
    similarity: float | None = None,
) -> PresenceVisit:
    """Shu odamning shu kameradagi oxirgi tashrifi yaqinda (gap ichida)
    tugagan bo'lsa — uzaytiriladi, aks holda yangi tashrif ochiladi.

    Commit qilmaydi: chaqiruvchi (attendance_ai.process_camera_frame) o'z
    tranzaksiyasini o'zi yopadi."""
    person_id = uuid.UUID(str(student_staff_id))
    cam_id = uuid.UUID(str(camera_id))
    gap = timedelta(minutes=settings.presence_visit_gap_minutes)

    visit = (
        await db.execute(
            select(PresenceVisit)
            .where(PresenceVisit.student_staff_id == person_id)
            .where(PresenceVisit.camera_id == cam_id)
            .where(PresenceVisit.last_seen_at >= seen_at - gap)
            # Kechikib kelgan eski ko'rinish (qayta moslash, yuz tekshiruvi)
            # bugungi tashrifning boshini kechaga tortib ketmasin.
            .where(PresenceVisit.first_seen_at <= seen_at + gap)
            .order_by(PresenceVisit.last_seen_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if visit is None:
        visit = PresenceVisit(
            student_staff_id=person_id,
            camera_id=cam_id,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            sightings=1,
            best_similarity=similarity,
        )
        db.add(visit)
    else:
        visit.last_seen_at = max(visit.last_seen_at, seen_at)
        visit.first_seen_at = min(visit.first_seen_at, seen_at)
        visit.sightings += 1
        if similarity is not None and (visit.best_similarity is None or similarity > visit.best_similarity):
            visit.best_similarity = similarity
    await db.flush()
    return visit
