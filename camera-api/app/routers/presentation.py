"""Ochiq taqdimot (/taqdimot) uchun jonli ko'rsatkichlar.

Kirishsiz ochiladi, shuning uchun faqat UMUMIY sonlar qaytadi: hech qanday
ism, JSHSHIR, rasm yoki havola yo'q. Fakultet nomlari — institutning ochiq
tuzilmasi. Bazani har ochilishda yuklamaslik uchun javob 5 daqiqa
xotirada saqlanadi.
"""

import time
from datetime import datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import IntegrationSyncRun, NotificationLog, StudentStaff
from app.routers.students_staff import _coverage
from app.services.integrations import hemis
from app.timezone import INSTITUTE_TZ, to_local

router = APIRouter(prefix="/api/public", tags=["public"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

CACHE_SECONDS = 300
DAYS = 30
_cache: dict[str, Any] = {"at": 0.0, "data": None}


def _cov(c: Any) -> dict[str, Any]:
    return {
        "total": c.total,
        "confirmed": c.confirmed,
        "pending": c.pending,
        "missing": c.missing,
        "awaiting": c.awaiting_approval,
        "percent": c.percent,
    }


async def _build(db: AsyncSession) -> dict[str, Any]:
    talaba = await _coverage(db, "talaba")
    xodim = await _coverage(db, "xodim")

    active = StudentStaff.active.is_(True)
    photos, self_registered, vectors = (
        await db.execute(
            select(
                func.count(StudentStaff.biometric_photo_key)
                + func.count(StudentStaff.biometric_photo_left_key)
                + func.count(StudentStaff.biometric_photo_right_key),
                func.count().filter(StudentStaff.self_registered.is_(True), StudentStaff.biometrics_status == "tasdiqlangan"),
                func.count().filter(StudentStaff.biometric_embedding.is_not(None), StudentStaff.biometrics_status == "tasdiqlangan"),
            ).where(active)
        )
    ).one()

    # So'nggi 30 kunda kunlik tasdiqlangan yuzlar (Toshkent vaqti bo'yicha).
    since = datetime.now(INSTITUTE_TZ) - timedelta(days=DAYS)
    day = func.date(func.timezone(str(INSTITUTE_TZ), StudentStaff.biometrics_confirmed_at))
    rows = (
        await db.execute(
            select(day, func.count())
            .where(active, StudentStaff.biometrics_confirmed_at >= since)
            .group_by(day)
        )
    ).all()
    by_day = {d.isoformat(): n for d, n in rows if d is not None}
    today = datetime.now(INSTITUTE_TZ).date()
    daily = [
        {"date": (today - timedelta(days=i)).isoformat(), "count": by_day.get((today - timedelta(days=i)).isoformat(), 0)}
        for i in range(DAYS - 1, -1, -1)
    ]

    success = (
        await db.execute(
            select(IntegrationSyncRun)
            .where(IntegrationSyncRun.source == hemis.SOURCE, IntegrationSyncRun.status == "muvaffaqiyatli")
            .order_by(IntegrationSyncRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    students_total, parents_linked = (
        await db.execute(
            select(func.count(), func.count().filter(StudentStaff.parent_telegram_chat_id.is_not(None))).where(
                StudentStaff.type == "talaba", active
            )
        )
    ).one()
    week_sent = await db.scalar(
        select(func.count())
        .select_from(NotificationLog)
        .where(NotificationLog.status == "yuborildi", NotificationLog.created_at >= datetime.now(INSTITUTE_TZ) - timedelta(days=7))
    )

    return {
        "generatedAt": datetime.now(INSTITUTE_TZ).isoformat(timespec="seconds"),
        "talaba": _cov(talaba),
        "xodim": _cov(xodim),
        "faceVectors": vectors,
        "photos": photos,
        "selfRegistered": self_registered,
        "byFaculty": [
            {"faculty": r.faculty, "total": r.total, "confirmed": r.confirmed, "percent": r.percent}
            for r in talaba.by_faculty
            if r.total
        ],
        "byCourse": [
            {"course": r.course, "total": r.total, "confirmed": r.confirmed, "percent": r.percent}
            for r in talaba.by_course
            if r.total and r.course_number
        ],
        "daily": daily,
        "hemis": {
            "configured": hemis.hemis_active(),
            "intervalHours": settings.hemis_sync_interval_hours,
            "lastSuccessAt": to_local(success.finished_at).isoformat(timespec="seconds")
            if success and success.finished_at
            else None,
        },
        "parents": {"students": students_total, "telegramLinked": parents_linked, "weekSent": week_sent or 0},
    }


@router.get("/taqdimot")
async def presentation_stats(db: DbDep, response: Response) -> dict[str, Any]:
    now = time.monotonic()
    if _cache["data"] is None or now - _cache["at"] > CACHE_SECONDS:
        _cache["data"] = await _build(db)
        _cache["at"] = now
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    return _cache["data"]
