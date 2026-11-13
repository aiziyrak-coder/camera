"""Yuzlar bazasi platformasi (2026-11-12 da tozalangan).

Qolgan funksiyalar: yuzlar bazasi (reestr, ochiq ro'yxatdan o'tish, yuz
solishtirish, iMentor integratsiyasi), HEMIS integratsiyasi (talaba/xodim,
rasmlar, davomat), Telegram bildirishnomalari, foydalanuvchilar va rollar.
Kamera tahlili, davomat hisoblash, hodisalar, hisobotlar olib tashlandi —
yangi platforma shu yuzlar bazasi ustiga qaytadan quriladi.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine
from app.dependencies import fresh_attendance_policy
from app.jobs.hemis_attendance_sync import hemis_attendance_loop
from app.jobs.hemis_photos import hemis_photos_loop
from app.jobs.hemis_sync import hemis_sync_loop
from app.jobs.leader_lock import release_leadership, try_become_leader
from app.jobs.system_alerts import system_alerts_loop
from app.jobs.telegram_bot import telegram_bot_loop
from app.logging_config import configure_logging
from app.rate_limit import limiter
from app.routers import (
    audit_log,
    auth,
    enrollment,
    face,
    integration_v1,
    presentation,
    integrations,
    metrics,
    notifications,
    org_structure,
    privacy,
    situation,
    students_staff,
    system,
    users,
)
from app.seed import seed_all
from app.services.face_matching import announce_roster_change
from app.services.security_checks import log_insecure_config
from app.services.self_enrollment import approve_pending
from app.services.thread_limits import apply_thread_limits
from app.storage import check_bucket

configure_logging()
logger = logging.getLogger("app")


def _start_leader_loops(tasks: list[asyncio.Task]) -> None:
    """Bitta nusxada ishlashi kerak bo'lgan fon vazifalari (leader'da).

    Tozalash (cleanup) ATAYLAB yo'q: u faolsiz odamlarning yuz rasmlarini
    o'chirardi — yuzlar bazasi esa endi platformaning asosi."""
    for loop_coro in (
        telegram_bot_loop(),
        hemis_sync_loop(),
        hemis_photos_loop(),
        hemis_attendance_loop(),
        system_alerts_loop(),
    ):
        tasks.append(asyncio.create_task(loop_coro))
    logger.info("leader loops started", extra={"event": "leader_elected", "ai_role": settings.ai_role})


_leader_state = {"is_leader": False}


async def _become_leader_when_free(tasks: list[asyncio.Task]) -> None:
    """worker roli: qulf bo'shaguncha kutadi (yangilanish paytida eski
    konteyner uni bir necha soniya ushlab turishi mumkin)."""
    while not await try_become_leader():
        logger.info("leader lock is held elsewhere — waiting", extra={"event": "leader_waiting"})
        await asyncio.sleep(settings.ai_worker_lock_retry_seconds)
    _leader_state["is_leader"] = True
    _start_leader_loops(tasks)


@asynccontextmanager
async def lifespan(app: FastAPI):
    apply_thread_limits()
    log_insecure_config()
    async with SessionLocal() as session:
        await seed_all(session)
    try:
        async with SessionLocal() as session:
            approved, _held = await approve_pending(session)
        if approved:
            await announce_roster_change()
    except Exception:  # noqa: BLE001 — ishga tushishni to'xtatmasin
        logging.getLogger("app.self_enrollment").exception("auto-approve failed")

    tasks: list[asyncio.Task] = []
    is_leader = settings.ai_role == "all" and await try_become_leader()
    _leader_state["is_leader"] = is_leader
    if is_leader:
        _start_leader_loops(tasks)
    elif settings.ai_role == "worker":
        tasks.append(asyncio.create_task(_become_leader_when_free(tasks)))

    logger.info("startup complete", extra={"event": "startup", "ai_role": settings.ai_role})
    yield
    for task in tasks:
        task.cancel()
    await release_leadership()
    logger.info("shutting down", extra={"event": "shutdown"})


app = FastAPI(
    title="Yuzlar bazasi API",
    lifespan=lifespan,
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

from fastapi import HTTPException as _HTTPException  # noqa: E402
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
from fastapi.exception_handlers import http_exception_handler as _default_http_handler  # noqa: E402


@app.exception_handler(_HTTPException)
async def _log_enrollment_rejections(request, exc):
    # Ochiq ro'yxatdan o'tish rad etilganda foydalanuvchi faqat "saqlanmadi"
    # ko'radi — sababini log'dan topish uchun (shaxsiy ma'lumotsiz: faqat xabar).
    if "/enrollment/" in request.url.path and exc.status_code >= 400:
        logger.warning(
            "enrollment request rejected",
            extra={"path_kind": request.url.path.rsplit("/", 1)[-1], "status": exc.status_code, "detail": str(exc.detail)[:300]},
        )
    return await _default_http_handler(request, exc)


app.state.limiter = limiter
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# iMentor integratsiyasi — xatolar {"code", "message"} ko'rinishida.
app.add_exception_handler(integration_v1.IntegrationError, integration_v1.integration_error_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origin.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-2FA-Required", "Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(students_staff.router)
app.include_router(org_structure.router)
app.include_router(audit_log.router)
app.include_router(face.router)
app.include_router(system.router)
app.include_router(enrollment.router)
app.include_router(notifications.router)
app.include_router(integrations.router)
app.include_router(metrics.router)
app.include_router(privacy.router)
# Tashkiliy tuzilma daraxti, ism bo'yicha qidiruv va PDF shu yerda.
app.include_router(situation.router, dependencies=[Depends(fresh_attendance_policy)])
app.include_router(integration_v1.router)
app.include_router(presentation.router)


@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    """Real readiness check — verifies every external dependency the API
    actually needs to serve traffic (database, MinIO/S3 storage), not just that the process is running. Kubernetes/
    load-balancer health checks should hit this. A single failed
    dependency degrades the whole response — a half-broken deployment
    (e.g. DB fine but storage down) should not read as healthy."""
    checks: dict[str, str] = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        logger.error("health check: database unreachable", extra={"error": str(exc)})
        checks["database"] = "unreachable"

    try:
        await asyncio.to_thread(check_bucket)
        checks["storage"] = "ok"
    except Exception as exc:
        logger.error("health check: storage (MinIO) unreachable", extra={"error": str(exc)})
        checks["storage"] = "unreachable"

    if any(v != "ok" for v in checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", **checks}
    return {"status": "ok", **checks}
