"""Kunduzgi rejim (2026-10-26): kun oxirini kutmasdan har 30 daqiqada,
1 soat kechikish bilan, shu paytgacha tugagan darslar tahlil qilinadi.
Har dars to'liq bitta bo'lakda ko'riladi, kun natijasi esa barcha
bo'laklar kuzatuvlaridan yig'iladi (oldingi bo'lak natijasi o'chmaydi)."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.batch.planner import DAYTIME_TRIGGER
from app.config import settings
from app.jobs import video_analysis as va
from app.models import AttendanceRecord, VideoAnalysisJob, VideoAnalysisRun
from tests.conftest import TestSessionLocal
from tests.test_video_analysis_run import DAY, ScriptedAnalyzer, at, campus, full_day_script  # noqa: F401

pytestmark = [pytest.mark.daily_mode, pytest.mark.daytime_mode]


@pytest.fixture(autouse=True)
def _daytime(monkeypatch):
    monkeypatch.setattr(settings, "video_analysis_day_start", "07:30")
    monkeypatch.setattr(settings, "video_analysis_start", "19:30")
    monkeypatch.setattr(settings, "video_analysis_lag_minutes", 60)
    monkeypatch.setattr(settings, "video_analysis_slice_minutes", 30)


async def _slice(now):
    async with TestSessionLocal() as db:
        run = await va.next_daytime_slice(db, DAY, now)
        return None if run is None else (run.id, run.window_start, run.window_end)


async def _execute(run_id, campus):
    executor = va.RunExecutor(run_id, TestSessionLocal, analyzer=ScriptedAnalyzer(full_day_script(), campus["people"]),
                              source_factory=lambda nvr, camera: None)
    return await executor.execute()


async def _lesson_jobs(run_id):
    async with TestSessionLocal() as db:
        return list(
            (
                await db.execute(
                    select(VideoAnalysisJob).where(VideoAnalysisJob.run_id == run_id, VideoAnalysisJob.kind == "dars")
                )
            ).scalars()
        )


async def test_no_slice_until_enough_recording_has_aged(campus, db_session):
    # 07:30 + 60 daqiqa kechikish + 30 daqiqalik bo'lak = 09:00 dan oldin yo'q.
    assert await _slice(at(8, 55)) is None
    created = await _slice(at(9, 1))
    assert created is not None
    _, start, end = created
    assert start == at(7, 30) and end == at(8, 1)


async def test_lesson_is_read_whole_in_the_slice_where_it_ends(campus, db_session):
    # Dars 09:00-10:20. 10:40 dagi bo'lak 09:40 gacha — dars hali tugamagan.
    first_id, _, first_end = await _slice(at(10, 40))
    assert first_end == at(9, 40)
    assert await _lesson_jobs(first_id) == []
    await _execute(first_id, campus)

    second_id, start, end = await _slice(at(11, 30))
    assert (start, end) == (at(9, 40), at(10, 30))
    jobs = await _lesson_jobs(second_id)
    assert len(jobs) == 1
    # Boshlanish kliplari oldingi bo'lak oynasida (08:50 dan) bo'lsa ham olinadi.
    assert jobs[0].start_at <= at(9, 0)


async def test_day_result_combines_all_slices(campus, db_session):
    first_id, _, _ = await _slice(at(10, 40))
    await _execute(first_id, campus)
    second_id, _, _ = await _slice(at(11, 30))
    await _execute(second_id, campus)

    async with TestSessionLocal() as db:
        statuses = (await db.execute(select(VideoAnalysisRun.status).where(VideoAnalysisRun.day == DAY))).scalars().all()
        records = {
            str(r.student_staff_id): r
            for r in (await db.execute(select(AttendanceRecord).where(AttendanceRecord.date == DAY))).scalars()
        }
    assert statuses == ["tugadi", "tugadi"]
    # S1 eshikdan 08:20 da kirgan (1-bo'lak), darsda 08:55 da (2-bo'lak) —
    # ikkinchi bo'lak agregatsiyasi birinchisini o'chirib yubormaydi.
    s1 = records[campus["people"]["S1"]]
    assert s1.check_in is not None and s1.check_in.hour == 8 and s1.check_in.minute == 20


async def test_last_short_slice_closes_the_day(campus, db_session):
    first_id, _, _ = await _slice(at(20, 0))
    async with TestSessionLocal() as db:
        run = await db.get(VideoAnalysisRun, first_id)
        run.status = "tugadi"
        await db.commit()
    # 20:40 — 19:30 gacha qolgan 10 daqiqa ham olinadi, keyin bo'lak yo'q.
    remainder = await _slice(at(20, 40))
    assert remainder is not None and remainder[2] == at(19, 30)
    async with TestSessionLocal() as db:
        run = await db.get(VideoAnalysisRun, remainder[0])
        run.status = "tugadi"
        assert run.triggered_by == DAYTIME_TRIGGER
        await db.commit()
    assert await _slice(at(23, 0)) is None


async def test_failed_slice_window_is_retried_later(campus, db_session):
    run_id, start, end = await _slice(at(10, 0))
    async with TestSessionLocal() as db:
        run = await db.get(VideoAnalysisRun, run_id)
        run.status = "xato"
        run.finished_at = at(10, 1)
        await db.commit()
    assert await _slice(at(10, 10)) is None
    retry = await _slice(at(10, 40))
    assert retry is not None and retry[1] == start and retry[2] > end - timedelta(seconds=1)
