from pathlib import Path

import insightface
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Faculty, StudentStaff

from tests.conftest import ENROLL_CODE

# Same fixtures test_biometrics.py uses — a real detectable face (t1.jpg)
# and a different real person (Tom Hanks) to exercise the multi-frame
# consistency check with a genuine mismatch, not a synthetic one.
FACE_IMAGE_PATH = Path(insightface.__file__).parent / "data" / "images" / "t1.jpg"
OTHER_FACE_IMAGE_PATH = Path(insightface.__file__).parent / "data" / "images" / "Tom_Hanks_54745.png"


@pytest.fixture
def any_pose(monkeypatch):
    """Burilish tekshiruvini o'tkazib yuboradi.

    Bu yerdagi testlar identifikatsiya, takroriy ro'yxat va vektor
    saqlash haqida — burilish burchagi haqida emas. Uni haqiqiy
    fotosuratlar bilan sinash uchun uch xil burchakdan olingan bir xil
    odamning rasmlari kerak bo'lardi; o'lchov mantig'ining o'zi
    tests/test_head_pose.py da alohida va aniqroq tekshiriladi.
    """
    from app.routers import enrollment

    def fake_direction(_landmarks):
        return fake_direction.expected

    fake_direction.expected = "front"

    original = enrollment._verify_liveness

    async def passthrough(frames):
        # Kadrlar soni va yuz borligi baribir tekshiriladi — faqat
        # burchak sharti olib tashlanadi.
        monkeypatch.setattr(enrollment, "direction_of", lambda lm: None)
        return None

    monkeypatch.setattr(enrollment, "_verify_liveness", passthrough)
    return original


def three_frames():
    """Tiriklik oqimi kutadigan uchta kadr (bir xil rasm)."""
    data = FACE_IMAGE_PATH.read_bytes()
    return [
        ("photos", ("front.jpg", data, "image/jpeg")),
        ("photos", ("left.jpg", data, "image/jpeg")),
        ("photos", ("right.jpg", data, "image/jpeg")),
    ]


@pytest.fixture
async def an_enrollable_record(db_session: AsyncSession, seeded) -> StudentStaff:
    faculty = (await db_session.execute(select(Faculty).limit(1))).scalar_one()
    record = StudentStaff(
        full_name="Soyibnazarov Hojiakbar",
        type="xodim",
        faculty_id=faculty.id,
        group_or_position="Xavfsizlik bo'limi",
        passport_series="AD",
        passport_number="1234567",
    )
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(record)
    return record


