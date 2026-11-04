"""Dars xonasi 4K suratlari (2026-11-04): yig'uvchi (app/jobs/classroom_snapshots.py)
va tahlil manbai (app/services/nvr/sources.py SnapshotSource)."""

import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.batch.planner import P_IDENTITY, Clip
from app.config import settings
from app.jobs import classroom_snapshots as cs
from app.services.nvr.sources import (
    Frame,
    PlaybackSource,
    ServerRecordingSource,
    SnapshotSource,
    VideoReadError,
    snapshot_dir,
    source_for,
)
from app.services.nvr.isapi import RecordingSpan
from tests.test_batch_analyzer import CANDIDATES, A, FakeAnalyzer, context, face, jpeg

T0 = datetime(2026, 11, 4, 5, 0, tzinfo=timezone.utc)
JPEG = b"\xff\xd8 surat"


def put(base, camera_id, at, data=JPEG):
    return cs.write_snapshot(str(base), camera_id, at, data)


class Recording(PlaybackSource):
    def __init__(self, spans=None):
        self.spans, self.calls = spans or [], []

    async def available(self, start, end):
        return self.spans

    async def clip(self, start, end, fps, *, max_side, timeout, should_stop=None):
        self.calls.append((start, end))
        yield Frame(at=start, jpeg=b"\xff\xd8 video")


async def frames_of(source, start, seconds=3):
    return [f async for f in source.clip(start, start + timedelta(seconds=seconds), 1.0, max_side=1920, timeout=5)]


async def test_clip_takes_the_nearest_snapshot_with_detector_hint(tmp_path):
    put(tmp_path, "cam", T0)
    put(tmp_path, "cam", T0 + timedelta(seconds=30))
    source = SnapshotSource(str(tmp_path), "cam", interval=30, det_side=1920)
    # 3 s lik klip suratlar orasida: o'rtasiga eng yaqin (±15 s) bittasi olinadi.
    frames = await frames_of(source, T0 + timedelta(seconds=20))
    assert [f.at for f in frames] == [T0 + timedelta(seconds=30)]
    assert frames[0].det_side == 1920 and frames[0].jpeg == JPEG
    spans = await source.available(T0 - timedelta(minutes=1), T0 + timedelta(minutes=1))
    assert spans == [RecordingSpan(T0 - timedelta(seconds=15), T0 + timedelta(seconds=45))]


async def test_missing_snapshot_falls_back_to_recording(tmp_path):
    put(tmp_path, "cam", T0)
    recording = Recording()
    source = SnapshotSource(str(tmp_path), "cam", interval=30, det_side=1920, fallback=recording)
    frames = await frames_of(source, T0 + timedelta(minutes=5))
    assert [f.jpeg for f in frames] == [b"\xff\xd8 video"] and frames[0].det_side is None
    with pytest.raises(VideoReadError):
        await frames_of(SnapshotSource(str(tmp_path), "cam", interval=30, det_side=1920), T0 + timedelta(minutes=5))


def test_classroom_cameras_read_snapshots_only_when_enabled(monkeypatch, tmp_path):
    nvr = SimpleNamespace(kind="server")
    room = SimpleNamespace(id="c1", room_type="auditoriya", nvr_channel=0)
    corridor = SimpleNamespace(id="c2", room_type="koridor", nvr_channel=0)
    monkeypatch.setattr(settings, "classroom_snapshots_enabled", False)
    assert isinstance(source_for(nvr, room), ServerRecordingSource)
    monkeypatch.setattr(settings, "classroom_snapshots_enabled", True)
    monkeypatch.setattr(settings, "classroom_snapshots_dir", str(tmp_path))
    source = source_for(nvr, room)
    assert isinstance(source, SnapshotSource) and isinstance(source.fallback, ServerRecordingSource)
    assert source.directory == snapshot_dir(str(tmp_path), "c1")
    assert isinstance(source_for(nvr, corridor), ServerRecordingSource)


def test_prune_removes_expired_and_stale_partial_files(tmp_path):
    old = put(tmp_path, "cam", T0 - timedelta(hours=9))
    fresh = put(tmp_path, "cam", T0 - timedelta(hours=1))
    partial = snapshot_dir(str(tmp_path), "cam") / ".x.part"
    partial.write_bytes(b"x")
    os.utime(partial, (0, 0))
    assert cs.prune_snapshots(str(tmp_path), T0, 8) == 2
    assert not old.exists() and fresh.exists() and not partial.exists()


