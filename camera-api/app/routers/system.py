"""Real server resource metrics for the admin dashboard's "Server resurslari"
widget — CPU/RAM/disk usage of the machine running this API process, via
psutil. Replaces the frontend's old hardcoded mock/admin.ts systemResources."""

import asyncio
from typing import Annotated

import psutil
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.schemas.system import ResourceAlertOut, SystemResourcesOut
from app.services.runtime_snapshot import total_stream_readers
from app.services.security_checks import default_password_logins

router = APIRouter(prefix="/api/system", tags=["system"])

# Boshqaruv panelidagi server va AI holati. Kamera mas'uli bu panelni
# ko'rmaydi; qolgan operator rollaridan birortasi yetarli.
StatusDep = Annotated[
    CurrentUser, Depends(require_permission("viewReports", "reviewEvents", "systemSettings"))
]


def _ffmpeg_process_count() -> int:
    count = 0
    for proc in psutil.process_iter(["name"]):
        name = proc.info.get("name") or ""
        if "ffmpeg" in name.lower():
            count += 1
    return count


def _measure_resources() -> tuple[int, int, int, int]:
    return (
        round(psutil.cpu_percent(interval=0.1)),
        round(psutil.virtual_memory().percent),
        round(psutil.disk_usage("/").percent),
        _ffmpeg_process_count(),
    )


def _build_alerts(cpu: int, ram: int, disk: int, ffmpeg_count: int) -> list[ResourceAlertOut]:
    alerts: list[ResourceAlertOut] = []

    def add(metric: str, value: int, threshold: int, label: str) -> None:
        if value < threshold:
            return
        level = "critical" if value >= min(threshold + 10, 100) else "warning"
        alerts.append(
            ResourceAlertOut(
                metric=metric,
                level=level,
                message=f"{label} {value}% (chegara {threshold}%)",
            )
        )

    add("cpu", cpu, settings.resource_alert_cpu_percent, "CPU yuklanishi")
    add("ram", ram, settings.resource_alert_ram_percent, "RAM yuklanishi")
    add("disk", disk, settings.resource_alert_disk_percent, "Disk yuklanishi")

    if ffmpeg_count >= settings.resource_alert_ffmpeg_count:
        alerts.append(
            ResourceAlertOut(
                metric="ffmpeg",
                level="warning",
                message=(
                    f"ffmpeg jarayonlari ko'p: {ffmpeg_count} "
                    f"(chegara {settings.resource_alert_ffmpeg_count})"
                ),
            )
        )

    return alerts


@router.get("/resources", response_model=SystemResourcesOut)
async def get_system_resources(
    _: StatusDep,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SystemResourcesOut:
    # psutil sinxron: cpu_percent 0.1 s kutadi, process_iter esa yuzlab
    # jarayonni aylanadi — event loop'da bu har so'rovda butun API'ni
    # to'xtatardi (productionda so'rov 727 ms edi).
    cpu, ram, disk, ffmpeg_count = await asyncio.to_thread(_measure_resources)
    # Barcha API jarayonlari bo'yicha — javob bergan jarayonniki emas.
    stream_readers = await total_stream_readers()
    # AI alohida ai-worker konteynerida bo'lsa, uning ffmpeg jarayonlari bu
    # konteynerdan ko'rinmaydi (PID nomlar fazosi) — panelda 0 chiqardi.
    # Har o'quvchi bitta ffmpeg, o'quvchilar soni esa Redis orqali hamma
    # jarayonlardan yig'iladi.
    ffmpeg_count = max(ffmpeg_count, stream_readers)

    return SystemResourcesOut(
        cpu=cpu,
        ram=ram,
        disk=disk,
        ffmpeg_process_count=ffmpeg_count,
        stream_reader_count=stream_readers,
        alerts=_security_alerts(await default_password_logins(db))
        + _build_alerts(cpu, ram, disk, ffmpeg_count),
    )


def _security_alerts(default_logins: list[str]) -> list[ResourceAlertOut]:
    if not default_logins:
        return []
    return [
        ResourceAlertOut(
            metric="security",
            level="critical",
            message=(
                f"Ochiq e'lon qilingan standart parol bilan hisob: {', '.join(default_logins)} — "
                "parolni darhol almashtiring (Foydalanuvchilar va Rollar)"
            ),
        )
    ]


@router.get("/alerts")
async def system_alerts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: StatusDep,
) -> list[dict[str, str]]:
    """Hozir faol tizim muammolari — Telegramga ketadigan ogohlantirishlar bilan bir xil
    (app/jobs/system_alerts.py): disk, HEMIS."""
    from datetime import datetime, timezone

    from app.jobs.system_alerts import TITLES, collect_problems

    problems = await collect_problems(db, datetime.now(timezone.utc))
    return [{"key": key, "title": TITLES.get(key, key), "message": text} for key, text in problems.items()]
