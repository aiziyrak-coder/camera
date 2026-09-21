"""Ruxsatli nazoratchi uchun shaxsning oxirgi kamera kuzatuvi.

Bu "hozir qayerda" degan mutlaq da'vo qilmaydi: kamera odamni oxirgi
qachon va qayerda ko'rganini qaytaradi. Qidiruv POST bo'lgani uchun ism
brauzer tarixi va reverse-proxy URL loglariga tushmaydi.
"""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import Building, Camera, PresenceVisit, StudentStaff
from app.schemas.person_locator import PersonLocationOut, PersonLocationSearchIn
from app.timezone import local_now

router = APIRouter(prefix="/api/person-locator", tags=["person-locator"])
ReadDep = Annotated[CurrentUser, Depends(require_permission("viewLive"))]


def _initials(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper() or "?"


@router.post("/search", response_model=list[PersonLocationOut])
async def search_person_location(
    body: PersonLocationSearchIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: ReadDep,
) -> list[PersonLocationOut]:
    """Ism bo'yicha faqat faol shaxslar va ularning eng so'nggi tashrifini qaytaradi."""
    latest = (
        select(
            PresenceVisit.student_staff_id.label("person_id"),
            PresenceVisit.camera_id.label("camera_id"),
            PresenceVisit.last_seen_at.label("last_seen_at"),
            func.row_number()
            .over(partition_by=PresenceVisit.student_staff_id, order_by=PresenceVisit.last_seen_at.desc())
            .label("rank"),
        )
        .subquery()
    )
    terms = [term for term in body.query.split() if term]
    stmt = (
        select(StudentStaff, latest.c.camera_id, latest.c.last_seen_at, Camera.name, Building.name, Camera.floor, Camera.zone)
        .outerjoin(latest, and_(latest.c.person_id == StudentStaff.id, latest.c.rank == 1))
        .outerjoin(Camera, Camera.id == latest.c.camera_id)
        .outerjoin(Building, Building.id == Camera.building_id)
        .where(StudentStaff.active.is_(True))
        .order_by(StudentStaff.full_name.asc())
        .limit(body.limit)
    )
    for term in terms:
        stmt = stmt.where(StudentStaff.full_name.ilike(f"%{term}%"))

    now = local_now()
    rows = (await db.execute(stmt)).all()
    return [
        PersonLocationOut(
            id=str(person.id),
            full_name=person.full_name,
            type=person.type,
            faculty=person.faculty.name if person.faculty else None,
            group_or_position=person.group_or_position,
            initials=_initials(person.full_name),
            camera_id=str(camera_id) if camera_id else None,
            camera_name=camera_name,
            building=building_name,
            floor=floor,
            zone=zone,
            last_seen_at=last_seen_at,
            currently_visible=bool(last_seen_at and last_seen_at >= now - timedelta(minutes=5)),
        )
        for person, camera_id, last_seen_at, camera_name, building_name, floor, zone in rows
    ]
