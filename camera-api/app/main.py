import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine
from app.jobs.attendance_ai import attendance_ai_loop, stop_entrance_watchers
from app.jobs.camera_health import camera_health_loop
from app.jobs.cleanup import cleanup_loop
from app.jobs.fire_ai import fire_ai_loop
from app.jobs.disorder_ai import disorder_ai_loop
from app.jobs.dress_code_ai import dress_code_ai_loop
from app.jobs.fight_ai import fight_ai_loop
from app.jobs.leader_lock import release_leadership, try_become_leader
from app.jobs.ai_scheduler import ai_scheduler_loop, standalone_sweep_loops
from app.jobs.lesson_attendance import lesson_attendance_loop
from app.jobs.lesson_quality_ai import lesson_quality_ai_loop
from app.jobs.ppe_ai import ppe_ai_loop
from app.jobs.smoking_ai import smoking_ai_loop
from app.jobs.teacher_punctuality_ai import teacher_punctuality_ai_loop
from app.jobs.unauthorized_person_ai import unauthorized_person_ai_loop
from app.jobs.unified_face_sweep import unified_face_sweep_loop
from app.jobs.vision_ai import vision_ai_loop
from app.jobs.zone_entry_ai import zone_entry_ai_loop
from app.jobs.access_poll import access_poll_loop
from app.jobs.event_escalation import event_escalation_loop
from app.jobs.hemis_sync import hemis_sync_loop
from app.jobs.telegram_bot import telegram_bot_loop
from app.logging_config import configure_logging
from app.rate_limit import limiter
from app.redis_bus import start_redis_listener, stop_redis_listener
from app.services import video_gateway
from app.services.runtime_snapshot import process_snapshot_loop, runtime_snapshot_loop
from app.ws import manager
from app.services.cpu_pool import shutdown_cpu_pool
from app.services.pose_detection import shutdown_pose_detection_pool
from app.services.stream_cache import shutdown_stream_cache, stream_cache_reaper_loop
from app.services.thread_limits import apply_thread_limits
from app.storage import check_bucket
from app.routers import (
    unknown_sightings,
    archive,
    presence,
    person_locator,
    access_control,
    ai_modules,
    attendance,
    audit_log,
    auth,
    cameras,
    enrollment,
    events,
    face,
    hisobot,
    hisobot_jadval,
    kpi,
    floor_plans,
    integrations,
    lesson_sessions,
    metrics,
    notifications,
    org_structure,
    privacy,
    ptz,
    public,
    reports,
    situation,
    situation_analytics,
    attendance_policy,
    students_staff,
    system,
    users,
)
from app.seed import seed_all
from app.services.face_matching import announce_roster_change
from app.services.security_checks import log_insecure_config
from app.services.self_enrollment import approve_pending
from app.services.stream_sync import sync_all_active_camera_streams

configure_logging()
logger = logging.getLogger("app")

# All 16 AI sweep loops below used to fire their first sweep in the exact
# same instant (asyncio.create_task returns immediately, so a plain loop
# of create_task calls schedules every loop's first iteration for the very
# next event-loop tick) — contending for the same camera/inference
# semaphores and DB connections all at once, then drifting back in sync
# every ~30s after since each loop's own interval is fixed. Wrapping each
# with _staggered() delays only that first tick; asyncio.create_task still
# returns immediately (the sleep happens inside the task's own execution,
# not the lifespan coroutine), so server startup isn't slowed down by this.
async def _staggered(delay_seconds: float, loop_coro) -> None:
    if delay_seconds > 0:
        await asyncio.sleep(delay_seconds)
    await loop_coro


async def _sync_streams_once() -> None:
    try:
        async with SessionLocal() as session:
            synced, failed = await sync_all_active_camera_streams(session)
        logger.info(
            "startup MediaMTX stream sync complete",
            extra={"event": "stream_sync", "synced": synced, "failed": failed},
        )
    except Exception:
        logger.exception("startup MediaMTX stream sync failed")


