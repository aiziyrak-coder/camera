"""Beshinchi audit tuzatishlari: yarim tundan keyingi vaqtlar, tuzilma
daraxtidagi "kutilmoqda", faqat davomat oladigan WebSocket ulanishi."""

from datetime import date, datetime, time

import pytest

from app.routers.situation import _bucket
from app.services.attendance_policy import EARLY_NO, Policy, early_leave_verdict
from app.timezone import INSTITUTE_TZ
from app.ws import ConnectionManager

MONDAY = date(2026, 9, 21)


class TestAfterMidnight:
    def test_arrival_after_midnight_is_late_not_on_time(self):
        policy = Policy()
        # 01:00 — ish kunining oxiri (06:00 dan boshlanadi), "erta tong" emas.
        assert policy.late_minutes(time(1, 0), "xodim", MONDAY) > 0
        assert policy.late_minutes(time(7, 50), "xodim", MONDAY) == 0

    def test_checkout_after_midnight_is_not_early_leave(self):
        verdict = early_leave_verdict(
            status="keldi",
            day=MONDAY,
            check_in=time(8, 0),
            check_out=time(1, 30),
            sightings=10,
            last_seen=time(1, 30),
            policy=Policy(),
            now=datetime.combine(date(2026, 9, 23), time(12, 0), tzinfo=INSTITUTE_TZ),
        )
        assert verdict == EARLY_NO


class TestOrgTreeBucket:
    def test_not_yet_is_not_absent(self):
        assert _bucket(None, True, True) == "not_yet"
        assert _bucket("kelmadi", True, True) == "absent"
        assert _bucket(None, True, False) == "no_data"
        assert _bucket("keldi", True, True) == "present"


class _Socket:
    pass


class TestAttendanceOnlySocket:
    def test_attendance_only_socket_gets_no_events(self):
        manager = ConnectionManager()
        ws = _Socket()
        manager._attendance_only.add(ws)
        assert manager._allowed(ws, {"kind": "attendance_recorded", "fullName": "A"}) is True
        assert manager._allowed(ws, {"kind": "event_created", "cameraId": "x"}) is False
        assert manager._allowed(ws, {"kind": "events_reviewed"}) is False

    def test_reviewer_socket_gets_everything(self):
        manager = ConnectionManager()
        ws = _Socket()
        assert manager._allowed(ws, {"kind": "event_created", "cameraId": "x"}) is True
        assert manager._allowed(ws, {"kind": "attendance_recorded"}) is True


@pytest.mark.anyio
async def test_attendance_viewer_may_open_the_socket(client, seeded):
    """manageAttendance/viewReports egasi ham ulanadi (jonli davomat);
    kamera mas'uli — yo'q (test_operator_permissions)."""
    from app.routers.events import authorize_events_socket
    from tests.conftest import TestSessionLocal, login

    token = await login(client, "operator", "operator123")
    assert await authorize_events_socket(token, TestSessionLocal) is None