async def test_collector_writes_and_backs_off_unreachable_cameras(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "classroom_snapshots_dir", str(tmp_path))
    monkeypatch.setattr(settings, "classroom_snapshot_retry_after_seconds", 300)
    ok, down = SimpleNamespace(id=uuid.uuid4()), SimpleNamespace(id=uuid.uuid4())
    calls = []

    async def fetch(_client, camera):
        calls.append(camera.id)
        return JPEG if camera is ok else None

    clock = [1000.0]
    collector = cs.SnapshotCollector(fetch=fetch, clock=lambda: clock[0])
    assert await collector.round([ok, down], T0) == {"olindi": 1, "xato": 1, "otkazildi": 0}
    assert (snapshot_dir(str(tmp_path), str(ok.id)) / "2026-11-04_05-00-00.jpg").read_bytes() == JPEG
    clock[0] += 60
    assert await collector.round([ok, down], T0 + timedelta(seconds=30)) == {"olindi": 1, "xato": 0, "otkazildi": 1}
    clock[0] += 300
    await collector.round([ok, down], T0 + timedelta(seconds=60))
    assert calls.count(down.id) == 2


def test_window_follows_the_analysis_day(monkeypatch):
    monkeypatch.setattr(settings, "video_analysis_day_start", "07:30")
    monkeypatch.setattr(settings, "video_analysis_start", "19:30")
    tashkent = lambda h, m: datetime(2026, 11, 4, h, m, tzinfo=timezone.utc) - timedelta(hours=5)  # noqa: E731
    assert not cs.in_window(tashkent(6, 50))
    assert cs.in_window(tashkent(7, 5))
    assert cs.in_window(tashkent(19, 29))
    assert not cs.in_window(tashkent(19, 30))


async def test_analyzer_uses_large_detector_for_snapshot_frames():
    image = jpeg(seed=3)

    class Source(PlaybackSource):
        async def available(self, start, end):
            return None

        async def clip(self, start, end, fps, *, max_side, timeout, should_stop=None):
            yield Frame(at=start, jpeg=image, det_side=1920)

    class Hd(FakeAnalyzer):
        sides: list = []

        async def faces_hd(self, data, det_side, landmarks=True):
            self.sides.append(det_side)
            return self.face_map.get(data, [])

    analyzer = Hd(faces={image: [face(A)]})
    ctx = context([Clip(T0, T0 + timedelta(seconds=3), 1.0, (P_IDENTITY,))])
    outcome = await analyzer.run(ctx, Source())
    assert analyzer.sides == [1920] and analyzer.face_calls == 0
    assert outcome.faces == 1 and ctx.candidates is CANDIDATES


async def test_daytime_analysis_adds_classroom_gallery_samples(db_session):
    """4K suratdagi 40-55 px yuz ham galereyaga tushadi (real vaqt chegarasi 56 px)."""
    import json

    import numpy as np
    from sqlalchemy import func, select

    from app.jobs.video_analysis import _add_gallery_samples
    from app.models import Faculty, FaceGalleryEmbedding, StudentStaff
    from app.services import face_gallery
    from app.services.face_matching import GradedMatch

    face_gallery.reset_for_tests()
    faculty = Faculty(name="Galereya fakulteti")
    db_session.add(faculty)
    await db_session.flush()
    anchor = np.zeros(512)
    anchor[0] = 1.0
    person = StudentStaff(full_name="Galereya Talaba", type="talaba", faculty_id=faculty.id, group_or_position="1-kurs, G-1",
                          biometric_embedding=json.dumps(anchor.tolist()), biometrics_status="tasdiqlangan")
    db_session.add(person)
    await db_session.commit()
    seen = anchor.copy()
    seen[1] = 0.6  # asl rasm bilan o'xshashlik ~0.86, takror emas (< 0.90)
    match = GradedMatch(str(person.id), 0.86, 0.3, "strict", 0.86)
    outcome = SimpleNamespace(gallery=[(str(person.id), seen, 45, match)])
    assert await _add_gallery_samples(db_session, outcome, None) == 1
    await db_session.commit()
    count = (await db_session.execute(select(func.count()).select_from(FaceGalleryEmbedding))).scalar()
    assert count == 1 and outcome.gallery == []
    # Real vaqt chegarasi (56 px) bilan 45 px lik yuz qo'shilmasdi.
    face_gallery.reset_for_tests()
    small = SimpleNamespace(bbox=(0, 0, 45, 45), embedding=seen)
    assert not face_gallery.qualifies(small, match)
