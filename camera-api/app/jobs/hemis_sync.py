"""HEMIS bilan davriy sinxronlash (settings.hemis_sync_interval_hours).

0 — faqat qo'lda (admin paneldagi "Sinxronlash" tugmasi). Navbat
integration_sync_runs jadvalidagi oxirgi urinishdan hisoblanadi, ya'ni
server qayta ishga tushganda sinxronlash darhol takrorlanmaydi. Xato bilan
tugagan urinish uzog'i bilan bir soatdan keyin qayta sinab ko'riladi.
Qo'lda boshlangan sinxronlash bilan ustma-ust tushmaydi (start_run).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.models import IntegrationSyncRun
from app.services.integrations import hemis

logger = logging.getLogger("app.jobs.hemis_sync")

CHECK_INTERVAL_SECONDS = 600
FAILED_RETRY_AFTER = timedelta(hours=1)
SCHEDULED_TRIGGER = "tizim (jadval)"


async def is_sync_due(db, now: datetime | None = None) -> bool:
    interval_hours = settings.hemis_sync_interval_hours
    if interval_hours <= 0 or not hemis.hemis_configured():
        return False
    now = now or datetime.now(timezone.utc)
    last = (
        await db.execute(
            select(IntegrationSyncRun)
            .where(IntegrationSyncRun.source == hemis.SOURCE)
            .order_by(IntegrationSyncRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last is None or last.started_at is None:
        return True
    interval = timedelta(hours=interval_hours)
    if last.status == "xato":
        interval = min(interval, FAILED_RETRY_AFTER)
    return now - last.started_at >= interval


async def run_scheduled_sync_once() -> bool:
    """Navbati kelgan bo'lsa sinxronlaydi. True — ishga tushirildi."""
    async with hemis.session_factory() as db:
        if not await is_sync_due(db):
            return False
        run = await hemis.start_run(db, SCHEDULED_TRIGGER)
    if run is None:
        return False
    await hemis.run_sync(run.id)
    return True


async def hemis_sync_loop() -> None:
    while True:
        try:
            await run_scheduled_sync_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("scheduled HEMIS sync failed", extra={"event": "hemis_sync_loop_error"})
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
