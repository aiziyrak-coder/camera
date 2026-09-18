"""Automatic attendance via face recognition — TT kriteriya 6 ("Xodim/
o'qituvchi davomati"), 7 ("Talaba davomati"), 8 ("Darsga kechikish") and,
for a check-in outside normal operating hours, 3 ("Notekis/kechki vaqtda
kirish" — raised as a real Event, since an off-hours entry is a security
signal, not just an attendance classification).

No external AI API of any kind: this runs entirely on the same local
InsightFace model app/services/face_recognition.py already uses for
biometric enrollment/compare (app/routers/students_staff.py). The loop
periodically grabs one frame (app/services/frame_grabber.py) from every
reachable camera, embeds EVERY face it finds (not just the largest —
found necessary from real classroom testing, see process_camera_frame()'s
docstring), and matches each one against every enrolled person's stored
embedding (StudentStaff.biometric_embedding).

Honest scope note on what this is and isn't: 1:N identification against
the whole enrolled population is a materially higher false-accept risk
than the 1:1 verification used at enrollment time — see
settings.attendance_ai_match_threshold's docstring in app/config.py. This
also only runs against a single sampled frame per camera per tick, not
continuous video — a real deployment tuning this for production accuracy
would want multi-frame consensus before writing a record, which this
does not yet do.

This writes directly to AttendanceRecord (same upsert-by-(person,date)
key as the existing manual POST /api/attendance) rather than going
through an HTTP round-trip to itself, since it runs in-process — see
app/routers/attendance.py's docstring for why that endpoint was
originally structured to allow either.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, time as time_type
from time import monotonic

import numpy as np
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.database import SessionLocal
from app.jobs.camera_health import is_reachable
from app.jobs.module_status import camera_allows_module, is_module_active
from app.jobs.sweep_guard import SweepGuard
from app.jobs.sweep_concurrency import camera_sweep_slot, entrance_exit_sweep_slot
from app.models import AttendanceRecord, AuditLog, Camera, StudentStaff
from app.services.event_bus import raise_event
from app.services.face_matching import CandidateMatrix, find_best_match as _vectorized_find_best_match, load_candidate_matrix_for_sweep
from app.services.face_recognition import detect_faces
from app.services.inference_gate import PRIORITY_ATTENDANCE, PRIORITY_BACKGROUND
from app.services.frame_grabber import (
    frame_wait_seconds_for_camera,
    grab_frame_burst_for_camera,
    grab_frame_for_camera,
    grab_newer_frame,
    stream_label,
)
from app.services import recognition_stats
from app.services.presence import record_visit
from app.timezone import local_now, to_local

logger = logging.getLogger("app.attendance_ai")

OFF_HOURS_MODULE_CODE = 3
OFF_HOURS_MODULE_NAME = "Notekis/kechki vaqtda kirish"
# #6/#7 aren't gated the same way the other 13 jobs' single criterion is —
# this one sweep serves BOTH at once (same face-detection pass credits
# either a "xodim" or "talaba" match), so the sweep only skips entirely if
# an admin has turned off attendance tracking for both populations. #3
# (off-hours) is checked separately, per-sighting, in
# upsert_attendance_from_recognition — see its off_hours_module_active
# parameter.
STAFF_ATTENDANCE_MODULE_CODE = 6
STUDENT_ATTENDANCE_MODULE_CODE = 7

# Concurrent camera pipelines share app/jobs/sweep_concurrency.global_camera_semaphore
# (ai_global_sweep_concurrency in .env) — separate from face_recognition inference cap.
_sweep_guard = SweepGuard("attendance_ai")


def _relaxed_threshold() -> float:
    """0 yoki qat'iy chegaradan past bo'lmagan qiymat yumshoq moslikni
    o'chiradi (graded_matches'da relaxed oralig'i bo'sh qoladi)."""
    relaxed = settings.attendance_ai_relaxed_threshold
    if relaxed <= 0 or relaxed >= settings.attendance_ai_match_threshold:
        return settings.attendance_ai_match_threshold
    return relaxed


def _is_off_hours(occurred_time: time_type, *, at_entrance: bool = True) -> bool:
    """Kunning birinchi ko'rinishi ish vaqtidan tashqaridami.

    Erta tomon (start dan oldin) har qanday kamerada ma'noli: odam shu
    paytda binoda bo'lgan. Kech tomon (end dan keyin) esa faqat KIRISH
    kamerasida "kirish" degani — kun bo'yi kameralarga tushmagan xodimni
    kechqurun xonada birinchi marta ko'rish uning 20:57 da kirganini
    bildirmaydi."""
    start = time_type.fromisoformat(settings.attendance_off_hours_start)
    end = time_type.fromisoformat(settings.attendance_off_hours_end)
    return occurred_time < start or (at_entrance and occurred_time >= end)


def first_sighting_status(occurred_time: time_type, camera: Camera | None) -> tuple[str, time_type | None]:
    """Kunning birinchi ko'rinishidan davomat holati va kelish vaqti.

    Kelish vaqti faqat KIRISH kamerasi ko'rganda ma'lum. Boshqa kamera odamni
    birinchi marta 15:40 da ko'rsa, bu uning 15:40 da kelgani emas — u
    ertalab ishlamayotgan eshikdan kirib, kun bo'yi kameralarga tushmagan
    bo'lishi mumkin. Productionda (2026-09-17) bir kunda tanilgan 22 kishidan
    20 tasi shu sababdan "kech keldi" deb yozilgan edi.

      * chegaradan oldin, istalgan kamera  -> keldi, vaqt yoziladi (odam
        shu paytda allaqachon binoda — kechikmagani aniq);
      * chegaradan keyin, kirish kamerasi  -> kech_keldi, vaqt yoziladi;
      * chegaradan keyin, boshqa kamera    -> keldi, kelish vaqti NOMA'LUM
        (check_in yozilmaydi — kechikish ham, erta ketish ham hisoblanmaydi).

    `camera` bo'lmasa (qo'lda/test chaqiruvi) — avvalgi xatti-harakat."""
    cutoff = time_type.fromisoformat(settings.attendance_ai_late_cutoff)
    if occurred_time < cutoff:
        return "keldi", occurred_time
    if camera is None or camera.is_entrance:
        return "kech_keldi", occurred_time
    return "keldi", None


def find_best_match(
    embedding: list[float], candidates: list[tuple[str, list[float]]]
) -> tuple[str, float] | None:
    """Thin, settings-bound wrapper kept here since app/jobs/vision_ai.py
    and the test suite call it as attendance_ai.find_best_match(embedding,
    candidates) relying on this module's own match threshold. The actual
    (vectorized) comparison lives in app/services/face_matching.py — sweep
    loops processing many faces/cameras should use CandidateMatrix /
    load_candidate_matrix directly instead of this one-off wrapper, which
    rebuilds a matrix from scratch on every call."""
    return _vectorized_find_best_match(embedding, candidates, settings.attendance_ai_match_threshold)


async def upsert_attendance_from_recognition(
    db: AsyncSession,
    student_staff_id: str,
    occurred_at: datetime,
    camera: Camera | None = None,
    off_hours_module_active: bool = True,
    frame_bytes: bytes | None = None,
) -> AttendanceRecord:
    """First sighting of the day (on ANY camera the attendance module runs
    on) inserts the row — sets check_in and the keldi/kech_keldi status.
    A later sighting the same day only ever advances check_out, and ONLY
    when it comes from a camera flagged Camera.is_exit — see that field's
    docstring. Without this gate, check_out was really just "last seen by
    ANY camera today," so being spotted once by an ordinary interior
    camera (a classroom, a hallway) silently doubled as "left the
    building." A later non-exit sighting still confirms the person is on
    campus (harmless no-op here) without touching check_out; status and
    check_in from the first sighting are always left alone either way.

    `camera` is optional only for callers (tests, mainly) that don't care
    about TT kriteriya 3 — passing it lets a genuine first-sighting-of-the-
    day check-in outside operating hours raise a real Event, exactly like
    any other AI-detected incident.

    `off_hours_module_active` defaults to True so direct/test callers keep
    working unchanged — the real sweep loop (run_attendance_ai_sweep_once)
    checks AIModuleConfig.active for module #3 ONCE per sweep and passes
    the result through here, rather than every call re-querying it.

    occurred_at is converted to the institute's local clock (see
    app/timezone.py) before its date/time are extracted — record_date is
    the LOCAL calendar day (not UTC's, which would misfile a real local
    midnight-to-5am arrival under yesterday's date), and occurred_time is
    what actually gets compared against attendance_ai_late_cutoff, itself
    written as a local clock time.

    Kunlik davomat dars jadvaliga BOG'LIQ EMAS — institut talabi. Qaysi
    darsda qachon bo'lgani alohida, tashriflar orqali ko'rsatiladi
    (app/models/presence_visit.py, app/routers/presence.py)."""
    local_occurred_at = to_local(occurred_at)
    record_date = local_occurred_at.date()
    occurred_time = local_occurred_at.time().replace(microsecond=0)
    is_exit_sighting = camera is not None and camera.is_exit

    existing = (
        await db.execute(
            select(AttendanceRecord)
            .where(AttendanceRecord.student_staff_id == student_staff_id)
            .where(AttendanceRecord.date == record_date)
        )
    ).scalar_one_or_none()
    is_first_sighting_today = existing is None
    wrote_something = False
    created = False
    person: StudentStaff | None = None

    if is_first_sighting_today:
        status, check_in = first_sighting_status(occurred_time, camera)

        # on_conflict_do_nothing (not do_update): a concurrent sighting on
        # another camera may have inserted the row a moment ago — that
        # insert already owns check_in/status for today, so this one backs
        # off rather than overwriting it. The re-fetch below then behaves
        # exactly like a normal "not first sighting" call.
        stmt = (
            insert(AttendanceRecord)
            .values(
                student_staff_id=student_staff_id,
                date=record_date,
                status=status,
                check_in=check_in,
                check_out=None,
            )
            .on_conflict_do_nothing(index_elements=[AttendanceRecord.student_staff_id, AttendanceRecord.date])
            .returning(AttendanceRecord)
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        if record is None:
            existing = (
                await db.execute(
                    select(AttendanceRecord)
                    .where(AttendanceRecord.student_staff_id == student_staff_id)
                    .where(AttendanceRecord.date == record_date)
                )
            ).scalar_one()
        else:
            wrote_something = True
            created = True
    if not wrote_something and existing is not None and is_exit_sighting:
        # populate_existing=True: without it, when this same day's row is
        # already in the session's identity map, SQLAlchemy's ORM-enabled
        # RETURNING silently keeps the stale cached object instead of
        # applying the just-updated check_out.
        stmt = (
            update(AttendanceRecord)
            .where(AttendanceRecord.id == existing.id)
            .values(check_out=occurred_time)
            .returning(AttendanceRecord)
        )
        record = (await db.execute(stmt.execution_options(populate_existing=True))).scalar_one()
        wrote_something = True
    elif not wrote_something:
        record = existing

    # person is already fetched above whenever this was a first sighting
    # (needed for the lesson lookup) — only the non-first-sighting,
    # exit-camera-checkout path still needs to fetch it here, and only for
    # the audit log entry. Skips the lookup entirely for the common no-op
    # case (a mid-day sighting on an ordinary, non-exit camera writes
    # nothing) — this function runs once per matched face per sweep tick,
    # so an unneeded StudentStaff SELECT here isn't free at scale.
    #
    # Audit jurnaliga faqat kunning BIRINCHI qaydi yoziladi. Chiqish
    # kamerasidagi har bir ko'rinish check_out ni yangilaydi — kirish oldida
    # turgan odam uchun bu har necha soniyada bo'ladi va jurnal bir odamning
    # bir xil yozuvi bilan to'lib ketardi (2026-09-18: 10 daqiqada 14 ta).
    if person is None and created:
        person = await db.get(StudentStaff, student_staff_id)
    if created:
        db.add(
            AuditLog(
                user_id=None,
                user_name="AI davomat tizimi",
                action=f"Yuzni tanish orqali davomat qayd etildi: {person.full_name if person else student_staff_id}",
                module="Talabalar",
                status="muvaffaqiyatli",
                ip="internal",
            )
        )

    if (
        off_hours_module_active
        and camera is not None
        and is_first_sighting_today
        and _is_off_hours(occurred_time, at_entrance=camera.is_entrance)
    ):
        await raise_event(
            db,
            camera=camera,
            module_code=OFF_HOURS_MODULE_CODE,
            module_name=OFF_HOURS_MODULE_NAME,
            group="A",
            confidence=100,  # this is a rule (a time comparison), not a model score
            severity="o'rta",
            frame_bytes=frame_bytes,
            person_name=person.full_name if person else None,
            details={"reason": f"Ish vaqtidan tashqari ({occurred_time.strftime('%H:%M')}) binoga kirish qayd etildi"},
        )
    else:
        await db.commit()
    return record


async def process_camera_frame(
    frame_bytes: bytes,
    db: AsyncSession,
    camera: Camera | None = None,
    occurred_at: datetime | None = None,
    candidates: CandidateMatrix | None = None,
    off_hours_module_active: bool = True,
    staff_module_active: bool = True,
    student_module_active: bool = True,
    faces: list | None = None,
    inference_priority: int = PRIORITY_BACKGROUND,
) -> list[AttendanceRecord]:
    """Checks EVERY face in the frame — not just the largest — and writes
    an attendance record for each one that matches an enrolled person.

    Found necessary from real classroom testing, not a hypothetical: a
    classroom camera routinely sees several people at once (the same
    observation that drove app/jobs/vision_ai.py to check every face
    rather than just one). The original single-largest-face version gave
    attendance credit only to whoever happened to be closest to the
    camera each tick — a second enrolled person standing right next to
    them, clearly visible, got nothing, tick after tick, with no error
    and no log line to explain why.

    Returns an empty list — not an error — for "no faces in frame" and
    "no confident matches", both routine outcomes for an unattended
    hallway/entrance camera most of the time. `camera` is passed straight
    through to upsert_attendance_from_recognition() for TT kriteriya 3
    (off-hours entry) — see its docstring.

    `candidates` lets a sweep loop load the enrolled-population matrix
    ONCE and pass the same CandidateMatrix into every camera's call this
    tick, instead of each camera re-querying and re-parsing the same
    embeddings from the DB (see app/services/face_matching.py's module
    docstring for why that matters at scale). Defaults to a self-load for
    simple/one-off callers (tests, mainly).

    `faces` lets app/jobs/unified_face_sweep.py pass pre-detected faces
    from a shared detect_faces() call — skips a redundant inference pass."""
    if faces is None:
        faces = await detect_faces(frame_bytes, priority=inference_priority)
    if not faces:
        return []

    if candidates is None:
        candidates = await load_candidate_matrix_for_sweep(db)
    if candidates.is_empty:
        return []

    moment = occurred_at or local_now()
    embeddings = np.stack([face.embedding for face in faces])
    graded = candidates.graded_matches(
        embeddings,
        strict_threshold=settings.attendance_ai_match_threshold,
        relaxed_threshold=_relaxed_threshold(),
        margin=settings.attendance_ai_relaxed_margin,
        strict_margin=settings.attendance_ai_strict_margin,
    )
    camera_key = str(camera.id) if camera is not None else None
    recognition_stats.record_frame(camera_key, faces, graded)

    matched_ids: set[str] = set()
    records: list[AttendanceRecord] = []
    for face, match in zip(faces, graded, strict=True):
        if match.person_id is None:
            continue
        student_staff_id, similarity = match.person_id, match.similarity
        if student_staff_id in matched_ids:
            continue  # two faces in one frame matching the same person is a coincidence, not two sightings
        person_type = candidates.person_type(student_staff_id)
        if person_type == "xodim" and not staff_module_active:
            continue
        if person_type == "talaba" and not student_module_active:
            continue

        small_face = recognition_stats.face_height_px(face) < settings.attendance_min_face_px
        if match.grade == "strict":
            # Kichik yuz uchun kalibrlashdan oldingi, yuqoriroq chegara
            # saqlanadi (attendance_small_face_match_threshold izohiga
            # qarang) — aks holda 20 pikselli yuz ham davomat yozardi.
            if small_face and similarity < settings.attendance_small_face_match_threshold:
                continue
            recognition_stats.note_strict_sighting(student_staff_id)
            recognition_stats.record_credit(camera_key, "strict")
        else:
            # Yumshoq moslik: kichik yuz uchun umuman qabul qilinmaydi,
            # qolganlari esa ikkinchi ko'rinish bilan tasdiqlanishi shart.
            if small_face:
                continue
            if not recognition_stats.confirm_relaxed(student_staff_id):
                recognition_stats.record_credit(camera_key, "relaxed_pending")
                continue
            recognition_stats.record_credit(camera_key, "relaxed_confirmed")

        matched_ids.add(student_staff_id)
        logger.info(
            "attendance AI matched a face",
            extra={
                "student_staff_id": student_staff_id,
                "similarity": round(similarity, 3),
                "second_similarity": round(match.second_similarity, 3),
                "grade": match.grade,
                "face_px": recognition_stats.face_height_px(face),
            },
        )
        if camera is not None:
            # "Kim qayerda qachon bo'lgani" — kunlik davomatdan mustaqil.
            await record_visit(db, student_staff_id, camera.id, moment, similarity)
        records.append(
            await upsert_attendance_from_recognition(
                db, student_staff_id, moment, camera, off_hours_module_active, frame_bytes
            )
        )

    return records


async def run_attendance_ai_sweep_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    """Grabs a frame from every reachable 'faol' camera and processes it —
    cameras run CONCURRENTLY (bounded by _camera_semaphore), not one at a
    time, and the candidate embedding matrix is loaded ONCE for the whole
    sweep and shared read-only across every camera task. See this
    module's _camera_semaphore docstring and app/services/face_matching.py
    for why both changes were necessary at hundreds of cameras / thousands
    of enrolled people — the old sequential, per-camera-reload version
    took N times as long as one camera at N cameras, which at 400 cameras
    meant sweeps stretching to minutes against a 30s target interval.

    Each camera gets its own DB session from session_factory (AsyncSession
    isn't safe for concurrent use across tasks) — defaults to the real
    app.database.SessionLocal; tests pass their own test session factory.
    A single camera's failure (bad stream, DB error) is logged and
    skipped, not allowed to fail the whole sweep. Returns how many people
    (across all cameras, this tick) got an attendance write — not how many
    frames matched, since one frame can match several people at once."""
    async with session_factory() as db:
        staff_module_active = await is_module_active(db, STAFF_ATTENDANCE_MODULE_CODE)
        student_module_active = await is_module_active(db, STUDENT_ATTENDANCE_MODULE_CODE)
        if not staff_module_active and not student_module_active:
            return 0
        off_hours_module_active = await is_module_active(db, OFF_HOURS_MODULE_CODE)
        result = await db.execute(
            select(Camera)
            .where(Camera.status == "faol")
            .where(
                or_(
                    camera_allows_module(STAFF_ATTENDANCE_MODULE_CODE),
                    camera_allows_module(STUDENT_ATTENDANCE_MODULE_CODE),
                )
            )
        )
        cameras = [c for c in result.scalars().all() if c.stream_url and is_reachable(c.last_seen_at)]
        candidates = await load_candidate_matrix_for_sweep(db)

        # Konfiguratsiya bo'shlig'i haqida ogohlantirish. is_exit ataylab
        # standart bo'yicha False (Camera.is_exit izohiga qarang) — uni
        # admin belgilashi kerak. Lekin hech kim belgilamasa, check_out
        # HECH QACHON yozilmaydi va 9-modul ("erta ketish") jimgina hech
        # narsa qilmaydi. Production auditda aynan shu holat: 11 ta kirish
        # kamerasi bor, chiqish kamerasi 0 ta. Bu jimgina o'tib ketadigan
        # xato edi — endi u loglarda ko'rinadi.
        if cameras and not any(c.is_exit for c in cameras):
            logger.warning(
                "no camera is flagged is_exit — check_out will never be recorded, "
                "so early-departure detection cannot work",
                extra={"entrance_cameras": sum(1 for c in cameras if c.is_entrance)},
            )

    if not cameras or candidates.is_empty:
        return 0

    async def _process_one(camera: Camera) -> int:
        async with camera_sweep_slot():
            if camera.is_entrance:
                frames = await grab_frame_burst_for_camera(
                    camera,
                    settings.attendance_entrance_burst_frame_count,
                    settings.attendance_entrance_burst_gap_seconds,
                )
            else:
                frame = await grab_frame_for_camera(camera)
                frames = [frame] if frame is not None else []
            if not frames:
                return 0

            async with session_factory() as camera_db:
                # ANY frame in the burst matching a person is enough to
                # credit them once — not majority voting like vision_ai's
                # sleep confirmation, since a burst here exists purely to
                # maximize the chance of catching someone only briefly in
                # frame, and upsert_attendance_from_recognition is already
                # idempotent per (person, day), so re-processing the same
                # person across multiple frames just advances check_out
                # rather than double-crediting them.
                credited: set[str] = set()
                for frame in frames:
                    records = await process_camera_frame(
                        frame,
                        camera_db,
                        camera,
                        candidates=candidates,
                        off_hours_module_active=off_hours_module_active,
                        staff_module_active=staff_module_active,
                        student_module_active=student_module_active,
                    )
                    credited.update(str(r.student_staff_id) for r in records)
                return len(credited)

    results = await asyncio.gather(*(_process_one(camera) for camera in cameras), return_exceptions=True)

    match_count = 0
    for camera, result in zip(cameras, results, strict=True):
        if isinstance(result, BaseException):
            logger.exception(
                "attendance AI camera task failed", extra={"camera_id": str(camera.id)}, exc_info=result
            )
            continue
        match_count += result
    return match_count


async def _entrance_cameras(db: AsyncSession) -> list[Camera]:
    """Davomat moduli yoqilgan, tarmoqda javob berayotgan kirish/chiqish kameralari."""
    result = await db.execute(
        select(Camera)
        .where(Camera.status == "faol")
        .where(or_(Camera.is_entrance, Camera.is_exit))
        .where(
            or_(
                camera_allows_module(STAFF_ATTENDANCE_MODULE_CODE),
                camera_allows_module(STUDENT_ATTENDANCE_MODULE_CODE),
            )
        )
    )
    cameras = [c for c in result.scalars().all() if c.stream_url and is_reachable(c.last_seen_at)]

    # Konfiguratsiya bo'shlig'i haqida ogohlantirish. is_exit ataylab
    # standart bo'yicha False (Camera.is_exit izohiga qarang) — uni
    # admin belgilashi kerak. Lekin hech kim belgilamasa, check_out
    # HECH QACHON yozilmaydi va 9-modul ("erta ketish") jimgina hech
    # narsa qilmaydi. Production auditda aynan shu holat: 11 ta kirish
    # kamerasi bor, chiqish kamerasi 0 ta. Bu jimgina o'tib ketadigan
    # xato edi — endi u loglarda ko'rinadi.
    if cameras and not any(c.is_exit for c in cameras):
        logger.warning(
            "no camera is flagged is_exit — check_out will never be recorded, "
            "so early-departure detection cannot work",
            extra={"entrance_cameras": sum(1 for c in cameras if c.is_entrance)},
        )
    return cameras


async def run_entrance_exit_attendance_sweep_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    """Har kirish/chiqish kamerasini BIR MARTA tekshiradi (burst) va
    tugashini kutadi — testlar va qo'lda tekshirish uchun. Productionda
    rejalashtiruvchi run_entrance_exit_attendance_dispatch_once ni
    chaqiradi: u har kameraga doimiy kuzatuvchi qo'yadi.

    unified_face_sweep.py is_entrance/is_exit kameralarni o'z davomat
    tekshiruvidan chiqaradi — bir kamerani ikki marta tahlil qilmaslik
    uchun; u bu kameralarda begona shaxs va boshqa tekshiruvlarni odatiy
    sur'atda davom ettiradi."""
    async with session_factory() as db:
        staff_module_active = await is_module_active(db, STAFF_ATTENDANCE_MODULE_CODE)
        student_module_active = await is_module_active(db, STUDENT_ATTENDANCE_MODULE_CODE)
        if not staff_module_active and not student_module_active:
            return 0
        off_hours_module_active = await is_module_active(db, OFF_HOURS_MODULE_CODE)
        cameras = await _entrance_cameras(db)
        candidates = await load_candidate_matrix_for_sweep(db)

    if not cameras or candidates.is_empty:
        return 0

    async def _process_one(camera: Camera) -> int:
        started = monotonic()
        async with entrance_exit_sweep_slot():
            grab_started = monotonic()
            frames = await grab_frame_burst_for_camera(
                camera,
                settings.attendance_entrance_burst_frame_count,
                settings.attendance_entrance_burst_gap_seconds,
            )
            grab_seconds = monotonic() - grab_started
            if not frames:
                recognition_stats.record_cycle(
                    str(camera.id), total_seconds=monotonic() - started, grab_seconds=grab_seconds
                )
                return 0

            async with session_factory() as camera_db:
                credited: set[str] = set()
                for frame in frames:
                    records = await process_camera_frame(
                        frame,
                        camera_db,
                        camera,
                        candidates=candidates,
                        off_hours_module_active=off_hours_module_active,
                        staff_module_active=staff_module_active,
                        student_module_active=student_module_active,
                        # Eshik kadri xona kameralaridan oldin tahlil qilinsin
                        # (app/services/inference_gate.py, PRIORITY_ATTENDANCE).
                        inference_priority=PRIORITY_ATTENDANCE,
                    )
                    credited.update(str(r.student_staff_id) for r in records)
            recognition_stats.record_cycle(
                str(camera.id), total_seconds=monotonic() - started, grab_seconds=grab_seconds
            )
            return len(credited)

    results = await asyncio.gather(*(_process_one(camera) for camera in cameras), return_exceptions=True)

    match_count = 0
    for camera, result in zip(cameras, results, strict=True):
        if isinstance(result, BaseException):
            logger.exception(
                "entrance/exit attendance camera task failed", extra={"camera_id": str(camera.id)}, exc_info=result
            )
            continue
        match_count += result
    return match_count


# ── Kirish/chiqish kameralarini doimiy kuzatish ─────────────────────────────
#
# Ilgari dispetcher har 6 s da har kameraga QISQA vazifa ochardi: vazifa
# 11 kameraga 6 ta slotdan birini kutar, 3 kadrlik burst yig'ar (har kadr
# yangi kalit kadrni kutadi — kameralar uni har 4 s da beradi), tahlil
# qilib tugar va keyingi dispetcherni kutardi. Productionda (2026-09-18)
# bitta kamera 21-100 s da bir marta tekshirilardi, odam esa eshikdan 2-3 s
# da o'tib ketadi — ko'pchilik birorta tahlil qilingan kadrga tushmasdi.
#
# Endi har kameraning o'z kuzatuvchisi bor: u kesh yangi kadr berishi bilan
# uni AYNAN bir marta tahlil qiladi va darhol keyingisini kutadi. Kutish
# CPU olmaydi; slot faqat tahlil paytida olinadi. Dispetcher (rejalashtiruvchi,
# har 6 s) faqat kuzatuvchilarni boshlaydi, yangilaydi va to'xtatadi.

# Ketma-ket shuncha marta yangi kadr kelmasa, keyingi urinish "yangidan"
# boshlanadi — asosiy oqim umuman ishlamay qolgan bo'lsa zaxira substream'ga
# o'tishga imkon beradi (frame_grabber._note_main_stream_result).
ENTRANCE_MISSES_BEFORE_RESET = 2
ENTRANCE_MAX_BACKOFF_SECONDS = 5.0
ENTRANCE_ERROR_PAUSE_SECONDS = 5.0


@dataclass
class _EntranceContext:
    """Dispetcher har safar yangilaydigan umumiy holat: kuzatuvchilar har
    kadrda eng yangisini o'qiydi (modul o'chirilsa, ro'yxat yangilansa)."""

    session_factory: async_sessionmaker[AsyncSession]
    candidates: CandidateMatrix
    staff_active: bool
    student_active: bool
    off_hours_active: bool


@dataclass
class _EntranceWatcher:
    signature: tuple
    task: asyncio.Task | None = None
    # Oxirgi dispetcherdan beri davomatga yozilgan odamlar soni.
    matched: int = 0


_entrance_context: _EntranceContext | None = None
_entrance_watchers: dict[str, _EntranceWatcher] = {}


def _camera_signature(camera: Camera) -> tuple:
    """Kuzatuvchi eski Camera nusxasi bilan ishlaydi — shu maydonlardan biri
    o'zgarsa (ulanish, kirish/chiqish belgisi, modul ro'yxati) u qayta
    yaratiladi."""
    return (
        camera.name,
        camera.ip,
        camera.port,
        camera.rtsp_path,
        camera.rtsp_username,
        camera.rtsp_password,
        camera.is_entrance,
        camera.is_exit,
        camera.is_perimeter,
        tuple(camera.excluded_module_codes or ()),
        camera.building_id,
    )


async def _analyse_entrance_frame(camera: Camera, frame: bytes, context: _EntranceContext) -> int:
    async with entrance_exit_sweep_slot():
        async with context.session_factory() as db:
            records = await process_camera_frame(
                frame,
                db,
                camera,
                candidates=context.candidates,
                off_hours_module_active=context.off_hours_active,
                staff_module_active=context.staff_active,
                student_module_active=context.student_active,
                # Eshik kadri xona kameralaridan oldin tahlil qilinsin
                # (app/services/inference_gate.py, PRIORITY_ATTENDANCE).
                inference_priority=PRIORITY_ATTENDANCE,
            )
    return len({str(r.student_staff_id) for r in records})


async def _watch_entrance_camera(camera: Camera, watcher: _EntranceWatcher) -> None:
    """Bitta kirish/chiqish kamerasini to'xtovsiz kuzatadi (bekor
    qilinguncha): har yangi kadr — bitta tahlil."""
    key = str(camera.id)
    last_seq: int | None = None
    misses = 0
    previous_analysis = monotonic()
    while True:
        try:
            context = _entrance_context
            if context is None:
                await asyncio.sleep(1.0)
                continue
            waited_from = monotonic()
            latest = await grab_newer_frame(
                camera, wait_seconds=frame_wait_seconds_for_camera(camera), after_seq=last_seq
            )
            grab_seconds = monotonic() - waited_from
            if latest is None:
                misses += 1
                if misses >= ENTRANCE_MISSES_BEFORE_RESET:
                    last_seq = None
                await asyncio.sleep(min(float(misses), ENTRANCE_MAX_BACKOFF_SECONDS))
                continue
            misses = 0
            frame, last_seq = latest
            watcher.matched += await _analyse_entrance_frame(camera, frame, context)
            now = monotonic()
            recognition_stats.record_cycle(
                key, total_seconds=now - previous_analysis, grab_seconds=grab_seconds, stream=stream_label(camera)
            )
            previous_analysis = now
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("entrance/exit watcher failed on a frame", extra={"camera_id": key})
            await asyncio.sleep(ENTRANCE_ERROR_PAUSE_SECONDS)


def _reconcile_entrance_watchers(cameras: list[Camera], start=_watch_entrance_camera) -> int:
    """Kuzatuvchilar ro'yxatini kerakli kameralarga moslaydi va oxirgi
    chaqiruvdan beri yozilgan mosliklar sonini qaytaradi.

    - ro'yxatdan chiqqan kamera (o'chirilgan, tarmoqdan tushgan, modul
      o'chirilgan) — kuzatuvchisi to'xtatiladi;
    - sozlamasi o'zgargan kamera — yangi nusxa bilan qayta boshlanadi;
    - kutilmaganda to'xtagan kuzatuvchi — xatosi yozilib, qayta boshlanadi."""
    wanted = {str(camera.id): camera for camera in cameras}
    matched = 0
    for key, watcher in list(_entrance_watchers.items()):
        matched += watcher.matched
        watcher.matched = 0
        task = watcher.task
        camera = wanted.get(key)
        finished = task is None or task.done()
        if finished and task is not None and not task.cancelled() and task.exception() is not None:
            error = task.exception()
            logger.error(
                "entrance/exit watcher stopped", extra={"camera_id": key},
                exc_info=(type(error), error, error.__traceback__),
            )
        if camera is not None and not finished and watcher.signature == _camera_signature(camera):
            continue
        if task is not None and not task.done():
            task.cancel()
        del _entrance_watchers[key]

    for key, camera in wanted.items():
        if key in _entrance_watchers:
            continue
        watcher = _EntranceWatcher(signature=_camera_signature(camera))
        watcher.task = asyncio.create_task(start(camera, watcher), name=f"entrance-watch:{key}")
        _entrance_watchers[key] = watcher
    return matched


async def run_entrance_exit_attendance_dispatch_once(
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> int:
    """Rejalashtiruvchi uchun (har entrance_exit_attendance_interval_seconds):
    kuzatuvchilarni boshqaradi va oldingi chaqiruvdan beri yozilgan
    mosliklar sonini qaytaradi. O'zi kadr kutmaydi — darhol qaytadi."""
    global _entrance_context
    async with session_factory() as db:
        staff_active = await is_module_active(db, STAFF_ATTENDANCE_MODULE_CODE)
        student_active = await is_module_active(db, STUDENT_ATTENDANCE_MODULE_CODE)
        if not staff_active and not student_active:
            _entrance_context = None
            return _reconcile_entrance_watchers([])
        off_hours_active = await is_module_active(db, OFF_HOURS_MODULE_CODE)
        cameras = await _entrance_cameras(db)
        candidates = await load_candidate_matrix_for_sweep(db)

    _entrance_context = _EntranceContext(
        session_factory=session_factory,
        candidates=candidates,
        staff_active=staff_active,
        student_active=student_active,
        off_hours_active=off_hours_active,
    )
    return _reconcile_entrance_watchers([] if candidates.is_empty else cameras)


def entrance_watcher_count() -> int:
    return sum(1 for w in _entrance_watchers.values() if w.task is not None and not w.task.done())


async def stop_entrance_watchers() -> None:
    """Ilova to'xtaganda: kuzatuvchilar bekor qilinadi va tugashi kutiladi."""
    global _entrance_context
    _entrance_context = None
    tasks = [w.task for w in _entrance_watchers.values() if w.task is not None]
    _entrance_watchers.clear()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def attendance_ai_loop() -> None:
    while True:
        try:
            count = await _sweep_guard.run(run_attendance_ai_sweep_once)
            if count:
                logger.info("attendance AI sweep complete", extra={"matches": count})
        except Exception:
            logger.exception("attendance AI sweep failed")
        await asyncio.sleep(settings.attendance_ai_interval_seconds)
