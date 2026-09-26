"""Jadval bo'yicha kim qayerda — /api/jadval (app/services/schedule_presence.py)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.schemas.base import CamelModel
from app.services.schedule_presence import board_workbook, day_board
from app.timezone import business_date, local_now
from app.timezone import business_today

router = APIRouter(prefix="/api/jadval", tags=["dars-jadvali"])
ReadDep = Annotated[CurrentUser, Depends(require_permission("manageLessons", "manageAttendance", "viewReports"))]


class BoardRowOut(CamelModel):
    id: str
    start: str | None
    end: str | None
    group: str
    subject: str
    faculty: str
    teacher: str
    teacher_id: str | None
    auditorium: str | None
    building: str | None
    camera_id: str | None
    camera_name: str | None
    # "xonada" | "binoda" | "kelmagan" | None (o'qituvchi bog'lanmagan)
    teacher_status: str | None
    students_expected: int
    students_arrived: int
    students_in_room: int | None


class BoardOut(CamelModel):
    day: str
    now: bool
    items: list[BoardRowOut]


def _day(sana: str | None) -> date:
    if not sana:
        return business_today()
    try:
        return date.fromisoformat(sana)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sana noto'g'ri (YYYY-MM-DD)") from None


@router.get("/kun", response_model=BoardOut)
async def get_day_board(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: ReadDep,
    sana: Annotated[str | None, Query()] = None,
    hozir: Annotated[bool, Query()] = False,
) -> BoardOut:
    """Kun darslari: kim qayerda bo'lishi kerak va kamera kimni ko'rdi.
    `hozir=true` — faqat hozir davom etayotgan darslar (bugun)."""
    day = _day(sana)
    now = local_now()
    rows = await day_board(db, day, at=now if hozir and day == business_date(now) else None)
    return BoardOut(
        day=day.isoformat(),
        now=hozir,
        items=[
            BoardRowOut(
                **{
                    **row.__dict__,
                    "id": str(row.id),
                    "start": row.start.isoformat() if row.start else None,
                    "end": row.end.isoformat() if row.end else None,
                    "teacher_id": str(row.teacher_id) if row.teacher_id else None,
                    "camera_id": str(row.camera_id) if row.camera_id else None,
                }
            )
            for row in rows
        ],
    )


@router.get("/kun.xlsx")
async def export_day_board(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: ReadDep,
    sana: Annotated[str | None, Query()] = None,
) -> Response:
    day = _day(sana)
    data = board_workbook(day, await day_board(db, day))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="jadval-davomat-{day.isoformat()}.xlsx"'},
    )
