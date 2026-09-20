"""Guruh kodisiz birovning nomidan ro'yxatdan o'tib bo'lmaydi.

Nima tekshiriladi va nega. JSHSHIR sir emas: u hujjatda yozilgan va
kadrlar ro'yxatlarida bor. Tiriklik tekshiruvi esa "tirik odam"ni
isbotlaydi, "AYNAN SHU odam"ni emas. Ya'ni kod paydo bo'lgunicha
birovning JSHSHIRini bilgan odam o'z yuzini uning nomiga bog'lay
olardi va haqiqiy egasi keyin tizimga umuman kira olmay qolardi.

Kod shu bo'shliqni yopadi va u har uchala ochiq yo'lda ham talab
qilinadi: /lookup, /register va /submit.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import EnrollmentCode, StudentStaff
from app.routers import enrollment
from app.services import enrollment_code as codes
from tests.conftest import ENROLL_CODE, auth_headers

FRAMES = [("photos", (f"{step}.jpg", b"jpeg", "image/jpeg")) for step in ("front", "left", "right")]

#: Guruh kodi to'g'ri, lekin BOSHQA guruhniki.
OTHER_CODE = "P8Q3RS"


@pytest.fixture(autouse=True)
def fake_face_pipeline(monkeypatch):
    """Yuz modeli va obyekt ombori soxta: bu testlar kod haqida."""
    from app.config import settings

    monkeypatch.setattr(settings, "self_enrollment_auto_approve", True)

    async def no_liveness_check(frames):
        return None

    async def embedding(frames):
        return [0.1] * 512

    uploaded: list[str] = []

    def upload(data, filename, content_type, prefix):
        key = f"{prefix}/{len(uploaded)}-{filename}"
        uploaded.append(key)
        return str(len(uploaded)), key

    deleted: list[str] = []

    async def delete_quietly(keys):
        deleted.extend(k for k in keys if k)
        return len(deleted)

    monkeypatch.setattr(enrollment, "_verify_liveness", no_liveness_check)
    monkeypatch.setattr(enrollment, "extract_enrollment_embedding", embedding)
    monkeypatch.setattr(enrollment, "upload_file", upload)
    monkeypatch.setattr(enrollment, "delete_files_quietly", delete_quietly)
    return deleted


@pytest.fixture
async def a_student(db_session) -> StudentStaff:
    """Ro'yxatga import qilingan, hali yuzi yo'q talaba."""
    record = StudentStaff(
        full_name="Karimov Jasur", type="talaba", group_or_position="DI-2301", pinfl="30000000000011"
    )
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(record)
    return record


@pytest.fixture
async def group_code(db_session, a_student) -> str:
    """DI-2301 guruhining O'Z kodi. U bo'lgach, umumiy zaxira kod bu
    guruhga endi ishlamaydi."""
    row = EnrollmentCode(scope="guruh", unit_key="di-2301", unit_name="DI-2301", code="H4T6VW")
    db_session.add(row)
    await db_session.commit()
    return row.code


def _submit(client: AsyncClient, record_id, **data):
    return client.post(f"/api/public/enrollment/{record_id}/submit", data=data, files=FRAMES)


class TestSubmitRequiresTheCode:
    async def test_without_a_code_it_is_refused(self, client: AsyncClient, a_student):
        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, consent="true")
        assert resp.status_code == 403
        assert resp.json()["detail"] == codes.WRONG_CODE_MESSAGE

    async def test_a_wrong_code_looks_exactly_like_a_wrong_record(self, client: AsyncClient, a_student):
        """Ikkala javob AYNAN bir xil bo'lishi SHART.

        Farq bo'lsa, kodni bilmagan odam ham yozuv identifikatorlarini
        birma-bir sinab, kim bor-yo'qligini aniqlay olardi."""
        wrong_code = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=OTHER_CODE, consent="true")
        no_such_record = await _submit(
            client, "0f3d2a1c-0000-4000-8000-000000000000", pinfl=a_student.pinfl, code=ENROLL_CODE, consent="true"
        )
        assert wrong_code.status_code == no_such_record.status_code == 403
        assert wrong_code.json() == no_such_record.json()

    async def test_another_groups_code_does_not_work(self, client: AsyncClient, a_student, group_code, db_session):
        """DI-2301 ning o'z kodi bor — zaxira umumiy kod endi o'tmaydi."""
        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=ENROLL_CODE, consent="true")
        assert resp.status_code == 403
        assert resp.json()["detail"] == codes.WRONG_CODE_MESSAGE

    async def test_the_right_code_still_auto_approves(self, client: AsyncClient, a_student, group_code, db_session):
        """Mijozning sharti: qo'lda tasdiqlash kerak emas."""
        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=group_code, consent="true")
        assert resp.status_code == 200, resp.text
        assert resp.json()["biometricsStatus"] == "tasdiqlangan"

    async def test_the_code_is_read_forgivingly(self, client: AsyncClient, a_student, group_code):
        """Kod og'zaki aytiladi va kartadan ko'chiriladi — bo'sh joy,
        chiziqcha va kichik harf to'g'ri kodni rad etishga sabab bo'lmasin."""
        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=" h4t-6vw ", consent="true")
        assert resp.status_code == 200, resp.text

    async def test_the_pinfl_check_is_still_there(self, client: AsyncClient, a_student, group_code):
        """Kod to'g'ri bo'lsa ham, JSHSHIR yozuvga mos kelishi kerak —
        guruhdoshi boshqa talabaning yozuviga yuz qo'ya olmaydi."""
        resp = await _submit(client, a_student.id, pinfl="30000000000099", code=group_code, consent="true")
        assert resp.status_code == 403
        assert "JSHSHIR" in resp.json()["detail"]


