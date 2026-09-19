"""Kelib-ketish qoidalari: kim kech keldi, necha daqiqa, qaysi kun ish kuni.

Qoida sodda va tushunarli (institut talabi, 2026-09-19):
  * kelish vaqti — kunning BIRINCHI ko'rinishi, istalgan kamerada yoki
    turniketda (faqat kirish eshigida emas);
  * ish boshlanishi + grace_minutes gacha (08:00 + 10 = 08:10) — "keldi",
    undan keyin — "kech_keldi" (kechikish daqiqasi hisoblanadi);
  * dam olish kunlari kechikish hisoblanmaydi;
  * track_last_seen — kunning oxirgi ko'rinishi check_out ga yoziladi
    ("oxirgi ko'rilgan"), ish tugashidan oldin bo'lsa — erta ketgan.

Jadval bitta qatorli (app/models/attendance_policy.py). Yuz tanish har
soniyada chaqiriladi, shuning uchun qoida xotirada keshlanadi (30 s)."""

from __future__ import annotations

import time as _clock
from dataclasses import asdict, dataclass
from datetime import date as date_type, datetime, time as time_type, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance_policy import AttendancePolicy

CACHE_SECONDS = 30.0


@dataclass(frozen=True)
class Policy:
    staff_start: time_type = time_type(8, 0)
    student_start: time_type = time_type(8, 0)
    grace_minutes: int = 10
    work_end: time_type = time_type(17, 0)
    work_days: tuple[int, ...] = (1, 2, 3, 4, 5, 6)
    track_last_seen: bool = True

    def start_for(self, person_type: str | None) -> time_type:
        return self.student_start if person_type == "talaba" else self.staff_start

    def late_after(self, person_type: str | None) -> time_type:
        start = datetime.combine(date_type(2000, 1, 1), self.start_for(person_type))
        return (start + timedelta(minutes=self.grace_minutes)).time()

    def is_work_day(self, day: date_type | None) -> bool:
        return day is None or day.isoweekday() in self.work_days

    def late_minutes(self, arrived: time_type | None, person_type: str | None, day: date_type | None = None) -> int:
        """Ish boshlanishidan necha daqiqa kech (grace ichida bo'lsa 0)."""
        if arrived is None or not self.is_work_day(day) or arrived <= self.late_after(person_type):
            return 0
        start = self.start_for(person_type)
        return (arrived.hour * 60 + arrived.minute) - (start.hour * 60 + start.minute)

    def arrival_status(self, arrived: time_type, person_type: str | None, day: date_type | None = None) -> str:
        return "kech_keldi" if self.late_minutes(arrived, person_type, day) > 0 else "keldi"

    def to_dict(self) -> dict:
        data = asdict(self)
        for key in ("staff_start", "student_start", "work_end"):
            data[key] = data[key].strftime("%H:%M")
        data["work_days"] = list(self.work_days)
        return data


def parse_days(raw: str) -> tuple[int, ...]:
    return tuple(sorted({int(p) for p in raw.split(",") if p.strip().isdigit() and 1 <= int(p) <= 7}))


def from_row(row: AttendancePolicy) -> Policy:
    return Policy(
        staff_start=row.staff_start,
        student_start=row.student_start,
        grace_minutes=row.grace_minutes,
        work_end=row.work_end,
        work_days=parse_days(row.work_days),
        track_last_seen=row.track_last_seen,
    )


_cached: Policy = Policy()
_loaded_at: float = 0.0


def current_policy() -> Policy:
    """Oxirgi yuklangan qoida (sinxron joylar uchun). Hali yuklanmagan bo'lsa — standart."""
    return _cached


def set_cached(policy: Policy) -> None:
    global _cached, _loaded_at
    _cached, _loaded_at = policy, _clock.monotonic()


async def load_policy(db: AsyncSession, force: bool = False) -> Policy:
    if not force and _loaded_at and _clock.monotonic() - _loaded_at < CACHE_SECONDS:
        return _cached
    row = await db.get(AttendancePolicy, 1)
    set_cached(from_row(row) if row is not None else Policy())
    return _cached
