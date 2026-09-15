import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

import jwt
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import case, false, func, or_, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Camera, Event, User
from app.pagination import Page, PageParams, build_page, paginate
from app.schemas.event import (
    EventBulkReviewIn,
    EventBulkReviewOut,
    EventCreateIn,
    EventFacetOut,
    EventOut,
    EventReviewIn,
    EventSummaryOut,
)
from app.security import decode_access_token
from app.services.event_bus import event_to_out
from app.storage import delete_files_quietly
from app.timezone import INSTITUTE_TZ, local_now
from app.ws import manager

router = APIRouter(tags=["events"])

SERIOUS = ("o'rta", "yuqori")
REVIEW_STATS_DAYS = 30
MIN_REVIEWS_FOR_PRECISION = 10
FACET_LIMIT = 40

# Operator va rahbar ko'rinishlari faqat ishchi rejimdagi modullar signalini
# ko'radi — sinov signallari (is_trial) navbat va statistikaga aralashmaydi.
OPERATOR_EVENTS = Event.is_trial == false()


def _to_out(event: Event) -> EventOut:
    return event_to_out(event)


def _local_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=INSTITUTE_TZ)


@router.websocket("/ws/events")
async def events_websocket(websocket: WebSocket) -> None:
    """Real-time push for new AI events — replaces the frontend's
    setInterval-based simulation (camera/src/lib/realtime.ts) with an
    actual persistent connection. Auth via ?token=<jwt> since browser
    WebSocket APIs can't set an Authorization header."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decode_access_token(token)
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # no client->server protocol yet; just detect disconnects
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/api/events", response_model=Page[EventOut])
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[CurrentUser, Depends(get_current_user)],
    page_params: Annotated[PageParams, Depends()],
    severity: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    today: Annotated[bool, Query()] = False,
    exclude_modules: Annotated[str | None, Query(alias="excludeModules")] = None,
    hide_rejected: Annotated[bool, Query(alias="hideRejected")] = False,
    module_codes: Annotated[str | None, Query(alias="moduleCodes")] = None,
    building: Annotated[str | None, Query(max_length=200)] = None,
    camera_id: Annotated[str | None, Query(alias="cameraId")] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    sort: Annotated[Literal["newest", "oldest", "severity"], Query()] = "newest",
    trial: Annotated[bool, Query()] = False,
) -> Page[EventOut]:
    # trial=true — faqat sinov rejimidagi modullar signallari (baholash uchun).
    stmt = select(Event).where(Event.is_trial == (true() if trial else false()))
    if severity:
        stmt = stmt.where(Event.severity == severity)
    if status_filter:
        stmt = stmt.where(Event.status == status_filter)
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Event.module_name.ilike(term), Event.camera_name.ilike(term), Event.person_name.ilike(term))
        )
    if exclude_modules:
        # Vergul bilan ajratilgan modul kodlari. Monitoring devoridagi
        # jurnal buni ishlatadi: u operator diqqatini talab qiladigan
        # signallar uchun, ma'lum bir modul esa hozircha faqat shovqin
        # bergani uchun (masalan #25 — u qaysi kamera hovliga qaraganini
        # bilmaydi) uni butun tizimdan o'chirmasdan shu ro'yxatdan
        # olib tashlash kerak bo'ladi.
        codes = [int(c) for c in exclude_modules.split(",") if c.strip().isdigit()]
        if codes:
            stmt = stmt.where(Event.module_code.notin_(codes))
    if module_codes:
        codes = [int(c) for c in module_codes.split(",") if c.strip().isdigit()]
        if codes:
            stmt = stmt.where(Event.module_code.in_(codes))
    if building:
        stmt = stmt.where(Event.building == building)
    if camera_id:
        try:
            stmt = stmt.where(Event.camera_id == uuid.UUID(camera_id))
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Noto'g'ri kamera identifikatori") from None
    if hide_rejected:
        # Operator "yolg'on signal" deb belgilagan hodisa devorga qayta
        # chiqmasligi kerak — aks holda uni har safar qaytadan ko'rib
        # chiqishga to'g'ri keladi.
        stmt = stmt.where(Event.status != "rad_etilgan")
    if today:
        # "Today" means the institute's local calendar day, not UTC's —
        # see app/timezone.py's module docstring for why that distinction
        # is a real bug, not pedantry (near-midnight local time, a plain
        # UTC "today" is off by a day).
        start_of_today = local_now().replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = stmt.where(Event.occurred_at >= start_of_today)
    # Sana oralig'i institut kunlari bo'yicha: [from 00:00, to+1 00:00).
    if date_from:
        stmt = stmt.where(Event.occurred_at >= _local_day_start(date_from))
    if date_to:
        stmt = stmt.where(Event.occurred_at < _local_day_start(date_to + timedelta(days=1)))

    if sort == "oldest":
        stmt = stmt.order_by(Event.occurred_at.asc())
    elif sort == "severity":
        # Ko'rib chiqish navbati: avval yuqori, keyin o'rta, har biri ichida eng yangisi.
        rank = case((Event.severity == "yuqori", 0), (Event.severity == "o'rta", 1), else_=2)
        stmt = stmt.order_by(rank, Event.occurred_at.desc())
    else:
        stmt = stmt.order_by(Event.occurred_at.desc())

    records, total = await paginate(db, stmt, page_params)
    items = [_to_out(e) for e in records]
    return build_page(items, total, page_params)


@router.get("/api/events/summary", response_model=EventSummaryOut)
async def events_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[CurrentUser, Depends(get_current_user)],
) -> EventSummaryOut:
    now = datetime.now(timezone.utc)
    status_counts = dict(
        (await db.execute(select(Event.status, func.count()).where(OPERATOR_EVENTS).group_by(Event.status))).all()
    )
    unreviewed_by_severity = dict(
        (
            await db.execute(
                select(Event.severity, func.count())
                .where(OPERATOR_EVENTS)
                .where(Event.status == "yangi")
                .group_by(Event.severity)
            )
        ).all()
    )
    start_of_today = local_now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_row = (
        await db.execute(
            select(func.count(), func.count().filter(Event.severity.in_(SERIOUS)))
            .where(OPERATOR_EVENTS)
            .where(Event.occurred_at >= start_of_today)
        )
    ).one()
    oldest = await db.scalar(
        select(func.min(Event.occurred_at)).where(OPERATOR_EVENTS).where(Event.status == "yangi")
    )
    stale_serious = (
        await db.scalar(
            select(func.count())
            .select_from(Event)
            .where(OPERATOR_EVENTS)
            .where(Event.status == "yangi")
            .where(Event.severity.in_(SERIOUS))
            .where(Event.occurred_at < now - timedelta(hours=24))
        )
        or 0
    )

    since = now - timedelta(days=REVIEW_STATS_DAYS)
    reviewed_recently = Event.reviewed_at >= since
    review_row = (
        await db.execute(
            select(
                func.avg(func.extract("epoch", Event.reviewed_at - Event.occurred_at)),
                func.count().filter(Event.status == "tasdiqlangan"),
                func.count().filter(Event.status == "rad_etilgan"),
            )
            .where(OPERATOR_EVENTS)
            .where(reviewed_recently)
        )
    ).one()
    avg_seconds, confirmed_recent, rejected_recent = review_row
    reviewed_total = confirmed_recent + rejected_recent

    module_rows = (
        await db.execute(
            select(Event.module_code, Event.module_name, func.count())
            .where(OPERATOR_EVENTS)
            .group_by(Event.module_code, Event.module_name)
            .order_by(func.count().desc())
            .limit(FACET_LIMIT)
        )
    ).all()
    building_rows = (
        await db.execute(
            select(Event.building, func.count())
            .where(OPERATOR_EVENTS)
            .where(Event.building != "")
            .group_by(Event.building)
            .order_by(Event.building)
            .limit(FACET_LIMIT)
        )
    ).all()
    trial_rows = (
        await db.execute(
            select(Event.module_code, Event.module_name, func.count())
            .where(Event.is_trial == true())
            .where(Event.status == "yangi")
            .group_by(Event.module_code, Event.module_name)
            .order_by(func.count().desc())
            .limit(FACET_LIMIT)
        )
    ).all()

    return EventSummaryOut(
        total=sum(status_counts.values()),
        unreviewed=status_counts.get("yangi", 0),
        confirmed=status_counts.get("tasdiqlangan", 0),
        rejected=status_counts.get("rad_etilgan", 0),
        unreviewed_high=unreviewed_by_severity.get("yuqori", 0),
        unreviewed_medium=unreviewed_by_severity.get("o'rta", 0),
        unreviewed_low=unreviewed_by_severity.get("past", 0),
        today=today_row[0],
        today_serious=today_row[1],
        stale_serious_unreviewed=stale_serious,
        oldest_unreviewed_hours=round((now - oldest).total_seconds() / 3600, 1) if oldest else None,
        avg_review_minutes=round(float(avg_seconds) / 60, 1) if avg_seconds is not None else None,
        recent_precision=(
            round(confirmed_recent * 100 / reviewed_total, 1) if reviewed_total >= MIN_REVIEWS_FOR_PRECISION else None
        ),
        modules=[EventFacetOut(value=str(code), label=name, count=count) for code, name, count in module_rows],
        buildings=[EventFacetOut(value=name, label=name, count=count) for name, count in building_rows],
        trial_unreviewed=sum(count for _code, _name, count in trial_rows),
        trial_modules=[EventFacetOut(value=str(code), label=name, count=count) for code, name, count in trial_rows],
    )


@router.post("/api/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreateIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> EventOut:
    result = await db.execute(select(Camera).options(selectinload(Camera.building)).where(Camera.id == body.camera_id))
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kamera topilmadi")

    event = Event(
        camera_id=camera.id,
        camera_name=camera.name,
        building=camera.building.name if camera.building else "",
        module_code=body.module_code,
        module_name=body.module_name,
        group=body.group,
        confidence=body.confidence,
        severity=body.severity,
        person_name=body.person_name,
        status="yangi",
    )
    db.add(event)
    await log_action(db, request, current_user.id, f"Yangi AI hodisa: {body.module_name}", "AI Modullari")
    await db.commit()
    await db.refresh(event)

    out = _to_out(event)
    await manager.broadcast(out.model_dump(by_alias=True))
    return out


@router.post("/api/events/review-bulk", response_model=EventBulkReviewOut)
async def review_events_bulk(
    body: EventBulkReviewIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> EventBulkReviewOut:
    """Bir nechta hodisani bitta tranzaksiyada tasdiqlash yoki rad etish.

    WebSocket'ga bitta yig'ma xabar ketadi ({"kind": "events_reviewed"}),
    har hodisa uchun alohida emas: 200 ta xabar har bir ochiq sahifani
    200 marta qayta yuklatardi."""
    try:
        ids = [uuid.UUID(raw) for raw in dict.fromkeys(body.ids)]
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Noto'g'ri hodisa identifikatori") from None

    reviewer = await db.get(User, current_user.id)
    reviewer_name = reviewer.full_name if reviewer else None
    result = await db.execute(
        update(Event)
        .where(Event.id.in_(ids))
        .values(status=body.status, reviewed_by=reviewer_name, reviewed_at=datetime.now(timezone.utc))
        .returning(Event.id)
    )
    updated_ids = [str(event_id) for event_id in result.scalars().all()]
    await log_action(
        db,
        request,
        current_user.id,
        f"Hodisalarni ommaviy ko'rib chiqdi: {len(updated_ids)} ta — {body.status}",
        "AI Modullari",
    )
    await db.commit()

    if updated_ids:
        await manager.broadcast(
            {"kind": "events_reviewed", "ids": updated_ids, "status": body.status, "reviewedBy": reviewer_name}
        )
    return EventBulkReviewOut(updated=len(updated_ids), skipped=len(ids) - len(updated_ids), status=body.status)


@router.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> None:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hodisa topilmadi")

    snapshot_key = event.snapshot_key
    await log_action(db, request, current_user.id, f"Hodisani o'chirdi: {event.module_name}", "AI Modullari")
    await db.delete(event)
    await db.commit()
    # The row is the source of truth; its snapshot in object storage is
    # derived data that nothing can reach once the row is gone. Deleting
    # it here (best-effort, after the commit) is what keeps MinIO from
    # accumulating unreachable JPEGs forever — see delete_files_quietly.
    await delete_files_quietly([snapshot_key])


@router.patch("/api/events/{event_id}/review", response_model=EventOut)
async def review_event(
    event_id: str,
    body: EventReviewIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> EventOut:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hodisa topilmadi")

    event.status = body.status
    reviewer = await db.get(User, current_user.id)
    event.reviewed_by = reviewer.full_name if reviewer else None
    event.reviewed_at = datetime.now(timezone.utc)

    await log_action(db, request, current_user.id, f"Hodisani ko'rib chiqdi: {body.status}", "AI Modullari")
    await db.commit()
    await db.refresh(event)

    out = _to_out(event)
    # Sinov signali operator sahifalariga umuman kelmagan — uning bahosini ham yubormaymiz.
    if not event.is_trial:
        await manager.broadcast(out.model_dump(by_alias=True))
    return out