@pytest.mark.usefixtures("seeded")
class TestExpiryAndRotation:
    async def test_regenerating_kills_the_old_code(self, client: AsyncClient, a_student, group_code, db_session):
        headers = await auth_headers(client, "admin", "admin123")
        resp = await client.post(
            "/api/enrollment-codes/regenerate", json={"scope": "guruh", "unit": "DI-2301"}, headers=headers
        )
        assert resp.status_code == 200, resp.text
        new_code = resp.json()["code"]
        assert new_code != group_code and len(new_code) == 6

        old = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=group_code, consent="true")
        assert old.status_code == 403
        fresh = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=new_code, consent="true")
        assert fresh.status_code == 200, fresh.text

    async def test_an_expired_code_is_refused(self, client: AsyncClient, a_student, group_code, db_session):
        from datetime import datetime, timedelta, timezone

        row = (
            await db_session.execute(select(EnrollmentCode).where(EnrollmentCode.unit_key == "di-2301"))
        ).scalar_one()
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db_session.commit()
        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=group_code, consent="true")
        assert resp.status_code == 403

    async def test_admin_sees_the_code(self, client: AsyncClient, group_code):
        headers = await auth_headers(client, "admin", "admin123")
        resp = await client.post(
            "/api/enrollment-codes/unit", json={"scope": "guruh", "unit": " di-2301 "}, headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == group_code  # nom tozalanadi — bu o'sha guruh
        assert (await client.get("/api/enrollment-codes", headers=headers)).status_code == 200

    async def test_codes_are_not_public(self, client: AsyncClient, group_code):
        assert (await client.get("/api/enrollment-codes")).status_code == 401


class TestLookupIsNotAnOracle:
    async def test_without_a_code_nothing_is_revealed(self, client: AsyncClient, a_student, group_code):
        """Kodsiz /lookup — ism ham, guruh ham, holat ham yo'q."""
        resp = await client.post("/api/public/enrollment/lookup", json={"pinfl": a_student.pinfl})
        assert resp.status_code == 404
        body = resp.json()
        assert "Karimov" not in str(body) and "DI-2301" not in str(body)

    async def test_a_wrong_code_answers_like_an_unknown_person(self, client: AsyncClient, a_student, group_code):
        wrong = await client.post(
            "/api/public/enrollment/lookup", json={"pinfl": a_student.pinfl, "code": OTHER_CODE}
        )
        unknown = await client.post(
            "/api/public/enrollment/lookup", json={"pinfl": "99999999999999", "code": OTHER_CODE}
        )
        assert wrong.status_code == unknown.status_code == 404
        assert wrong.json() == unknown.json()

    async def test_with_the_right_code_the_person_is_found(self, client: AsyncClient, a_student, group_code):
        resp = await client.post(
            "/api/public/enrollment/lookup", json={"pinfl": a_student.pinfl, "code": group_code}
        )
        assert resp.status_code == 200
        assert resp.json()["fullName"] == "Karimov Jasur"

    async def test_register_does_not_leak_an_existing_person(self, client: AsyncClient, a_student, group_code):
        """Takroriy JSHSHIR yo'li ham oyna emas: /lookup ni chetlab
        o'tib, ro'yxatdagi odamning ismini bilib bo'lmaydi."""
        resp = await client.post(
            "/api/public/enrollment/register",
            json={
                "code": ENROLL_CODE,  # institutda amal qiladi, lekin bu guruhniki emas
                "fullName": "Boshqa Odam",
                "type": "talaba",
                "groupOrPosition": "DI-2301",
                "pinfl": a_student.pinfl,
            },
        )
        assert resp.status_code == 403
        assert "Karimov" not in resp.text

    async def test_register_needs_a_code_at_all(self, client: AsyncClient, seeded):
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"fullName": "Yangi Odam", "type": "talaba", "groupOrPosition": "DI-9999", "pinfl": "77777777777777"},
        )
        assert resp.status_code == 403