@pytest.mark.usefixtures("seeded")
class TestEnrollmentLookup:
    async def test_lookup_finds_record_by_passport(self, client: AsyncClient, an_enrollable_record):
        resp = await client.post(
            "/api/public/enrollment/lookup", json={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["fullName"] == "S*** Hojiakbar"
        assert body["typeLabel"] == "Xodim"
        assert body["alreadyEnrolled"] is False

    async def test_lookup_is_case_and_space_insensitive_on_series(self, client: AsyncClient, an_enrollable_record):
        resp = await client.post(
            "/api/public/enrollment/lookup", json={"code": ENROLL_CODE, "passportSeries": " ad ", "passportNumber": "1234567"}
        )
        assert resp.status_code == 200

    async def test_lookup_unknown_passport_is_404(self, client: AsyncClient, seeded):
        resp = await client.post(
            "/api/public/enrollment/lookup", json={"code": ENROLL_CODE, "passportSeries": "ZZ", "passportNumber": "9999999"}
        )
        assert resp.status_code == 404


@pytest.mark.usefixtures("seeded")
class TestEnrollmentSubmit:
    async def test_submit_persists_averaged_embedding(
        self, client: AsyncClient, an_enrollable_record, any_pose
    ):
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
            files=three_frames(),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["biometricsStatus"] == "tasdiqlangan"

    async def test_submit_rejects_mismatched_passport(self, client: AsyncClient, an_enrollable_record):
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "0000000"},
            files=three_frames(),
        )
        assert resp.status_code == 403

    async def test_submit_rejects_inconsistent_frames(
        self, client: AsyncClient, an_enrollable_record, any_pose
    ):
        """Uch kadr bir xil odamniki bo'lishi shart. Aks holda birinchi
        kadrda bir odam, keyingisida boshqasi turib, o'rtacha vektor
        ikkalasiga ham tegishli bo'lmagan yuzni tasvirlab qolardi."""
        same = FACE_IMAGE_PATH.read_bytes()
        other = OTHER_FACE_IMAGE_PATH.read_bytes()
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
            files=[
                ("photos", ("a.jpg", same, "image/jpeg")),
                ("photos", ("b.png", other, "image/png")),
                ("photos", ("c.jpg", same, "image/jpeg")),
            ],
        )
        assert resp.status_code == 422

    async def test_submit_blocks_already_confirmed(
        self, client: AsyncClient, db_session: AsyncSession, an_enrollable_record
    ):
        an_enrollable_record.biometrics_status = "tasdiqlangan"
        await db_session.commit()

        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
            files=three_frames(),
        )
        assert resp.status_code == 409

    async def test_a_single_photo_is_no_longer_accepted(
        self, client: AsyncClient, an_enrollable_record
    ):
        """Bir muddat bitta yuklangan rasm yetarli edi. U bekor qilindi:
        yuklangan rasmni boshqa odamning rasmi, telefon ekranidagi surat
        yoki qog'ozga bosilgan fotosurat bilan almashtirib bo'lardi.
        Endi kameradan uch burchak talab qilinadi."""
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
            files=[("photos", ("a.jpg", FACE_IMAGE_PATH.read_bytes(), "image/jpeg"))],
        )
        assert resp.status_code == 422
        assert "3 ta kadr" in resp.json()["detail"]

    async def test_a_photo_without_a_face_is_still_rejected(
        self, client: AsyncClient, an_enrollable_record
    ):
        """Bosqichning butun ma'nosi — bazaga YUZ tushishi."""
        blank = b"not an image at all"
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
            files=[
                ("photos", ("a.jpg", blank, "image/jpeg")),
                ("photos", ("b.jpg", blank, "image/jpeg")),
                ("photos", ("c.jpg", blank, "image/jpeg")),
            ],
        )
        assert resp.status_code == 422

    async def test_no_photo_at_all_is_rejected(self, client: AsyncClient, an_enrollable_record):
        resp = await client.post(
            f"/api/public/enrollment/{an_enrollable_record.id}/submit",
            data={"code": ENROLL_CODE, "passportSeries": "AD", "passportNumber": "1234567", "consent": "true"},
        )
        assert resp.status_code == 422


