"""The institute's local timezone — every human-facing time-of-day
setting in app/config.py (attendance_ai_late_cutoff, attendance_early_
leave_cutoff, attendance_off_hours_start/end) is written as a LOCAL
clock time: "09:00" means 9 AM at the institute, not 9 AM UTC. Anywhere
one of those gets compared against an actual moment, that moment has to
be converted to this timezone first.

Found as a real, demonstrated bug (not hypothetical): app/jobs/
attendance_ai.py was comparing occurred_at.time() straight off a
UTC-aware datetime. Tashkent is UTC+5, so a person walking in at a real
local 09:12 AM was recorded as UTC 09:12 — which the system then read as
2:12 PM local when checking it against the "09:00" late cutoff, correctly
tripping "late" only by coincidence (any arrival between local 9:00 AM
and 2:00 PM was silently misclassified in one direction or the other).
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

INSTITUTE_TZ_NAME = "Asia/Tashkent"
INSTITUTE_TZ = ZoneInfo(INSTITUTE_TZ_NAME)


def local_now() -> datetime:
    return datetime.now(timezone.utc).astimezone(INSTITUTE_TZ)


def to_local(moment: datetime) -> datetime:
    """Converts any timezone-aware datetime to the institute's local
    clock time — use this before extracting .date()/.time() to compare
    against a config setting like attendance_ai_late_cutoff."""
    return moment.astimezone(INSTITUTE_TZ)


UZ_MONTHS = (
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
)
UZ_WEEKDAYS = ("dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba")


@dataclass(frozen=True)
class LocalMoment:
    """Bir payt — institut vaqtida, odam o'qiydigan ko'rinishda."""

    iso: str  # "2026-09-14T13:57:54+05:00"
    date: str  # "14-sentabr, 2026-yil"
    weekday: str  # "dushanba"
    time: str  # "13:57:54"


def uz_datetime_parts(moment: datetime) -> LocalMoment:
    """Vaqt serverda formatlanadi, brauzerda emas: brauzer soati boshqa
    mintaqaga sozlangan kompyuterda xuddi shu payt boshqa soat bo'lib
    ko'rinardi, savol esa aynan "Toshkent vaqti bilan soat nechida"."""
    local = to_local(moment)
    return LocalMoment(
        iso=local.isoformat(timespec="seconds"),
        date=f"{local.day}-{UZ_MONTHS[local.month - 1]}, {local.year}-yil",
        weekday=UZ_WEEKDAYS[local.weekday()],
        time=local.strftime("%H:%M:%S"),
    )


def local_date(column: ColumnElement) -> ColumnElement:
    """SQL expression for the LOCAL calendar date of a timestamptz column.

    The Python helpers above only fix values that pass through Python.
    Anything grouped or filtered by date in SQL needs this instead, and
    plain func.date() is NOT it: Postgres casts a timestamptz using the
    session timezone, which in these containers is UTC.

    Found as a real bug in the daily report. At 10:57 local it counted 35
    events for "today" while the local day actually held 49 — every event
    between local midnight and 05:00 belongs to the previous UTC date, so
    the first five hours of each day were silently missing. Opened before
    05:00 local, the same report was labelled with YESTERDAY's date.
    """
    return func.date(func.timezone(INSTITUTE_TZ_NAME, column))