def _start_platform_loops(tasks: list[asyncio.Task]) -> None:
    """Bitta nusxada ishlashi kerak bo'lgan fon vazifalari (leader'da):
    Telegram bot, SLA ogohlantirish, HEMIS sinxronlash, turniket so'rovi."""
    for loop_coro in (
        telegram_bot_loop(),
        event_escalation_loop(),
        hemis_sync_loop(),
        access_poll_loop(),
    ):
        tasks.append(asyncio.create_task(loop_coro))


def _start_ai_loops(tasks: list[asyncio.Task]) -> None:
    """Leader jarayonida AI sweeplarini ishga tushiradi."""
    # AI statistikasi faqat shu jarayon xotirasida — boshqa API
    # jarayonlari uni Redis orqali ko'radi (app/services/runtime_snapshot.py).
    tasks.append(asyncio.create_task(runtime_snapshot_loop()))
    _start_platform_loops(tasks)
    stagger = settings.ai_loop_stagger_seconds
    if settings.ai_scheduler_enabled:
        tasks.append(asyncio.create_task(ai_scheduler_loop()))
        tasks.append(asyncio.create_task(camera_health_loop()))
        logger.info(
            "AI central scheduler enabled — individual module loops not started",
            extra={"event": "ai_scheduler", "poll_seconds": settings.ai_scheduler_poll_seconds},
        )
    else:
        face_loops = (
            [unified_face_sweep_loop()]
            if settings.unified_face_sweep_enabled
            else [
                attendance_ai_loop(),
                vision_ai_loop(),
                unauthorized_person_ai_loop(),
            ]
        )
        ai_loops = [
            camera_health_loop(),
            *face_loops,
            fire_ai_loop(),
            teacher_punctuality_ai_loop(),
            disorder_ai_loop(),
            dress_code_ai_loop(),
            ppe_ai_loop(),
            smoking_ai_loop(),
            zone_entry_ai_loop(),
            lesson_quality_ai_loop(),
            lesson_attendance_loop(),
            fight_ai_loop(),
            *standalone_sweep_loops(),
        ]
        tasks += [asyncio.create_task(_staggered(i * stagger, loop_coro)) for i, loop_coro in enumerate(ai_loops)]
    logger.info(
        "acquired AI sweep leader lock — sweep loops running in this worker",
        extra={
            "event": "leader_elected",
            "ai_role": settings.ai_role,
            "stagger_seconds": stagger if not settings.ai_scheduler_enabled else None,
            "unified_face_sweep": settings.unified_face_sweep_enabled,
            "ai_scheduler": settings.ai_scheduler_enabled,
        },
    )


# Shu jarayon AI leader'imi — to'xtashda AI resurslarini yopish uchun.
_leader_state = {"is_leader": False}


