"""Attendance calendar endpoints.

Rows here are written two ways: manually via POST /api/attendance below
(an admin correcting or backfilling a record), and automatically by
app/jobs/attendance_ai.py (TT kriteriya 6 "Xodim/o'qituvchi davomati", 7
"Talaba davomati", 8 "Darsga kechikish") firing a check-in/check-out on
each face match against a live camera. Both paths write the same table
through the same upsert-by-(person,date) shape, so a day's row never cares
which one produced it.
"""

import uuid
from collections import defaultdict
from datetime import date as date_type
from datetime import datetime, timedelta
from datetime import time as time_type
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import AttendanceRecord, PresenceVisit, StudentStaff
from app.schemas.attendance import (
    AttendanceDayOut,
    AttendanceMonthOut,
    AttendancePersonOut,
    AttendanceRecordIn,
    AttendanceSummaryOut,
)
from app.storage import presigned_url
from app.timezone import INSTITUTE_TZ, INSTITUTE_TZ_NAME, local_now
from app.utils import compute_initials

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

PRESENT_STATUSES = ("keldi", "kech_keldi")
MAX_SUMMARY_MONTHS = 12

# Kalendarni o'qish hisobot sahifasidan ham kerak (odamning kuni).
ReadDep = Annotated[CurrentUser, Depends(require_permission("manageAttendance", "viewReports"))]
# Yozuvni qo'lda qo'yish yoki o'chirish — faqat davomat huquqi bilan.
EditDep = Annotated[CurrentUser, Depends(require_permission("manageAttendance"))]


def _parse_time(value: str | None) -> time_type | None:
    if value is None:
        return None
    try:
        return time_type.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"'{value}' — vaqt 'HH:MM' formatida bo'lishi kerak") from exc


def _person_uuid(value: str) -> uuid.UUID:
    """Noto'g'ri identifikator — bazaga yetib borib 500 bermasin, 404 bo'lsin."""
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Talaba/xodim topilmadi") from None


def _month_start(month: str) -> date_type:
    try:
        year_part, month_part = month.split("-")
        return date_type(int(year_part), int(month_part), 1)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "month 'YYYY-MM' formatida bo'lishi kerak") from exc


