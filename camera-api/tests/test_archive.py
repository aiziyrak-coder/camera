"""Video arxivi: yozuv yo'li, timeline, imzolangan havola, hodisa klipi."""

import time
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import settings
from app.jobs import event_clips
from app.models import AuditLog, Camera, Event
from app.routers import archive
from app.services import recording
from app.timezone import local_now
from tests.conftest import auth_headers

pytestmark = pytest.mark.anyio


@pytest.fixture
async def camera(db_session, seeded):
    cam = Camera(name="Asosiy kirish", ip="10.9.0.18", zone="Z", resolution="1080p", status="faol")
    db_session.add(cam)
    await db_session.commit()
    return cam


class TestRecordingPath:
    def test_payload_records_without_transcode_and_keeps_retention(self, monkeypatch):
        monkeypatch.setattr(settings, "recording_retention_hours", 4)
        payload = recording.recording_payload("rtsp://cam/102")
        assert payload["source"] == "rtsp://cam/102"
        assert payload["sourceOnDemand"] is False  # yozuv uzilmasin
        assert payload["record"] is True and payload["recordFormat"] == "fmp4"
        assert payload["recordDeleteAfter"] == "4h"
        assert "runOnDemand" not in payload  # transkod yo'q — CPU sarflanmaydi

    def test_playback_base_uses_the_cameras_shard(self, monkeypatch):
        monkeypatch.setattr(recording, "_shard_for", lambda _id: type("S", (), {"api_url": "http://mediamtx-2:9997"})())
        assert recording.playback_base("x") == "http://mediamtx-2:9996"

    def test_get_url_asks_for_mp4(self, monkeypatch):
        monkeypatch.setattr(recording, "playback_base", lambda _id: "http://m:9996")
        url = recording.get_url("abc", datetime(2026, 9, 24, 5, 0, tzinfo=timezone.utc), 30)
        assert url.startswith("http://m:9996/get?path=rec-abc")
        assert "format=mp4" in url and "duration=30s" in url and "2026-09-24T05%3A00%3A00Z" in url


class TestArchiveApi:
    async def test_day_lists_ranges_and_event_markers(self, client: AsyncClient, db_session, camera, monkeypatch):
        monkeypatch.setattr(settings, "recording_enabled", True)
        now = local_now()

        async def fake_segments(camera_id, start, end):
            return [(now - timedelta(hours=1), now)]

        monkeypatch.setattr(recording, "list_segments", fake_segments)
        db_session.add(Event(
            camera_id=camera.id, camera_name=camera.name, building="A", module_code=23, module_name="Yong'in",
            group="A", confidence=90, severity="yuqori", occurred_at=now - timedelta(minutes=5),
        ))
        await db_session.commit()
        headers = await auth_headers(client, "admin", "admin123")

        body = (await client.get(f"/api/arxiv/{camera.id}/kun?sana={now.date()}", headers=headers)).json()
        assert body["recording"] is True
        assert len(body["ranges"]) == 1
        assert [e["moduleName"] for e in body["events"]] == ["Yong'in"]

    async def test_link_is_signed_and_audited(self, client: AsyncClient, db_session, camera, monkeypatch):
        monkeypatch.setattr(settings, "recording_enabled", True)
        headers = await auth_headers(client, "admin", "admin123")
        res = await client.get(
            f"/api/arxiv/{camera.id}/havola", params={"start": "2026-09-24T10:00:00+05:00", "duration": 60}, headers=headers
        )
        assert res.status_code == 200, res.text
        link = res.json()
        assert "sig=" in link["url"] and link["downloadUrl"].endswith("&yuklab=1")
        audit = (await db_session.execute(select(AuditLog).where(AuditLog.module == "Video arxiv"))).scalars().all()
        assert len(audit) == 1 and "Asosiy kirish" in audit[0].action

    async def test_link_refused_when_recording_is_off(self, client: AsyncClient, camera, monkeypatch):
        monkeypatch.setattr(settings, "recording_enabled", False)
        headers = await auth_headers(client, "admin", "admin123")
        res = await client.get(f"/api/arxiv/{camera.id}/havola", params={"start": "2026-09-24T10:00:00+05:00"}, headers=headers)
        assert res.status_code == 409

    async def test_video_rejects_tampered_or_expired_signature(self, client: AsyncClient, camera):
        start = "2026-09-24T10:00:00+05:00"
        exp = int(time.time()) + 60
        good = archive._signature(str(camera.id), start, 60, exp)
        tampered = await client.get(
            f"/api/arxiv/{camera.id}/video", params={"start": start, "duration": 120, "exp": exp, "sig": good}
        )
        assert tampered.status_code == 403
        old = int(time.time()) - 5
        expired = await client.get(
            f"/api/arxiv/{camera.id}/video",
            params={"start": start, "duration": 60, "exp": old, "sig": archive._signature(str(camera.id), start, 60, old)},
        )
        assert expired.status_code == 403

    async def test_archive_requires_live_permission(self, client: AsyncClient, camera):
        assert (await client.get(f"/api/arxiv/{camera.id}/kun")).status_code in (401, 403)