@pytest.mark.usefixtures("seeded")
class TestSelfRegistration:
    """Before this, a passport the system did not know ended the flow:
    lookup answered 404 and the person had to wait for an administrator
    to type their details in. They can now enter them themselves and go
    straight on to the photo step."""

    async def test_registering_creates_a_record_ready_for_a_photo(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, 
                "fullName": "Yangi Talaba",
                "type": "talaba",
                "groupOrPosition": "301-guruh",
                "passportSeries": "AB",
                "passportNumber": "7654321",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["fullName"] == "Y*** Talaba"
        assert body["typeLabel"] == "Talaba"
        assert body["alreadyEnrolled"] is False

        record = (
            await db_session.execute(
                select(StudentStaff).where(StudentStaff.passport_number == "7654321")
            )
        ).scalar_one()
        # The face comes in the NEXT step; registration only records who
        # the person is.
        assert record.biometrics_status == "yoq"
        assert record.biometric_embedding is None

    async def test_wrong_group_still_links_by_full_name(self, client: AsyncClient, db_session: AsyncSession):
        """2026-11-02: noto'g'ri guruh tanlangan ("M-526"), lekin to'liq F.I.Sh.
        HEMIS'dagi bitta yozuvga mos — dublikat ochilmaydi, o'sha yozuvga bog'lanadi."""
        hemis_row = StudentStaff(full_name="Davronov Muhammadamin G'ayratjon o'g'li", type="talaba",
                                 group_or_position="1-kurs, P-5026A", hemis_id="344261101420")
        db_session.add(hemis_row)
        await db_session.commit()
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE,
                  "fullName": "Davronov Muhammadamin Gʻayratjon oʻgʻli",
                  "type": "talaba",
                  "groupOrPosition": "M-526 uz (Pediatr)",
                  "pinfl": "51234567890123"},
        )
        assert resp.status_code in (200, 201)
        assert resp.json()["recordId"] == str(hemis_row.id)
        count = (await db_session.execute(
            select(StudentStaff).where(StudentStaff.full_name.ilike("Davronov%")))).scalars().all()
        assert len(count) == 1

    async def test_with_hemis_an_unknown_typed_group_goes_to_not_in_hemis(
        self, client: AsyncClient, db_session: AsyncSession, monkeypatch
    ):
        """HEMIS ulangan: qo'lda yozilgan, HEMIS'da yo'q guruh Nazoratda bir
        kishilik soxta guruh bo'lmaydi; HEMIS guruhining qisqa nomi esa
        HEMIS ko'rinishiga keltiriladi."""
        from app.config import settings
        from app.services.hemis_reconcile import NOT_IN_HEMIS

        monkeypatch.setattr(settings, "hemis_base_url", "https://hemis.example/rest")
        monkeypatch.setattr(settings, "hemis_api_token", "token")
        db_session.add(StudentStaff(full_name="Hemis Talaba", type="talaba", group_or_position="1-kurs, DI-2426",
                                    hemis_id="H-77"))
        await db_session.commit()

        for name, typed, number in (("Soxta Guruhli", "20.26 gurux", "5550001"), ("Qisqa Guruhli", "di-2426", "5550002")):
            resp = await client.post(
                "/api/public/enrollment/register",
                json={"code": ENROLL_CODE, "fullName": name, "type": "talaba", "groupOrPosition": typed,
                      "passportSeries": "AB", "passportNumber": number},
            )
            assert resp.status_code == 201, resp.text
        rows = {
            r.passport_number: r
            for r in (await db_session.execute(select(StudentStaff).where(StudentStaff.passport_number.like("555000%")))).scalars()
        }
        assert (rows["5550001"].group_or_position, rows["5550001"].reported_group) == (NOT_IN_HEMIS, "20.26 gurux")
        assert (rows["5550002"].group_or_position, rows["5550002"].reported_group) == ("1-kurs, DI-2426", None)

    async def test_the_new_record_can_be_found_by_lookup_afterwards(self, client: AsyncClient):
        await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, 
                "fullName": "Qaytgan Talaba",
                "type": "talaba",
                "groupOrPosition": "302-guruh",
                "passportSeries": "AB",
                "passportNumber": "1112223",
            },
        )
        resp = await client.post(
            "/api/public/enrollment/lookup",
            json={"code": ENROLL_CODE, "passportSeries": "AB", "passportNumber": "1112223"},
        )
        assert resp.status_code == 200
        assert resp.json()["fullName"] == "Q*** Talaba"

    async def test_an_existing_passport_returns_that_record_instead_of_a_duplicate(
        self, client: AsyncClient, an_enrollable_record, db_session: AsyncSession
    ):
        """Two records for one person would split their attendance in
        half, and nothing downstream could tell they were the same
        human."""
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, 
                "fullName": "Boshqa Ism",
                "type": "talaba",
                "groupOrPosition": "999-guruh",
                "passportSeries": "AD",
                "passportNumber": "1234567",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["recordId"] == str(an_enrollable_record.id)

        count = len(
            (
                await db_session.execute(
                    select(StudentStaff).where(StudentStaff.passport_number == "1234567")
                )
            ).scalars().all()
        )
        assert count == 1

    async def test_the_series_is_normalised_the_same_way_lookup_normalises_it(
        self, client: AsyncClient
    ):
        """Registering as "ab" and looking up as "AB" has to find the
        same person, or someone registers and is then told they do not
        exist."""
        await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, 
                "fullName": "Kichik Harf",
                "type": "xodim",
                "groupOrPosition": "Laborant",
                "passportSeries": " ab ",
                "passportNumber": " 5556667 ",
            },
        )
        resp = await client.post(
            "/api/public/enrollment/lookup",
            json={"code": ENROLL_CODE, "passportSeries": "AB", "passportNumber": "5556667"},
        )
        assert resp.status_code == 200

    async def test_an_unknown_faculty_is_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, 
                "fullName": "Fakultetsiz Talaba",
                "type": "talaba",
                "groupOrPosition": "303-guruh",
                "facultyId": "00000000-0000-0000-0000-000000000000",
                "passportSeries": "AC",
                "passportNumber": "9998887",
            },
        )
        assert resp.status_code == 422

    async def test_faculties_are_listed_for_the_form(self, client: AsyncClient, db_session: AsyncSession):
        """Faqat talaba guruhi bor fakultetlar (2026-11-02): xodim bo'linmasi
        bo'lgan "fakultet" formada chiqmaydi."""
        from sqlalchemy import select

        from app.models import Faculty, StudentGroup

        faculties = (await db_session.execute(select(Faculty).order_by(Faculty.name))).scalars().all()
        assert len(faculties) >= 2
        db_session.add(StudentGroup(name="DI-101", course=1, faculty_id=faculties[0].id))
        await db_session.commit()
        resp = await client.get("/api/public/enrollment/faculties")
        assert resp.status_code == 200
        rows = resp.json()
        assert [r["name"] for r in rows] == [faculties[0].name]
        assert set(rows[0]) == {"id", "name"}