def _add_months(first: date_type, count: int) -> date_type:
    index = first.year * 12 + first.month - 1 + count
    return date_type(index // 12, index % 12 + 1, 1)


def _minutes(value: time_type) -> float:
    return value.hour * 60 + value.minute + value.second / 60


# Chiqish kamerasidagi ko'rinishdan keyin shu oraliq ichidagi boshqa
# ko'rinishlar "keyin ham binoda edi" hisoblanmaydi: odam eshikdan chiqib
# ketayotganda uni yonidagi koridor kamerasi ham bir lahza ko'rishi mumkin.
EXIT_SIGHTING_TOLERANCE = timedelta(minutes=2)


def _is_early_leave(
    record: AttendanceRecord,
    last_seen: time_type | None = None,
    *,
    now: datetime | None = None,
) -> bool:
    """TT kriteriya 9 — pure rule-based, no extra model: present (keldi/
    kech_keldi) with a recorded check_out earlier than the configured
    end-of-day cutoff. A day with no check_out at all (still "present",
    just never re-sighted after check-in) is deliberately NOT flagged —
    that's an absence-of-data case, not evidence of leaving early.

    Also requires check_out to be at least attendance_early_leave_min_
    presence_minutes after check_in — without continuous multi-camera
    tracking (see attendance_ai.py's module docstring), a check_out just
    seconds/minutes after check_in almost always means "one camera caught
    them once, briefly, and never saw them again," not "present for a
    while, then genuinely left early." A real early-leave implies they
    were actually there for some stretch of the day first.

    Ikki qo'shimcha shart (2026-09-17, productionda topilgan):

    * Kun tugamaguncha hukm chiqarilmaydi. Soat 15:50 da oxirgi chiqish
      15:02 bo'lsa, odam hali binoda bo'lishi mumkin — bugun cutoff
      o'tmaguncha "erta ketdi" qo'yilmaydi.
    * Chiqish kunning OXIRGI ko'rinishi bo'lishi kerak. Barcha kirish
      eshiklari chiqish ham bo'lgani uchun tushlikka chiqib-kirish ham
      check_out ni yangilaydi. `last_seen` — o'sha kuni istalgan kamera
      odamni oxirgi marta ko'rgan payt (app/models/presence_visit.py);
      u check_out dan sezilarli keyin bo'lsa, odam chiqib ketmagan.
      None — ma'lumot yo'q (masalan qo'lda kiritilgan yozuv): check_out
      o'zi hal qiladi."""
    if record.status not in PRESENT_STATUSES or record.check_out is None or record.check_in is None:
        return False
    cutoff = time_type.fromisoformat(settings.attendance_early_leave_cutoff)
    if record.check_out >= cutoff:
        return False
    current = now or local_now()
    if record.date >= current.date() and current.time() < cutoff:
        return False
    if last_seen is not None:
        exit_moment = datetime.combine(record.date, record.check_out)
        if datetime.combine(record.date, last_seen) > exit_moment + EXIT_SIGHTING_TOLERANCE:
            return False
    presence_minutes = (
        datetime.combine(date_type.min, record.check_out) - datetime.combine(date_type.min, record.check_in)
    ).total_seconds() / 60
    return presence_minutes >= settings.attendance_early_leave_min_presence_minutes


async def _last_seen_by_day(
    db: AsyncSession, person_id: uuid.UUID, first: date_type, end: date_type
) -> dict[date_type, time_type]:
    """[first, end) oralig'idagi har bir kun uchun odamni istalgan kamera
    oxirgi marta ko'rgan payt (institut vaqti) — bitta GROUP BY so'rovi."""
    start_at = datetime.combine(first, time_type.min, tzinfo=INSTITUTE_TZ)
    end_at = datetime.combine(end, time_type.min, tzinfo=INSTITUTE_TZ)
    local_last_seen = func.timezone(INSTITUTE_TZ_NAME, PresenceVisit.last_seen_at)
    rows = await db.execute(
        select(func.date(local_last_seen), func.max(local_last_seen))
        .where(PresenceVisit.student_staff_id == person_id)
        .where(PresenceVisit.last_seen_at >= start_at)
        .where(PresenceVisit.last_seen_at < end_at)
        .group_by(func.date(local_last_seen))
    )
    return {day: moment.time().replace(microsecond=0) for day, moment in rows.all()}


def _to_out(record: AttendanceRecord, last_seen: time_type | None = None) -> AttendanceDayOut:
    return AttendanceDayOut(
        date=record.date.isoformat(),
        status=record.status,
        check_in=record.check_in.strftime("%H:%M") if record.check_in else None,
        check_out=record.check_out.strftime("%H:%M") if record.check_out else None,
        early_leave=_is_early_leave(record, last_seen),
    )


def _month_summary(
    month: str, records: list[AttendanceRecord], last_seen: dict[date_type, time_type] | None = None
) -> AttendanceMonthOut:
    counted = [r for r in records if r.status != "dam_olish"]
    present = sum(r.status == "keldi" for r in counted)
    late = sum(r.status == "kech_keldi" for r in counted)
    attended = [r for r in counted if r.status in PRESENT_STATUSES]
    arrivals = [_minutes(r.check_in) for r in attended if r.check_in]
    stays = [
        _minutes(r.check_out) - _minutes(r.check_in)
        for r in attended
        if r.check_in and r.check_out and r.check_out > r.check_in
    ]
    avg_arrival = round(sum(arrivals) / len(arrivals)) if arrivals else None
    return AttendanceMonthOut(
        month=month,
        recorded_days=len(counted),
        present=present,
        late=late,
        absent=sum(r.status == "kelmadi" for r in counted),
        early_leave=sum(_is_early_leave(r, (last_seen or {}).get(r.date)) for r in counted),
        rate=round((present + late) * 100 / len(counted), 1) if counted else None,
        avg_arrival=f"{avg_arrival // 60:02d}:{avg_arrival % 60:02d}" if avg_arrival is not None else None,
        avg_presence_minutes=round(sum(stays) / len(stays)) if stays else None,
    )


@router.get("/{student_staff_id}", response_model=list[AttendanceDayOut])
async def get_attendance_calendar(
    student_staff_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: ReadDep,
    month: Annotated[str, Query(description="YYYY-MM")],
) -> list[AttendanceDayOut]:
    person_id = _person_uuid(student_staff_id)
    first = _month_start(month)
    # Sana oralig'i: (odam, sana) unikal indeksi to'g'ridan-to'g'ri o'qiladi.
    # extract(year/month) esa odamning har bir yozuvini hisoblab chiqardi.
    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.student_staff_id == person_id)
        .where(AttendanceRecord.date >= first)
        .where(AttendanceRecord.date < _add_months(first, 1))
        .order_by(AttendanceRecord.date)
    )
    result = await db.execute(stmt)
    last_seen = await _last_seen_by_day(db, person_id, first, _add_months(first, 1))
    return [_to_out(r, last_seen.get(r.date)) for r in result.scalars().all()]


