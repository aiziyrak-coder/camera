"""Ish vaqti qoidasi saqlanganda qaysi yozuvlar qayta hisoblanadi.

Productionda topilgan (2026-09-20): so'rovda `source IN ('kamera',
'turniket')` sharti bor edi, bazada esa 1005 ta yozuvning manbasi NULL
(eski yozuvlar) va atigi 5 tasiniki 'kamera'. Ya'ni "Ish vaqti" sahifasi
saqlanganda "qayta hisoblandi" deb javob berardi-yu, amalda deyarli hech
nimani o'zgartirmasdi. Qo'lda tuzatilgan yozuv (source='qolda') esa
aksincha — hech qachon qayta hisoblanmasligi kerak.
"""

from datetime import date as date_type, time, timedelta

import pytest
from sqlalchemy import select

from app.models import AttendanceRecord, Faculty, StudentStaff
from app.services import attendance_policy as policy_mod
from app.services.attendance_policy import Policy, set_cached
from app.timezone import local_now
from tests.conftest import auth_headers

PAYLOAD = {
    "staffStart": "08:00",
    "studentStart": "08:00",
    "graceMinutes": 10,
    "workEnd": "17:00",
    "workDays": [1, 2, 3, 4, 5, 6],
    "trackLastSeen": True,
}


@pytest.fixture(autouse=True)
def _clean_policy_cache():
    yield
    set_cached(Policy())
    policy_mod._loaded_at = 0.0


def _recent_monday() -> date_type:
    """RECOMPUTE_DAYS ichidagi ish kuni (yakshanba kechikish hisoblanmaydi)."""
    today = local_now().date()
    return today - timedelta(days=today.isoweekday() - 1 + 7)


async def _person(db_session, name: str) -> StudentStaff:
    faculty = (await db_session.execute(select(Faculty))).scalars().first()
    person = StudentStaff(full_name=name, type="xodim", faculty_id=faculty.id, group_or_position="Dotsent")
    db_session.add(person)
    await db_session.commit()
    return person