class TestAPendingRecordIsProtected:
    @pytest.fixture
    async def a_pending_person(self, db_session) -> StudentStaff:
        record = StudentStaff(
            full_name="Kutayotgan Talaba",
            type="talaba",
            group_or_position="DI-2301",
            pinfl="30000000000022",
            biometrics_status="kutilmoqda",
            biometric_photo_key="biometrics/eski.jpg",
            biometric_embedding="[0.2]",
            self_registered=True,
        )
        db_session.add(record)
        await db_session.commit()
        await db_session.refresh(record)
        return record

    async def test_a_stranger_cannot_overwrite_it(
        self, client: AsyncClient, a_pending_person, group_code, db_session, fake_face_pipeline
    ):
        """Kodsiz urinish rad etiladi VA eski rasm joyida qoladi.

        Ilgari bu eng og'riqli yo'l edi: JSHSHIRni bilgan odam
        "kutilmoqda" holatidagi yozuv ustiga yozib, qurbonning rasmini
        butunlay o'chirib yuborardi."""
        resp = await _submit(client, a_pending_person.id, pinfl=a_pending_person.pinfl, consent="true")
        assert resp.status_code == 403
        await db_session.refresh(a_pending_person)
        assert a_pending_person.biometric_photo_key == "biometrics/eski.jpg"
        assert fake_face_pipeline == []  # hech narsa o'chirilmadi

    async def test_the_owner_can_replace_it_with_the_code(
        self, client: AsyncClient, a_pending_person, group_code, db_session, fake_face_pipeline
    ):
        resp = await _submit(
            client, a_pending_person.id, pinfl=a_pending_person.pinfl, code=group_code, consent="true"
        )
        assert resp.status_code == 200, resp.text
        await db_session.refresh(a_pending_person)
        # Yangi rasm saqlangandan KEYIN eskisi o'chiriladi — aksincha emas.
        assert a_pending_person.biometric_photo_key != "biometrics/eski.jpg"
        assert fake_face_pipeline == ["biometrics/eski.jpg"]


class TestTheLookalikeGuardStillFires:
    async def test_a_face_that_belongs_to_someone_else_is_held(
        self, client: AsyncClient, a_student, group_code, db_session
    ):
        """Kod to'g'ri bo'lsa ham ikkinchi himoya ishlaydi: yuz bazadagi
        boshqa tasdiqlangan odamnikiga o'xshasa — tekshiruvga qoladi."""
        import json

        owner = StudentStaff(
            full_name="Yuz Egasi",
            type="talaba",
            group_or_position="DI-2301",
            biometrics_status="tasdiqlangan",
            biometric_embedding=json.dumps([0.1] * 512),
        )
        db_session.add(owner)
        await db_session.commit()

        resp = await _submit(client, a_student.id, pinfl=a_student.pinfl, code=group_code, consent="true")
        assert resp.status_code == 200, resp.text
        assert resp.json()["biometricsStatus"] == "kutilmoqda"


class TestTheCodeItself:
    def test_the_alphabet_has_no_confusable_characters(self):
        for ch in "O0I1":
            assert ch not in codes.CODE_ALPHABET

    def test_generated_codes_are_six_characters_from_that_alphabet(self):
        for _ in range(50):
            code = codes.generate_code()
            assert len(code) == codes.CODE_LENGTH
            assert set(code) <= set(codes.CODE_ALPHABET)

    def test_normalization_matches_how_people_type(self):
        assert codes.normalize_code(" h4t-6vw ") == "H4T6VW"
        assert codes.normalize_code(None) == ""
        assert codes.normalize_code("H4T6VWXYZ") == "H4T6VW"