@router.get("/{student_staff_id}/summary", response_model=AttendanceSummaryOut)
async def get_attendance_summary(
    student_staff_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: ReadDep,
    months: Annotated[int, Query(ge=1, le=MAX_SUMMARY_MONTHS)] = 6,
) -> AttendanceSummaryOut:
    """Odam kartasi va joriy oy bilan birga oxirgi N oy yig'indisi —
    kalendar sahifasining tepasi va trend grafigi bitta so'rovda."""
    from app.jobs.absence_marker import _working_weekdays

    person = (
        await db.execute(
            select(StudentStaff)
            .options(selectinload(StudentStaff.faculty))
            .where(StudentStaff.id == _person_uuid(student_staff_id))
        )
    ).scalar_one_or_none()
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Talaba/xodim topilmadi")

    current = local_now().date().replace(day=1)
    first = _add_months(current, -(months - 1))
    records = (
        await db.execute(
            select(AttendanceRecord)
            .where(AttendanceRecord.student_staff_id == person.id)
            .where(AttendanceRecord.date >= first)
            .where(AttendanceRecord.date < _add_months(current, 1))
        )
    ).scalars().all()

    last_seen = await _last_seen_by_day(db, person.id, first, _add_months(current, 1))
    by_month: dict[str, list[AttendanceRecord]] = defaultdict(list)
    for record in records:
        by_month[record.date.strftime("%Y-%m")].append(record)
    keys = [_add_months(first, i).strftime("%Y-%m") for i in range(months)]

    return AttendanceSummaryOut(
        person=AttendancePersonOut(
            id=str(person.id),
            full_name=person.full_name,
            type=person.type,
            faculty=person.faculty.name if person.faculty else "",
            unit=person.group_or_position,
            biometrics_status=person.biometrics_status,
            initials=compute_initials(person.full_name),
            biometric_photo_url=presigned_url(person.biometric_photo_key) if person.biometric_photo_key else None,
        ),
        months=[_month_summary(key, by_month.get(key, []), last_seen) for key in keys],
        working_weekdays=sorted(_working_weekdays()),
    )


@router.post("", response_model=AttendanceDayOut, status_code=status.HTTP_201_CREATED)
async def record_attendance(
    body: AttendanceRecordIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: EditDep,
) -> AttendanceDayOut:
    person = await db.get(StudentStaff, _person_uuid(body.student_staff_id))
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Talaba/xodim topilmadi")

    try:
        record_date = date_type.fromisoformat(body.date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date 'YYYY-MM-DD' formatida bo'lishi kerak") from exc

    check_in = _parse_time(body.check_in)
    check_out = _parse_time(body.check_out)

    # Upsert: one row per (person, date) — re-recording the same day (e.g. a
    # corrected check-out time) updates in place instead of erroring.
    stmt = (
        insert(AttendanceRecord)
        .values(
            student_staff_id=person.id,
            date=record_date,
            status=body.status,
            check_in=check_in,
            check_out=check_out,
        )
        .on_conflict_do_update(
            index_elements=[AttendanceRecord.student_staff_id, AttendanceRecord.date],
            set_={"status": body.status, "check_in": check_in, "check_out": check_out},
        )
        .returning(AttendanceRecord)
    )
    result = await db.execute(stmt)
    record = result.scalar_one()

    await log_action(
        db, request, current_user.id, f"Davomat qayd etdi: {person.full_name} ({body.date})", "Talabalar"
    )
    await db.commit()
    return _to_out(record)


@router.delete("/{student_staff_id}/{date}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance_record(
    student_staff_id: str,
    date: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: EditDep,
) -> None:
    person_id = _person_uuid(student_staff_id)
    try:
        date_value = date_type.fromisoformat(date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date 'YYYY-MM-DD' formatida bo'lishi kerak") from exc

    result = await db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.student_staff_id == person_id)
        .where(AttendanceRecord.date == date_value)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Davomat yozuvi topilmadi")

    person = await db.get(StudentStaff, person_id)
    await log_action(
        db, request, current_user.id,
        f"Davomat yozuvini o'chirdi: {person.full_name if person else student_staff_id} ({date})", "Talabalar"
    )
    await db.delete(record)
    await db.commit()
