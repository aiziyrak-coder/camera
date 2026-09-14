"""Dublikatlarni birlashtirish.

Skript odam yozuvini O'CHIRADI, shuning uchun eng muhim shartlar:
yuzi tasdiqlangan yozuv va uning identifikatori saqlanishi, hech qanday
davomat yoki dars bog'lanishi yo'qolmasligi, va shubhali (namesake)
holatlarga umuman tegilmasligi.
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.models import AttendanceRecord, AuditLog, Faculty, LessonAttendance, LessonSession, StudentStaff
from scripts.merge_duplicate_people import name_key, run
from tests.conftest import TestSessionLocal


def _imported(name, pinfl, faculty_id, unit="Biotibbiyot muhandisligi kafedrasi", type="xodim"):
    return StudentStaff(full_name=name, type=type, pinfl=pinfl, faculty_id=faculty_id,
                        group_or_position=unit, biometrics_status="yoq")


def _manual(name, unit="Katta o'qituvchi", type="xodim"):
    return StudentStaff(full_name=name, type=type, group_or_position=unit,
                        biometrics_status="tasdiqlangan", biometric_embedding="[0.1]",
                        biometric_photo_key="biometrics/face.jpg")


@pytest.fixture
async def faculty(db_session, seeded) -> Faculty:
    return (await db_session.execute(select(Faculty).limit(1))).scalar_one()


async def _people(db_session) -> list[StudentStaff]:
    db_session.expire_all()
    return list((await db_session.execute(select(StudentStaff).order_by(StudentStaff.full_name))).scalars().all())


def test_name_key_ignores_case_spacing_and_apostrophe_style():
    assert name_key("G‘aniyev  Aziz O‘G‘LI") == name_key("g'aniyev aziz o'g'li")


class TestMerge:
    async def test_the_confirmed_record_keeps_its_face_and_receives_the_imported_data(self, db_session, faculty):
        source = _imported("Nosirov Nodirbek Valijonovich", "30000000000047", faculty.id)
        keep = _manual("Nosirov Nodirbek Valijonovich")
        db_session.add_all([source, keep])
        await db_session.commit()
        keep_id = keep.id

        plan = await run(session_factory=TestSessionLocal)
        assert len(plan.pairs) == 1

        (person,) = await _people(db_session)
        assert person.id == keep_id  # yuz tanish shu identifikatorga bog'langan
        assert person.pinfl == "30000000000047"
        assert person.faculty_id == faculty.id
        assert person.group_or_position == "Biotibbiyot muhandisligi kafedrasi"
        assert person.biometrics_status == "tasdiqlangan"
        assert person.biometric_embedding == "[0.1]"

        audit = (await db_session.execute(select(AuditLog).where(AuditLog.user_name == "Dublikatlarni birlashtirish"))).scalars().all()
        assert len(audit) == 1
        assert "30000000000047" not in audit[0].action  # jurnalda JSHSHIR to'liq yozilmaydi

    async def test_apostrophe_and_case_differences_still_match(self, db_session, faculty):
        db_session.add_all([
            _imported("G‘aniyev Aziz Olim o‘g‘li", "30000000000048", faculty.id),
            _manual("g'aniyev  aziz olim o'g'li"),
        ])
        await db_session.commit()
        await run(session_factory=TestSessionLocal)
        (person,) = await _people(db_session)
        assert person.full_name == "G‘aniyev Aziz Olim o‘g‘li"  # rasmiy ro'yxatdagi yozilish
        assert person.pinfl == "30000000000048"

    async def test_links_to_the_removed_copy_move_to_the_kept_record(self, db_session, faculty):
        source = _imported("Gasanova Nigora Muxtorovna", "40000000000037", faculty.id)
        keep = _manual("Gasanova Nigora Muxtorovna", unit="Assistent")
        db_session.add_all([source, keep])
        await db_session.flush()

        lesson = LessonSession(date=date(2026, 9, 14), group_name="DI-1625", faculty="Davolash ishi",
                               teacher="Gasanova N.", subject="Biofizika", attention_score=0,
                               teacher_activity_score=0, teacher_id=source.id)
        other_lesson = LessonSession(date=date(2026, 9, 14), group_name="DI-1626", faculty="Davolash ishi",
                                     teacher="Gasanova N.", subject="Biofizika", attention_score=0,
                                     teacher_activity_score=0)
        db_session.add_all([lesson, other_lesson])
        await db_session.flush()
        db_session.add_all([
            AttendanceRecord(student_staff_id=source.id, date=date(2026, 9, 12), status="keldi"),
            AttendanceRecord(student_staff_id=source.id, date=date(2026, 9, 13), status="kech_keldi"),
            AttendanceRecord(student_staff_id=keep.id, date=date(2026, 9, 13), status="keldi"),  # to'qnashuv
            LessonAttendance(lesson_session_id=other_lesson.id, student_staff_id=source.id, sightings=4),
        ])
        await db_session.commit()
        keep_id, lesson_id = keep.id, lesson.id

        await run(session_factory=TestSessionLocal)
        db_session.expire_all()

        days = {
            r.date: r.status
            for r in (await db_session.execute(select(AttendanceRecord))).scalars().all()
        }
        assert days == {date(2026, 9, 12): "keldi", date(2026, 9, 13): "keldi"}  # to'qnashuvda tasdiqlangandagisi
        assert all(
            r.student_staff_id == keep_id
            for r in (await db_session.execute(select(AttendanceRecord))).scalars().all()
        )
        moved = (await db_session.execute(select(LessonAttendance))).scalar_one()
        assert moved.student_staff_id == keep_id
        assert (await db_session.get(LessonSession, lesson_id)).teacher_id == keep_id

    async def test_dry_run_changes_nothing(self, db_session, faculty):
        db_session.add_all([_imported("Nosirov Nodirbek Valijonovich", "30000000000047", faculty.id),
                            _manual("Nosirov Nodirbek Valijonovich")])
        await db_session.commit()
        plan = await run(dry_run=True, session_factory=TestSessionLocal)
        assert len(plan.pairs) == 1
        assert len(await _people(db_session)) == 2

    async def test_second_run_finds_nothing(self, db_session, faculty):
        db_session.add_all([_imported("Nosirov Nodirbek Valijonovich", "30000000000047", faculty.id),
                            _manual("Nosirov Nodirbek Valijonovich")])
        await db_session.commit()
        await run(session_factory=TestSessionLocal)
        plan = await run(session_factory=TestSessionLocal)
        assert plan.pairs == []
        assert len(await _people(db_session)) == 1


class TestSuspiciousCasesAreLeftAlone:
    async def test_two_imported_namesakes_are_not_guessed(self, db_session, faculty):
        db_session.add_all([
            _imported("Karimov Aziz Olimovich", "30000000000001", faculty.id),
            _imported("Karimov Aziz Olimovich", "30000000000002", faculty.id, unit="Anatomiya"),
            _manual("Karimov Aziz Olimovich"),
        ])
        await db_session.commit()
        plan = await run(session_factory=TestSessionLocal)
        assert plan.pairs == []
        assert len(plan.ambiguous) == 1
        assert len(await _people(db_session)) == 3

    async def test_partial_name_is_reported_not_merged(self, db_session, faculty):
        db_session.add_all([
            _imported("Nosirov Nodirbek Valijonovich", "30000000000047", faculty.id),
            _manual("Nosirov Nodirbek"),
        ])
        await db_session.commit()
        plan = await run(session_factory=TestSessionLocal)
        assert plan.pairs == []
        assert len(plan.partial) == 1
        assert len(await _people(db_session)) == 2

    async def test_a_student_and_a_staff_member_are_never_merged(self, db_session, faculty):
        db_session.add_all([
            _imported("Rahimova Dilnoza Oybek qizi", "60000000000011", faculty.id, unit="2-kurs, DI-1625",
                      type="talaba"),
            _manual("Rahimova Dilnoza Oybek qizi"),
        ])
        await db_session.commit()
        plan = await run(session_factory=TestSessionLocal)
        assert plan.pairs == []
        assert len(plan.cross_type) == 1

    async def test_two_real_people_with_their_own_pinfl_are_untouched(self, db_session, faculty):
        confirmed_with_pinfl = _manual("Aliyev Vali Karimovich")
        confirmed_with_pinfl.pinfl = "30000000000009"
        db_session.add_all([confirmed_with_pinfl,
                            _imported("Aliyev Vali Karimovich", "30000000000010", faculty.id)])
        await db_session.commit()
        plan = await run(session_factory=TestSessionLocal)
        assert plan.pairs == []
        count = await db_session.scalar(select(func.count()).select_from(StudentStaff))
        assert count == 2