class TestEventClips:
    async def _event(self, db_session, camera, minutes_ago: float) -> Event:
        event = Event(
            camera_id=camera.id, camera_name=camera.name, building="A", module_code=1, module_name="Begona shaxs",
            group="A", confidence=90, severity="yuqori", occurred_at=local_now() - timedelta(minutes=minutes_ago),
        )
        db_session.add(event)
        await db_session.commit()
        return event

    async def test_recent_event_gets_a_clip(self, db_session, camera, monkeypatch):
        from tests.conftest import TestSessionLocal

        monkeypatch.setattr(settings, "recording_enabled", True)
        monkeypatch.setattr(event_clips, "disk_free_percent", lambda path=None: 50.0)
        asked = {}

        async def fake_fetch(camera_id, start, duration, *, max_bytes):
            asked["duration"] = duration
            return b"mp4-bytes"

        monkeypatch.setattr(recording, "fetch_clip", fake_fetch)
        monkeypatch.setattr("app.storage.upload_file", lambda data, name, ctype, prefix: ("id", f"{prefix}/{name}"))
        event = await self._event(db_session, camera, minutes_ago=2)
        too_old = await self._event(db_session, camera, minutes_ago=60 * 10)  # arxivdan chiqib ketgan

        assert await event_clips.run_event_clips_once(TestSessionLocal) == 1
        await db_session.refresh(event)
        await db_session.refresh(too_old)
        assert event.clip_status == "ok" and event.clip_key == f"klip/{event.id}.mp4"
        assert asked["duration"] == settings.event_clip_before_seconds + settings.event_clip_after_seconds
        assert too_old.clip_status is None

    async def test_missing_recording_is_not_retried(self, db_session, camera, monkeypatch):
        from tests.conftest import TestSessionLocal

        monkeypatch.setattr(settings, "recording_enabled", True)
        monkeypatch.setattr(event_clips, "disk_free_percent", lambda path=None: 50.0)

        async def no_clip(*args, **kwargs):
            return None

        monkeypatch.setattr(recording, "fetch_clip", no_clip)
        event = await self._event(db_session, camera, minutes_ago=2)
        assert await event_clips.run_event_clips_once(TestSessionLocal) == 0
        await db_session.refresh(event)
        assert event.clip_status == "none"

    async def test_low_disk_stops_recording(self, db_session, camera, monkeypatch):
        from tests.conftest import TestSessionLocal

        monkeypatch.setattr(settings, "recording_enabled", True)
        monkeypatch.setattr(settings, "event_clip_enabled", False)
        monkeypatch.setattr(event_clips, "_disk_stopped", False)
        monkeypatch.setattr(event_clips, "disk_free_percent", lambda path=None: 5.0)
        stopped: list[str] = []

        async def fake_unregister(camera_id):
            stopped.append(camera_id)

        monkeypatch.setattr(recording, "unregister_recording", fake_unregister)
        await event_clips.run_event_clips_once(TestSessionLocal)
        assert str(camera.id) in stopped
        assert event_clips.recording_stopped_for_disk() is True
