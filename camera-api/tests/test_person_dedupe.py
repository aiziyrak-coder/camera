"""Talaba/xodim dublikatlari (app/services/person_dedupe.py, /api/students-staff/dublikatlar)."""

import uuid
from datetime import date, time

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AttendanceRecord, AuditLog, StudentStaff
from app.services.person_dedupe import group_duplicates, name_tokens
from tests.conftest import auth_headers

pytestmark = pytest.mark.anyio


def _row(name, *, type_="xodim", pinfl=None, self_registered=False, bio="yoq", att=0, id_=None):
    return {"id": id_ or name, "full_name": name, "type": type_, "pinfl": pinfl, "self_registered": self_registered,
            "biometrics_status": bio, "att": att, "group_or_position": ""}


class TestGrouping:
    def test_spelling_variants_are_one_person(self):
        assert name_tokens("Dolimov Xayotjon Xakimjon o'g'li") == name_tokens("Dolimov Xayotjon Xakimjon oʻgʻli")
        groups = group_duplicates([
            _row("Akramova Dilnozaxon Bahramjon qizi"), _row("Akramova Dilnozaxon Baxramjon Kizi", pinfl="1" * 14),
        ])
        assert len(groups) == 1
        # Rasmiy (JSHSHIRli) yozuv qoladi.
        assert groups[0].keeper["pinfl"] == "1" * 14

    def test_missing_patronymic_still_matches(self):
        groups = group_duplicates([_row("Davranova Poraxotxon"), _row("Davranova Poraxotxon Olimovna")])
        assert len(groups) == 1

    def test_different_father_is_a_namesake(self):
        assert group_duplicates([
            _row("Yunusova Dilshoda Akmal qizi", type_="talaba"), _row("Yunusova Dilshoda Rustamovna", type_="talaba"),
        ]) == []

    def test_different_pinfl_is_a_namesake_but_a_typo_is_not(self):
        far = [_row("Karimov Ali Vali o'g'li", pinfl="30101990000011"), _row("Karimov Ali Vali o'g'li", pinfl="41212880555577")]
        near = [_row("Karimov Ali Vali o'g'li", pinfl="30101990000011"), _row("Karimov Ali Vali o'g'li", pinfl="30101990000017")]
        assert group_duplicates(far) == []
        assert len(group_duplicates(near)) == 1

    def test_student_and_staff_are_never_merged(self):
        assert group_duplicates([_row("Aliyev Anvar", type_="talaba"), _row("Aliyev Anvar", type_="xodim")]) == []

    def test_official_import_beats_self_registration(self):
        groups = group_duplicates([
            _row("Aibjonova Ruxshona Umid qizi", type_="talaba", self_registered=True, bio="tasdiqlangan", id_="self"),
            _row("Aibjonova Ruxshona Umid qizi", type_="talaba", pinfl="5" * 14, id_="hemis"),
        ])
        assert groups[0].keeper["id"] == "hemis"


class TestMergeApi:
    async def _people(self, db_session):
        official = StudentStaff(id=uuid.uuid4(), full_name="Qosimova Gulnoza", type="xodim", group_or_position="Kafedra", pinfl="30101990000011")
        manual = StudentStaff(
            id=uuid.uuid4(), full_name="Qosimova Gulnoza Soyibjonovna", type="xodim", group_or_position="Katta o'qituvchi",
            biometrics_status="tasdiqlangan", biometric_embedding="[0.1, 0.2]",
        )
        db_session.add_all([official, manual])
        official_id, manual_id = official.id, manual.id
        await db_session.commit()
        db_session.add_all([
            AttendanceRecord(student_staff_id=official_id, date=date(2026, 9, 22), status="keldi", check_in=time(9, 5)),
            AttendanceRecord(student_staff_id=manual_id, date=date(2026, 9, 22), status="keldi", check_in=time(8, 1)),
            AttendanceRecord(student_staff_id=manual_id, date=date(2026, 9, 23), status="keldi", check_in=time(8, 10)),
        ])
        await db_session.commit()
        return official_id, manual_id

    async def test_list_and_merge_keeps_everything(self, client: AsyncClient, db_session, seeded):
        official_id, manual_id = await self._people(db_session)
        headers = await auth_headers(client, "admin", "admin123")

        groups = (await client.get("/api/students-staff/dublikatlar", headers=headers)).json()
        group = next(g for g in groups if g["keeper"]["id"] == str(official_id))
        assert [d["id"] for d in group["duplicates"]] == [str(manual_id)]
        assert "pinfl" not in group["keeper"]  # raqamning o'zi chiqmaydi

        res = await client.post(
            "/api/students-staff/dublikatlar/birlashtirish",
            headers=headers,
            json={"groups": [{"keepId": str(official_id), "removeIds": [str(manual_id)]}]},
        )
        assert res.status_code == 200, res.text
        assert res.json() == {"mergedGroups": 1, "removed": 1, "errors": []}

        db_session.expire_all()
        kept = await db_session.get(StudentStaff, official_id)
        assert await db_session.get(StudentStaff, manual_id) is None
        # Yuz, to'liq ism va JSHSHIR bitta yozuvda.
        assert kept.biometrics_status == "tasdiqlangan" and kept.biometric_embedding == "[0.1, 0.2]"
        assert kept.full_name == "Qosimova Gulnoza Soyibjonovna"
        assert kept.pinfl == "30101990000011"
        records = (await db_session.execute(
            select(AttendanceRecord).where(AttendanceRecord.student_staff_id == official_id).order_by(AttendanceRecord.date)
        )).scalars().all()
        # 22-sentabr ikkalasida bor edi — ertaroq kelgani (08:01) qoldi; 23-sentabr ko'chdi.
        assert [(r.date.day, r.check_in) for r in records] == [(22, time(8, 1)), (23, time(8, 10))]
        audit = (await db_session.execute(select(AuditLog).where(AuditLog.action.like("Dublikat birlashtirildi%")))).scalars().all()
        assert len(audit) == 1

    async def test_namesakes_are_refused(self, client: AsyncClient, db_session, seeded):
        a = StudentStaff(id=uuid.uuid4(), full_name="Yunusova Dilshoda Akmal qizi", type="talaba", group_or_position="4126")
        b = StudentStaff(id=uuid.uuid4(), full_name="Yunusova Dilshoda Rustamovna", type="talaba", group_or_position="4-kurs")
        a_id, b_id = a.id, b.id
        db_session.add_all([a, b])
        await db_session.commit()
        headers = await auth_headers(client, "admin", "admin123")
        res = await client.post(
            "/api/students-staff/dublikatlar/birlashtirish",
            headers=headers,
            json={"groups": [{"keepId": str(a_id), "removeIds": [str(b_id)]}]},
        )
        body = res.json()
        assert body["mergedGroups"] == 0 and body["errors"]
        db_session.expire_all()
        assert await db_session.get(StudentStaff, b_id) is not None

    async def test_requires_permission(self, client: AsyncClient):
        assert (await client.get("/api/students-staff/dublikatlar")).status_code in (401, 403)
