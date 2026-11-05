"""Darslar bo'yicha davomat jadvali — hisobotlar sahifasining pastki jadvali.

Qatorlar — odamlar (talabalar yoki dars o'tadigan o'qituvchilar), ustunlar:
  * bitta kun tanlansa — o'sha kunning juftliklari (08:00, 09:30, ...):
    katakda shu juftlikdagi darsning holati (fan, xona, kelgan payti);
  * bir necha kun — kunlar: katakda o'sha kungi darslardan nechtasiga
    kelgani (masalan 3/4).

Holatlar: keldi | kech_keldi | kelmadi | olchanmadi (dars kamera
ko'rmaydigan xonada yoki tahlil hali yetib kelmagan) | kutilmoqda (dars
hali tugamagan). Talaba holati — kunlik video tahlilning dars natijasi
(LessonAttendance); o'qituvchiniki — darsga kirish vaqti (LessonSession).

Filtrlar hisobot bilan bir xil (app/services/hisobot.py Filters); `status`
— "aqlli filtr": faqat kelmaganlar, kechikkanlar, to'liq qatnashganlar yoki
o'lchanmaganlar. Har holat bo'yicha sonlar ham qaytadi (filtr tugmalari).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date as date_type, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import LessonAttendance, LessonSession
from app.services import hisobot, situation as svc
from app.timezone import to_local

MAX_DAYS = 31
STATUSES = ("keldi", "kech_keldi", "kelmadi", "olchanmadi", "kutilmoqda")
FILTERS = ("hammasi", "kelmadi", "kech_keldi", "toliq", "yuzsiz", "olchanmadi")
SORTS = ("guruh", "ism", "kelmadi")
_CHUNK = 5000
WEEKDAYS = ("Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya")
LESSON_COLUMNS = (
    LessonSession.id,
    LessonSession.date,
    LessonSession.scheduled_start_time,
    LessonSession.scheduled_end_time,
    LessonSession.group_name,
    LessonSession.subject,
    LessonSession.auditorium,
    LessonSession.camera_id,
)


def lesson_group_key(name: str | None) -> str:
    """Jadvaldagi guruh nomi -> talabaning guruh kaliti: "M-626 (Rentgen)" -> "m-626"."""
    base = (name or "").split(" (")[0]
    return svc.norm_name(base).replace(" ", "")


def student_group_key(raw: str | None) -> str:
    _course, group = hisobot.student_course_group(raw)
    return svc.norm_name(group).replace(" ", "")


# app/services/situation.py teacher_status -> jadval holati.
TEACHER_STATUS = {
    "oz_vaqtida": "keldi",
    "kechikdi": "kech_keldi",
    "kelmadi": "kelmadi",
    "kutilmoqda": "kutilmoqda",
    "nomalum": "olchanmadi",
}


@dataclass
class Totals:
    lessons: int = 0
    keldi: int = 0
    kech_keldi: int = 0
    kelmadi: int = 0
    olchanmadi: int = 0
    kutilmoqda: int = 0

    def add(self, status: str) -> None:
        self.lessons += 1
        setattr(self, status, getattr(self, status) + 1)

    @property
    def attended(self) -> int:
        return self.keldi + self.kech_keldi

    def rate(self) -> float | None:
        measured = self.attended + self.kelmadi
        return round(100 * self.attended / measured, 1) if measured else None

    def out(self) -> dict:
        return {
            "lessons": self.lessons,
            "attended": self.attended,
            "late": self.kech_keldi,
            "absent": self.kelmadi,
            "unmeasured": self.olchanmadi,
            "pending": self.kutilmoqda,
            "rate": self.rate(),
        }


@dataclass
class Row:
    member: hisobot.Member
    cells: dict[str, dict] = field(default_factory=dict)
    totals: Totals = field(default_factory=Totals)


def matches(row: "Row", wanted: str) -> bool:
    totals = row.totals
    if wanted == "kelmadi":
        return totals.kelmadi > 0
    if wanted == "kech_keldi":
        return totals.kech_keldi > 0
    if wanted == "toliq":
        # O'lchangan darslarning hammasida bo'lgan. Hali tugamagan yoki kamera
        # ko'rmagan darslar bunga xalaqit bermaydi — ilgari bugun ertalab
        # hech kim "to'liq" bo'lmasdi.
        return totals.attended > 0 and totals.kelmadi == 0
    if wanted == "yuzsiz":
        return not row.member.enrolled
    if wanted == "olchanmadi":
        return totals.olchanmadi > 0
    return True


def _cell(lesson_id, start: datetime | None, end: datetime | None, subject: str | None, room: str | None,
          status: str, first_seen: datetime | None, detail: str | None, camera: bool) -> dict:
    return {
        "status": status,
        "lesson_id": str(lesson_id),
        "subject": subject,
        "room": room,
        "start": svc.hm(start),
        "end": svc.hm(end),
        "first_seen": svc.hm(first_seen),
        "detail": detail,
        "camera": camera,
    }


def _merge_day_cell(cell: dict | None, status: str) -> dict:
    cell = cell or {"status": None, "lessons": 0, "attended": 0, "late": 0, "absent": 0, "unmeasured": 0, "pending": 0}
    cell["lessons"] += 1
    if status in ("keldi", "kech_keldi"):
        cell["attended"] += 1
    if status == "kech_keldi":
        cell["late"] += 1
    elif status == "kelmadi":
        cell["absent"] += 1
    elif status == "olchanmadi":
        cell["unmeasured"] += 1
    elif status == "kutilmoqda":
        cell["pending"] += 1
    # Kun katagining umumiy holati — eng yomoni.
    if cell["absent"]:
        cell["status"] = "kelmadi"
    elif cell["late"]:
        cell["status"] = "kech_keldi"
    elif cell["attended"]:
        cell["status"] = "keldi"
    elif cell["pending"]:
        cell["status"] = "kutilmoqda"
    else:
        cell["status"] = "olchanmadi"
    return cell


async def _attendance(db: AsyncSession, lesson_ids: list[uuid.UUID], person_ids: set[uuid.UUID]) -> dict:
    out: dict[tuple[uuid.UUID, uuid.UUID], tuple[str | None, datetime | None]] = {}
    for start in range(0, len(lesson_ids), _CHUNK):
        rows = await db.execute(
            select(LessonAttendance.lesson_session_id, LessonAttendance.student_staff_id, LessonAttendance.status,
                   LessonAttendance.first_seen_at)
            .where(LessonAttendance.lesson_session_id.in_(lesson_ids[start:start + _CHUNK]))
        )
        for lesson_id, person_id, status, first_seen in rows.all():
            if person_id in person_ids:
                out[(lesson_id, person_id)] = (status, first_seen)
    return out


@dataclass
class Computed:
    rows: list[Row]
    columns: list[dict]
    members: int
    units: dict[uuid.UUID, str]


async def _compute(db: AsyncSession, kind: str, start: date_type, end: date_type, f: hisobot.Filters,
                   now: datetime) -> Computed:
    single_day = start == end
    ctx = await hisobot.context(db, kind, start, end, f)
    members = ctx.members
    unit_label = hisobot.unit_label_fn(ctx)
    rows: dict[uuid.UUID, Row] = {}
    if kind == "talaba":
        lessons = (
            await db.execute(
                select(*LESSON_COLUMNS)
                .where(LessonSession.date.between(start, end))
                .where(LessonSession.scheduled_start_time.is_not(None))
                .order_by(LessonSession.date, LessonSession.scheduled_start_time)
            )
        ).all()
        by_group: dict[str, list] = {}
        for lesson in lessons:
            by_group.setdefault(lesson_group_key(lesson.group_name), []).append(lesson)
        member_lessons = {m.id: by_group.get(student_group_key(m.raw), []) for m in members}
        wanted_ids = [lesson.id for items in member_lessons.values() for lesson in items]
        attendance = await _attendance(db, list(dict.fromkeys(wanted_ids)), {m.id for m in members})
        for m in members:
            items = member_lessons[m.id]
            if not items:
                continue
            row = Row(m)
            for lesson in items:
                lesson_end = lesson.scheduled_end_time or lesson.scheduled_start_time + timedelta(
                    minutes=settings.lesson_duration_minutes
                )
                evaluated = (lesson.id, m.id) in attendance
                state, first_seen = attendance.get((lesson.id, m.id), (None, None))
                if state not in ("keldi", "kech_keldi", "kelmadi"):
                    state = "kutilmoqda" if lesson_end > now else "olchanmadi"
                if not m.enrolled:
                    detail = "Yuzi kiritilmagan — kamera taniy olmaydi"
                elif evaluated and state == "olchanmadi":
                    # Dars baholangan, lekin xonadagi yuzlarning ko'pi tanilmagan
                    # yoki talaba bir marta noaniq ko'ringan (app/batch/rules.py).
                    detail = "Kamera aniq tanimadi — «kelmadi» deb yozilmadi"
                elif not lesson.camera_id:
                    detail = "Xonaga kamera bog'lanmagan"
                else:
                    detail = None
                cell = _cell(lesson.id, lesson.scheduled_start_time, lesson_end, lesson.subject, lesson.auditorium,
                             state, first_seen, detail, lesson.camera_id is not None)
                _place(row, lesson.date, svc.hm(lesson.scheduled_start_time) or "—", state, cell, single_day)
            rows[m.id] = row
    else:
        member_ids = {m.id: m for m in members}
        taught = await svc.fetch_lessons(
            db, LessonSession.date.between(start, end), LessonSession.teacher_id.in_(list(member_ids))
        ) if member_ids else []
        duration = timedelta(minutes=settings.lesson_duration_minutes)
        for lesson in taught:
            m = member_ids.get(lesson.teacher_id)
            if m is None or lesson.start is None:
                continue
            row = rows.setdefault(m.id, Row(m))
            state = TEACHER_STATUS.get(svc.teacher_status(lesson, now), "olchanmadi")
            cell = _cell(lesson.id, lesson.start, lesson.start + duration, lesson.subject, lesson.room, state,
                         lesson.teacher_arrived, lesson.group_name, lesson.camera_id is not None)
            _place(row, lesson.date, svc.hm(lesson.start) or "—", state, cell, single_day)

    if single_day:
        slot_names = sorted({key for row in rows.values() for key in row.cells})
        columns = [{"key": key, "label": f"{i + 1}-juftlik", "sub": key} for i, key in enumerate(slot_names)]
    else:
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        columns = [{"key": d.isoformat(), "label": d.strftime("%d.%m"), "sub": WEEKDAYS[d.weekday()]} for d in days]
    return Computed(list(rows.values()), columns, len(members), {m.id: unit_label(m) for m in members})


async def build(
    db: AsyncSession,
    kind: str,
    start: date_type,
    end: date_type,
    f: hisobot.Filters,
    *,
    status: str = "hammasi",
    sort: str = "guruh",
    page: int = 1,
    page_size: int = 50,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    if (end - start).days + 1 > MAX_DAYS:
        start = end - timedelta(days=MAX_DAYS - 1)
    status = status if status in FILTERS else "hammasi"
    sort = sort if sort in SORTS else "guruh"
    # Holat tugmasi, tartib va sahifa almashganda jadval qayta hisoblanmaydi:
    # butun universitet bo'yicha ~2 s — ilgari har bosishda shuncha kutilardi
    # va tugma "ishlamayotgandek" ko'rinardi (2026-11-04).
    key = ("lesson_grid", kind, start, end, f.faculty, f.course, f.group, f.unit_kind, f.unit, f.q)
    data: Computed = await svc.cached(key, lambda: _compute(db, kind, start, end, f, now))

    counts = {key: 0 for key in FILTERS}
    for row in data.rows:
        for name in FILTERS:
            if matches(row, name):
                counts[name] += 1
    selected = [row for row in data.rows if matches(row, status)]
    unit_of = lambda r: data.units.get(r.member.id, "")  # noqa: E731
    if sort == "ism":
        selected.sort(key=lambda r: svc.norm_name(r.member.name))
    elif sort == "kelmadi":
        selected.sort(key=lambda r: (-r.totals.kelmadi, -r.totals.kech_keldi, svc.norm_name(r.member.name)))
    else:
        selected.sort(key=lambda r: (svc.norm_name(unit_of(r)), svc.norm_name(r.member.name)))

    page = max(1, page)
    page_size = max(10, min(200, page_size))
    chunk = selected[(page - 1) * page_size: page * page_size]
    total = Totals()
    for row in selected:
        for name in ("keldi", "kech_keldi", "kelmadi", "olchanmadi", "kutilmoqda"):
            setattr(total, name, getattr(total, name) + getattr(row.totals, name))
        total.lessons += row.totals.lessons
    return {
        "kind": kind,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "mode": "slots" if start == end else "days",
        "columns": data.columns,
        "counts": counts,
        "status": status,
        "sort": sort,
        "total": len(selected),
        "page": page,
        "page_size": page_size,
        "totals": total.out(),
        "without_lessons": data.members - len(data.rows),
        "rows": [
            {
                "id": str(row.member.id),
                "full_name": row.member.name,
                "unit": unit_of(row),
                "enrolled": row.member.enrolled,
                "cells": row.cells,
                "totals": row.totals.out(),
            }
            for row in chunk
        ],
    }


def _place(row: Row, day: date_type, slot: str, state: str, cell: dict, single_day: bool) -> None:
    row.totals.add(state)
    if single_day:
        current = row.cells.get(slot)
        # Bir juftlikda ikki dars (kichik guruh) — o'lchanganini ko'rsatamiz.
        if current is None or (current["status"] in ("olchanmadi", "kutilmoqda") and state not in ("olchanmadi", "kutilmoqda")):
            row.cells[slot] = cell
    else:
        key = day.isoformat()
        row.cells[key] = _merge_day_cell(row.cells.get(key), state)
