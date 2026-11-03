"""Serverning o'z yozuvi (2026-11-03): NVR'da xotira yo'q, shuning uchun
kunduzgi tahlil MediaMTX yozgan `rec-<kamera id>` bo'laklarini o'qiydi."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import select

from app.config import settings
from app.jobs import video_analysis as va
from app.models import Camera, NvrDevice
from app.services.nvr.sources import ServerRecordingSource, source_for
from tests.test_nvr import make_video, needs_ffmpeg


def test_server_file_names_are_utc():
    source = ServerRecordingSource("/recordings", "abc")
    assert str(source.directory).replace("\\", "/") == "/recordings/rec-abc"
    assert source.file_start("2026-11-03_05-10-00-123456.mp4") == datetime(2026, 11, 3, 5, 10, tzinfo=timezone.utc)
    assert source.file_start("20261103_051000.mp4") is None


def test_server_source_needs_no_channel():
    nvr = SimpleNamespace(kind="server")
    camera = SimpleNamespace(id="cam-1", nvr_channel=None)
    source = source_for(nvr, camera)
    assert isinstance(source, ServerRecordingSource)
    assert source.directory.name == "rec-cam-1"


@needs_ffmpeg
async def test_server_source_reads_frames(tmp_path):
    make_video(tmp_path / "rec-cam-1" / "2026-11-03_05-10-00-000000.mp4", 20)
    source = ServerRecordingSource(str(tmp_path), "cam-1")
    start = datetime(2026, 11, 3, 5, 10, tzinfo=timezone.utc)
    spans = await source.available(start - timedelta(minutes=1), start + timedelta(minutes=1))
    assert [(s.start, s.end) for s in spans] == [(start, start + timedelta(seconds=20))]
    frames = [f async for f in source.clip(start + timedelta(seconds=2), start + timedelta(seconds=4), 1.0,
                                            max_side=0, timeout=30)]
    assert [f.at for f in frames] == [start + timedelta(seconds=2), start + timedelta(seconds=3)]


async def test_cameras_are_linked_to_server_recordings(db_session, monkeypatch):
    nvr = NvrDevice(name="NVR-1", kind="fayl", base_path="/tmp/nvr")
    db_session.add(nvr)
    await db_session.flush()
    on_nvr = Camera(name="201-xona", ip="10.0.0.2", zone="A", resolution="4K", status="faol",
                    nvr_id=nvr.id, nvr_channel=5)
    free = Camera(name="202-xona", ip="10.0.0.3", zone="A", resolution="4K", status="faol")
    db_session.add_all([on_nvr, free])
    await db_session.commit()

    monkeypatch.setattr(settings, "recording_enabled", False)
    assert await va.link_server_recordings(db_session) == 0

    monkeypatch.setattr(settings, "recording_enabled", True)
    assert await va.link_server_recordings(db_session) == 1
    assert await va.link_server_recordings(db_session) == 0  # takroriy chaqiruv — o'zgarish yo'q
    sources = (await db_session.execute(select(NvrDevice).where(NvrDevice.kind == "server"))).scalars().all()
    assert len(sources) == 1
    await db_session.refresh(free)
    await db_session.refresh(on_nvr)
    assert free.nvr_id == sources[0].id and free.nvr_channel == 0
    assert on_nvr.nvr_id == nvr.id and on_nvr.nvr_channel == 5
