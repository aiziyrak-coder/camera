"""Kunduzgi notanish yuzlar — /api/notanishlar.

Ko'rib chiqish oqimi uchun: ro'yxat, "talaba" (odamga biriktirish),
"begona" (hodisa) va "o'tkazish". Mantiq app/services/unknown_sightings.py
da; bu yerda faqat HTTP, huquq va audit.
"""

import uuid
from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import Camera, StudentStaff, UnknownSighting
from app.schemas.base import CamelModel
from app.services.unknown_sightings import ResolveError, assign_to_person, dismiss, mark_stranger
from app.timezone import local_now

router = APIRouter(prefix="/api/notanishlar", tags=["notanishlar"])

ReviewDep = Annotated[CurrentUser, Depends(require_permission("reviewEvents"))]

STATUSES = ("kutilmoqda", "talaba", "begona", "otkazildi")


class SightingOut(CamelModel):
    id: str
    day: str
    camera_id: str | None
    camera_name: str | None
    first_seen_at: str
    last_seen_at: str
    hits: int
    crop_url: str | None
    face_px: int
    closest_similarity: float | None
    status: str
    person_id: str | None
    person_name: str | None


class SightingListOut(CamelModel):
    items: list[SightingOut]
    total: int
    pending: int
    day: str


class AssignIn(CamelModel):
    person_id: str


class ResolveOut(CamelModel):
    item: SightingOut
    message: str


def _to_out(row: UnknownSighting, camera_name: str | None, person_name: str | None) -> SightingOut:
    from app.storage import presigned_url

    crop_url = None
    if row.crop_key:
        try:
            crop_url = presigned_url(row.crop_key)
        except Exception:
            crop_url = None
    return SightingOut(
        id=str(row.id),
        day=row.day.isoformat(),
        camera_id=str(row.camera_id) if row.camera_id else None,
        camera_name=camera_name,
        first_seen_at=row.first_seen_at.isoformat(),
        last_seen_at=row.last_seen_at.isoformat(),
        hits=row.hits,
        crop_url=crop_url,
        face_px=row.face_px,
        closest_similarity=row.closest_similarity,
        status=row.status,
        person_id=str(row.person_id) if row.person_id else None,
        person_name=person_name,
    )


async def _names(db: AsyncSession, row: UnknownSighting) -> tuple[str | None, str | None]:
    camera = await db.get(Camera, row.camera_id) if row.camera_id else None
    person = await db.get(StudentStaff, row.person_id) if row.person_id else None
    return (camera.name if camera else None, person.full_name if person else None)


def _parse_day(value: str | None) -> date_type:
    if not value:
        return local_now().date()
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak")


@router.get("", response_model=SightingListOut)
async def list_sightings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: ReviewDep,
    sana: Annotated[str | None, Query()] = None,
    holat: Annotated[str, Query()] = "kutilmoqda",
    limit: Annotated[int, Query(ge=1, le=300)] = 120,
) -> SightingListOut:
    """Bir kunlik notanish yuzlar. Standart — bugungi, ko'rib chiqilmaganlar;
    eng ko'p ko'ringani birinchi (tez-tez keladigan odam — ehtimol talaba)."""
    day = _parse_day(sana)
    if holat not in (*STATUSES, "hammasi"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Noma'lum holat")

    query = (
        select(UnknownSighting, Camera.name, StudentStaff.full_name)
        .outerjoin(Camera, Camera.id == UnknownSighting.camera_id)
        .outerjoin(StudentStaff, StudentStaff.id == UnknownSighting.person_id)
        .where(UnknownSighting.day == day)
    )
    if holat != "hammasi":
        query = query.where(UnknownSighting.status == holat)
    rows = (
        await db.execute(query.order_by(UnknownSighting.hits.desc(), UnknownSighting.last_seen_at.desc()).limit(limit))
    ).all()

    total_query = select(func.count()).select_from(UnknownSighting).where(UnknownSighting.day == day)
    if holat != "hammasi":
        total_query = total_query.where(UnknownSighting.status == holat)
    total = int((await db.execute(total_query)).scalar_one())
    pending = int(
        (
            await db.execute(
                select(func.count())
                .select_from(UnknownSighting)
                .where(UnknownSighting.day == day, UnknownSighting.status == "kutilmoqda")
            )
        ).scalar_one()
    )
    return SightingListOut(
        items=[_to_out(row, camera_name, person_name) for row, camera_name, person_name in rows],
        total=total,
        pending=pending,
        day=day.isoformat(),
    )


async def _load(db: AsyncSession, sighting_id: str) -> UnknownSighting:
    try:
        key = uuid.UUID(sighting_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yozuv topilmadi")
    row = await db.get(UnknownSighting, key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yozuv topilmadi")
    return row


@router.post("/{sighting_id}/talaba", response_model=ResolveOut)
async def resolve_as_person(
    sighting_id: str,
    body: AssignIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: ReviewDep,
) -> ResolveOut:
    """Yuzni tanlangan odamga biriktiradi — keyingi safar kamera uni taniydi."""
    row = await _load(db, sighting_id)
    try:
        person = await db.get(StudentStaff, uuid.UUID(body.person_id))
    except ValueError:
        person = None
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Odam topilmadi")
    try:
        kind = await assign_to_person(db, row, person, current_user.id)
    except ResolveError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    await log_action(
        db, request, current_user.id, f"Notanish yuz {person.full_name} ga biriktirildi ({kind})", "Xavfsizlik"
    )
    await db.commit()
    camera_name, person_name = await _names(db, row)
    message = (
        f"{person.full_name}: yuzi tizimga kiritildi — endi kamera uni taniydi"
        if kind == "asosiy"
        else f"{person.full_name}: yangi yuz namunasi qo'shildi"
    )
    return ResolveOut(item=_to_out(row, camera_name, person_name), message=message)


@router.post("/{sighting_id}/begona", response_model=ResolveOut)
async def resolve_as_stranger(
    sighting_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: ReviewDep,
) -> ResolveOut:
    """Haqiqiy begona — #1 hodisa yaratiladi."""
    row = await _load(db, sighting_id)
    try:
        await mark_stranger(db, row, current_user.id)
    except ResolveError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    await log_action(db, request, current_user.id, "Notanish yuz begona deb tasdiqlandi", "Xavfsizlik")
    await db.commit()
    camera_name, person_name = await _names(db, row)
    return ResolveOut(item=_to_out(row, camera_name, person_name), message="Begona shaxs — hodisa yaratildi")


@router.post("/{sighting_id}/otkazish", response_model=ResolveOut)
async def resolve_as_dismissed(
    sighting_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: ReviewDep,
) -> ResolveOut:
    row = await _load(db, sighting_id)
    try:
        dismiss(row, current_user.id)
    except ResolveError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    await db.commit()
    camera_name, person_name = await _names(db, row)
    return ResolveOut(item=_to_out(row, camera_name, person_name), message="O'tkazib yuborildi")