async def _become_leader_when_free(tasks: list[asyncio.Task]) -> None:
    """ai-worker: qulf bo'shaguncha kutadi. Yangilanish paytida eski
    ("all" rejimidagi) api konteyneri qulfni bir necha soniya ushlab
    turishi mumkin — bir martalik urinish AI'ni butunlay to'xtatib qo'yardi."""
    while not await try_become_leader():
        logger.info("AI leader lock is held elsewhere — ai-worker waiting", extra={"event": "leader_waiting"})
        await asyncio.sleep(settings.ai_worker_lock_retry_seconds)
    _leader_state["is_leader"] = True
    _start_ai_loops(tasks)
    # MediaMTX ro'yxati (107 kamera, kodek tekshiruvi bilan 2+ daqiqa) AI'ni
    # kutdirmasin: AI kameralarni to'g'ridan-to'g'ri RTSP orqali o'qiydi.
    tasks.append(asyncio.create_task(_sync_streams_once()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Birinchi model chaqiruvidan oldin — app/services/thread_limits.py.
    apply_thread_limits()
    # Fail-open sozlamalar ishga tushishda baland ovozda aytiladi
    # (app/services/security_checks.py).
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

    # See app/jobs/leader_lock.py: with WEB_CONCURRENCY>1 (multiple
    # uvicorn worker processes), only one worker should run the AI sweep
    # loops — otherwise every camera gets swept once per worker, per
    # interval, producing duplicate writes. cleanup_loop stays ungated
    # (its deletes are idempotent; redundant runs are harmless).
    # "api" rolidagi jarayon (AI alohida ai-worker konteynerida) qulfga
    # umuman urinmaydi.
    is_leader = settings.ai_role == "all" and await try_become_leader()
    _leader_state["is_leader"] = is_leader

    # Bo'sh ffmpeg o'quvchilarini yopish HAR BIR jarayonda kerak: AI
    # bo'lmagan jarayon ham miniatyura va jonli aniqlash uchun o'quvchi
    # ochadi. Ilgari yopuvchi faqat leader'da ishlardi va productionda
    # ikkinchi jarayonda 66 ta ffmpeg abadiy ochiq turardi.
    tasks = [
        asyncio.create_task(cleanup_loop()),
        asyncio.create_task(stream_cache_reaper_loop()),
        # Har jarayon o'z ffmpeg o'quvchilari sonini e'lon qiladi — panel yig'indini ko'rsatadi.
        asyncio.create_task(process_snapshot_loop()),
    ]
    if settings.redis_url.strip():
        await start_redis_listener(manager.deliver_from_redis)
    if is_leader:
        _start_ai_loops(tasks)
        tasks.append(asyncio.create_task(_sync_streams_once()))
    elif settings.ai_role == "worker":
        tasks.append(asyncio.create_task(_become_leader_when_free(tasks)))
    else:
        logger.info(
            "AI sweep loops NOT started in this worker",
            extra={"event": "leader_skipped", "ai_role": settings.ai_role},
        )

    logger.info("startup complete", extra={"event": "startup", "ai_role": settings.ai_role})
    yield
    for task in tasks:
        task.cancel()
    await shutdown_stream_cache()
    shutdown_cpu_pool()
    if _leader_state["is_leader"]:
        # Kirish kameralarining doimiy kuzatuvchilari rejalashtiruvchi
        # vazifasidan tashqarida yashaydi — alohida to'xtatiladi.
        await stop_entrance_watchers()
        await shutdown_pose_detection_pool()
    await stop_redis_listener()
    await release_leadership()
    logger.info("shutting down", extra={"event": "shutdown"})


app = FastAPI(
    title="Situatsion Markaz API",
    lifespan=lifespan,
    # Hujjatlar standart bo'yicha yopiq — settings.api_docs_enabled izohiga qarang.
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origin.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(unknown_sightings.router)
app.include_router(archive.router)
app.include_router(users.router)
app.include_router(students_staff.router)
app.include_router(org_structure.router)
app.include_router(audit_log.router)
app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(face.router)
app.include_router(ai_modules.router)
app.include_router(attendance.router)
app.include_router(lesson_sessions.router)
app.include_router(reports.router)
app.include_router(system.router)
app.include_router(public.router)
app.include_router(enrollment.router)
app.include_router(enrollment.codes_router)
app.include_router(presence.router)
app.include_router(person_locator.router)
app.include_router(notifications.router)
app.include_router(integrations.router)
app.include_router(access_control.router)
app.include_router(ptz.router)
app.include_router(floor_plans.router)
app.include_router(metrics.router)
app.include_router(privacy.router)
app.include_router(situation.router)
app.include_router(situation_analytics.router)
app.include_router(hisobot.router)
app.include_router(hisobot_jadval.router)
app.include_router(kpi.router)
app.include_router(attendance_policy.router)


@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    """Real readiness check — verifies every external dependency the API
    actually needs to serve traffic (database, MinIO/S3 storage, MediaMTX
    video gateway), not just that the process is running. Kubernetes/
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

    try:
        await video_gateway.check_reachable()
        checks["video_gateway"] = "ok"
    except Exception as exc:
        logger.error("health check: video gateway (MediaMTX) unreachable", extra={"error": str(exc)})
        checks["video_gateway"] = "unreachable"

    if any(v != "ok" for v in checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", **checks}
    return {"status": "ok", **checks}
