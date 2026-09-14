from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class StudentStaffOut(CamelModel):
    """Matches src/types/index.ts `StudentStaffRecord` exactly."""

    id: str
    full_name: str
    type: Literal["talaba", "xodim"]
    faculty: str  # faculty NAME (not id) — matches the frontend's plain-string field
    group_or_position: str
    biometrics_status: Literal["tasdiqlangan", "kutilmoqda", "yoq"]
    initials: str
    biometric_photo_url: str | None = None
    # Faqat talabada: group_or_position "2-kurs, DI-1625" dan ajratilgan
    course: int | None = None
    group: str | None = None
    # "14.09.2026 13:57" — yuz tasdiqlangan payt, Toshkent vaqti
    confirmed_label: str | None = None


class StudentStaffCreateIn(CamelModel):
    """Matches AddStudentStaffModal.tsx step-1 fields plus the biometric
    enrollment outcome computed by the frontend's face-match step."""

    full_name: str = Field(min_length=5)
    type: Literal["talaba", "xodim"]
    faculty: str
    group_or_position: str = Field(min_length=1)
    biometrics_status: Literal["tasdiqlangan", "kutilmoqda", "yoq"] = "yoq"


class StudentStaffUpdateIn(CamelModel):
    """Matches EditStudentStaffModal.tsx fields."""

    full_name: str = Field(min_length=5)
    type: Literal["talaba", "xodim"]
    faculty: str
    group_or_position: str = Field(min_length=1)


class BiometricsFacultyRowOut(CamelModel):
    """Bitta fakultet (yoki fakultetsizlar guruhi) bo'yicha qamrov."""

    faculty: str
    total: int
    confirmed: int
    pending: int
    missing: int
    percent: float | None = None
    """Qamrov foizi. None — guruhda umuman odam yo'q.

    Nol bilan aralashtirmaslik uchun ataylab: "0%" hech kim
    tasdiqlamagani, "ma'lumot yo'q" esa hisoblash uchun hech narsa
    yo'qligi. Ikkalasi turli xulosaga olib keladi."""


class BiometricsCourseRowOut(CamelModel):
    """Talabalar — bitta kurs bo'yicha qamrov."""

    course: str  # "2-kurs" yoki "Kurs ko'rsatilmagan"
    course_number: int | None = None
    total: int
    confirmed: int
    pending: int
    missing: int
    percent: float | None = None


class BiometricsCoverageOut(CamelModel):
    """Yuzni tasdiqlash qamrovi — kim tasdiqladi, kim yo'q."""

    total: int
    confirmed: int
    pending: int
    missing: int
    percent: float | None = None
    by_faculty: list[BiometricsFacultyRowOut]
    by_course: list[BiometricsCourseRowOut] = []
    """Faqat type=talaba so'ralganda to'ldiriladi."""


class BiometricsConfirmationOut(StudentStaffOut):
    """"Aniqlash" oynasi: odam yuzini aniq qachon tasdiqlagani.

    Vaqt Toshkent vaqtida, tayyor matn ko'rinishida keladi — qarang
    app/timezone.py uz_datetime_parts."""

    confirmed_at: str | None = None
    confirmed_date: str | None = None
    confirmed_weekday: str | None = None
    confirmed_time: str | None = None
    source: Literal["tizim", "rasm", "nomalum", "tasdiqlanmagan"]
    """tizim — tasdiqlash paytida yozilgan; rasm — bu yozuv paydo
    bo'lishidan oldingi tasdiqlash, vaqt yuz rasmi saqlangan paytdan
    tiklangan; nomalum — tasdiqlangan, lekin vaqtni aniqlab bo'lmadi;
    tasdiqlanmagan — odam hali yuzini tasdiqlamagan."""