class TestStaleCopies:
    """2026-11-02: faolsizlantirilgan, HEMIS'ga bog'lanmagan eski nusxa
    JSHSHIRni ushlab, talabani "allaqachon o'tgansiz" / "faol emas" bilan
    to'sardi. Endi u e'tiborga olinmaydi, talaba HEMIS yozuviga o'tadi."""

    async def test_lookup_ignores_a_stale_copy(self, client: AsyncClient, db_session: AsyncSession):
        db_session.add(StudentStaff(full_name="Ismoilova Diyora", type="talaba", group_or_position="52",
                                    pinfl="60711086940017", active=False, biometrics_status="tasdiqlangan"))
        await db_session.commit()
        resp = await client.post("/api/public/enrollment/lookup", json={"code": ENROLL_CODE, "pinfl": "60711086940017"})
        assert resp.status_code == 404

    async def test_register_moves_the_id_to_the_hemis_record(self, client: AsyncClient, db_session: AsyncSession):
        stale = StudentStaff(full_name="Ismoilova Diyora", type="talaba", group_or_position="52",
                             pinfl="60711086940017", active=False, biometrics_status="tasdiqlangan")
        hemis_row = StudentStaff(full_name="Ismoiljonova Diyoraxon Xayrullo qizi", type="talaba",
                                 group_or_position="1-kurs, P-5226", hemis_id="344261101478")
        db_session.add_all([stale, hemis_row])
        await db_session.commit()
        resp = await client.post(
            "/api/public/enrollment/register",
            json={"code": ENROLL_CODE, "fullName": "Ismoiljonova Diyoraxon Xayrullo qizi", "type": "talaba",
                  "groupOrPosition": "52-26", "pinfl": "60711086940017"},
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["recordId"] == str(hemis_row.id)
        await db_session.refresh(hemis_row)
        await db_session.refresh(stale)
        assert hemis_row.pinfl == "60711086940017" and stale.pinfl is None
