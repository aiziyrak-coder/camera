"""O'zini o'zi ro'yxatdan o'tkazganlar tasdiqlanguncha tanilmaydi.

Ilgari ochiq sahifada istalgan odam o'ziga yozuv yaratib, yuzini qo'shib,
darhol "tasdiqlangan" bo'lardi: kameralar uni tanish deb hisoblar,
"begona shaxs" tekshiruvi esa o'tkazib yuborardi. Endi institut
ro'yxatida bo'lmagan odamning yuzi administrator qaroriga qadar kutadi.

Yuz modeli va obyekt ombori bu yerda soxta: gap vektor sifatida emas,
kim tanish ro'yxatiga qachon kirishi haqida.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AuditLog, StudentStaff
from app.routers import enrollment, students_staff
from app.services.face_matching import load_candidate_matrix
from tests.conftest import auth_headers

PINFL = "31234567890123"
FRAMES = [("photos", (f"{step}.jpg", b"jpeg", "image/jpeg")) for step in ("front", "left", "right")]


@pytest.fixture(autouse=True)
def fake_face_pipeline(monkeypatch):
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
    monkeypatch.setattr(students_staff, "delete_files_quietly", delete_quietly)
    monkeypatch.setattr(students_staff, "presigned_url", lambda key: f"https://storage.test/{key}")
    return deleted


async def _register_and_submit(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/public/enrollment/register",
        json={"fullName": "Begona Odam Aliyevich", "type": "talaba", "groupOrPosition": "1-kurs, DI-101", "pinfl": PINFL},
    )
    assert resp.status_code == 201, resp.text
    record_id = resp.json()["recordId"]
    resp = await client.post(f"/api/public/enrollment/{record_id}/submit", data={"pinfl": PINFL}, files=FRAMES)
    assert resp.status_code == 200, resp.text
    return {"id": record_id, **resp.json()}


async def _known_ids(db_session) -> set[str]:
    return set((await load_candidate_matrix(db_session)).ids)


@pytest.mark.usefixtures("seeded")
class TestSelfRegisteredFaceWaits:
    async def test_the_face_is_kept_but_not_recognised(self, client: AsyncClient, db_session):
        result = await _register_and_submit(client)

        assert result["biometricsStatus"] == "kutilmoqda"
        assert result["awaitingApproval"] is True
        record = await db_session.get(StudentStaff, result["id"])
        assert record.self_registered is True
        assert record.biometric_embedding is not None
        assert record.biometrics_confirmed_at is None
        assert result["id"] not in await _known_ids(db_session)

    async def test_lookup_says_it_is_waiting_and_a_new_scan_is_allowed(self, client: AsyncClient):
        await _register_and_submit(client)

        resp = await client.post("/api/public/enrollment/lookup", json={"pinfl": PINFL})
        assert resp.json()["alreadyEnrolled"] is False
        assert resp.json()["awaitingApproval"] is True
        record_id = resp.json()["recordId"]
        again = await client.post(f"/api/public/enrollment/{record_id}/submit", data={"pinfl": PINFL}, files=FRAMES)
        assert again.status_code == 200
        assert again.json()["biometricsStatus"] == "kutilmoqda"

    async def test_people_from_the_institute_list_are_still_confirmed_at_once(self, client: AsyncClient, db_session):
        record = StudentStaff(full_name="Ro'yxatdagi Xodim", type="xodim", group_or_position="Kafedra",
                              pinfl="30000000000001")
        db_session.add(record)
        await db_session.commit()

        resp = await client.post(
            f"/api/public/enrollment/{record.id}/submit", data={"pinfl": "30000000000001"}, files=FRAMES
        )

        assert resp.json()["biometricsStatus"] == "tasdiqlangan"
        assert resp.json()["awaitingApproval"] is False
        assert str(record.id) in await _known_ids(db_session)


@pytest.mark.usefixtures("seeded")
class TestAdminDecides:
    async def test_the_page_counts_and_lists_who_is_waiting(self, client: AsyncClient):
        result = await _register_and_submit(client)
        headers = await auth_headers(client, "admin", "admin123")

        overview = (await client.get("/api/students-staff/overview", headers=headers)).json()
        assert overview["talaba"]["awaitingApproval"] == 1
        assert overview["xodim"]["awaitingApproval"] == 0

        resp = await client.post(
            "/api/students-staff/search",
            headers=headers,
            json={"type": "talaba", "biometricsStatus": "tasdiq_kutmoqda", "page": 1, "pageSize": 10},
        )
        items = resp.json()["items"]
        assert [(item["id"], item["awaitingApproval"], item["selfRegistered"]) for item in items] == [
            (result["id"], True, True)
        ]

    async def test_approval_makes_the_person_known(self, client: AsyncClient, db_session):
        result = await _register_and_submit(client)
        headers = await auth_headers(client, "admin", "admin123")

        resp = await client.post(f"/api/students-staff/{result['id']}/biometrics/approve", headers=headers)

        assert resp.status_code == 200, resp.text
        assert resp.json()["biometricsStatus"] == "tasdiqlangan"
        assert resp.json()["awaitingApproval"] is False
        assert result["id"] in await _known_ids(db_session)
        actions = (await db_session.execute(select(AuditLog.action))).scalars().all()
        assert any("tasdiqladi" in action and "Begona Odam" in action for action in actions)

        again = await client.post(f"/api/students-staff/{result['id']}/biometrics/approve", headers=headers)
        assert again.status_code == 409

    async def test_rejection_removes_the_face(self, client: AsyncClient, db_session, fake_face_pipeline):
        result = await _register_and_submit(client)
        headers = await auth_headers(client, "admin", "admin123")
        record = await db_session.get(StudentStaff, result["id"])
        photo_key = record.biometric_photo_key

        resp = await client.post(f"/api/students-staff/{result['id']}/biometrics/reject", headers=headers)

        assert resp.status_code == 200, resp.text
        assert resp.json()["biometricsStatus"] == "yoq"
        await db_session.refresh(record)
        assert record.biometric_embedding is None
        assert record.biometric_photo_key is None
        assert photo_key in fake_face_pipeline
        assert result["id"] not in await _known_ids(db_session)

    async def test_only_waiting_records_can_be_decided(self, client: AsyncClient, db_session):
        record = StudentStaff(full_name="Oddiy Xodim Karimov", type="xodim", group_or_position="Kafedra")
        db_session.add(record)
        await db_session.commit()
        headers = await auth_headers(client, "admin", "admin123")

        for decision in ("approve", "reject"):
            resp = await client.post(f"/api/students-staff/{record.id}/biometrics/{decision}", headers=headers)
            assert resp.status_code == 409

    async def test_a_decision_needs_a_login(self, client: AsyncClient):
        result = await _register_and_submit(client)
        resp = await client.post(f"/api/students-staff/{result['id']}/biometrics/approve")
        assert resp.status_code == 401
