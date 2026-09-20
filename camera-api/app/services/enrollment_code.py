"""Ro'yxatdan o'tish kodi: yaratish, tozalash va tekshirish.

Butun mantiq shu yerda — ochiq endpointlar ham, admin endpointlari ham,
QR karta havolasi ham shu funksiyalarni chaqiradi. Sabab oddiy: kodni
tekshirish qoidasi ikki joyda ikki xil bo'lib qolsa, tekshiruvning o'zi
ma'nosini yo'qotadi.

ALIFBO. Kod 6 belgidan iborat va unda O, 0, I, 1 YO'Q. Kod og'zaki
aytiladi va qog'ozdan ko'chiriladi: aynan shu to'rt belgi eng ko'p
chalkashtiriladi va "kod ishlamayapti" degan murojaatlarning asosiy
sababi bo'lardi.

QAMROVNI ANIQLASH. Yozuvning kodi uning o'zidan kelib chiqadi:
talabaniki — guruhi, xodimniki — fakulteti (bo'limi). Agar o'sha
birlikning kodi umuman yaratilmagan bo'lsa, institut bo'yicha umumiy
zaxira kod ishlatiladi. Hech qanday kod topilmasa — topshirish RAD
ETILADI. Bu ataylab: kod yo'qligi "kod tekshirilmaydi" degani bo'lsa,
himoyani o'chirish uchun bitta qatorni o'chirish kifoya bo'lardi.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EnrollmentCode, Faculty, StudentStaff

#: O, 0, I, 1 ataylab yo'q — ular og'zaki va qog'ozda chalkashadi.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6

SCOPE_GROUP = "guruh"
SCOPE_UNIT = "bolim"
SCOPE_ALL = "umumiy"
SCOPES = (SCOPE_GROUP, SCOPE_UNIT, SCOPE_ALL)

#: Umumiy (zaxira) kodning qatorda qanday ko'rinishi.
ALL_UNIT_NAME = "Butun institut"

#: Kod noto'g'ri bo'lganda ko'rsatiladigan YAGONA xabar. U hech narsa
#: oshkor qilmaydi: yozuv bor-yo'qligini ham, kodning qayeri
#: noto'g'riligini ham. Shu bitta matn bilan "bunday odam bormi" degan
#: savolga javob beradigan yo'l yopiladi.
WRONG_CODE_MESSAGE = (
    "Guruh kodi noto'g'ri yoki muddati tugagan. Kodni guruh sardoridan yoki dekanatdan oling."
)

#: /lookup uchun: "topilmadi" va "kod noto'g'ri" AYNAN bir xil javob
#: berishi kerak, aks holda sahifa begona odamning ismini taxmin qilish
#: vositasiga aylanadi.
LOOKUP_FAIL_MESSAGE = (
    "Ma'lumot topilmadi yoki kod noto'g'ri. JSHSHIR va guruh kodini tekshiring — "
    "kodni guruh sardoridan yoki dekanatdan oling."
)


def generate_code() -> str:
    """Yangi tasodifiy kod (kriptografik tasodif, taxmin qilib bo'lmaydi)."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(value: str | None) -> str:
    """Odam kiritgan kodni solishtirishga tayyorlaydi.

    Kod og'zaki aytiladi va qo'lda teriladi — bo'sh joy, chiziqcha va
    kichik harf juda tez-tez uchraydi. Ularni tashlamasak, kodni to'g'ri
    eshitgan odam ham "noto'g'ri" degan javob olardi."""
    if not value:
        return ""
    upper = value.strip().upper()
    return "".join(ch for ch in upper if ch in CODE_ALPHABET)[:CODE_LENGTH]


def unit_key(name: str | None) -> str:
    """Guruh/bo'lim nomini solishtirish uchun tozalaydi.

    "DI-2301", " di-2301 " va "DI-2301" — bitta guruh. Ro'yxatlar
    qo'lda kiritilgani uchun bu farqlar doimiy uchraydi."""
    return " ".join((name or "").split()).casefold()


async def scope_for_record(db: AsyncSession, record: StudentStaff) -> tuple[str, str, str]:
    """Yozuv qaysi kodga tegishli: (qamrov, kalit, ko'rsatiladigan nom)."""
    if record.type == "talaba":
        name = record.group_or_position or ""
        if name.strip():
            return SCOPE_GROUP, unit_key(name), name.strip()
        return SCOPE_ALL, "", ALL_UNIT_NAME
    if record.faculty_id is not None:
        faculty = await db.get(Faculty, record.faculty_id)
        if faculty is not None:
            return SCOPE_UNIT, unit_key(faculty.name), faculty.name
    return SCOPE_ALL, "", ALL_UNIT_NAME


def is_expired(row: EnrollmentCode, now: datetime | None = None) -> bool:
    if row.expires_at is None:
        return False
    moment = now or datetime.now(timezone.utc)
    expires = row.expires_at
    if expires.tzinfo is None:  # baza timezone'siz qaytarsa ham solishtira olaylik
        expires = expires.replace(tzinfo=timezone.utc)
    return expires <= moment


async def code_row(db: AsyncSession, scope: str, key: str) -> EnrollmentCode | None:
    result = await db.execute(
        select(EnrollmentCode).where(EnrollmentCode.scope == scope, EnrollmentCode.unit_key == key)
    )
    return result.scalar_one_or_none()


async def applicable_code(db: AsyncSession, record: StudentStaff) -> EnrollmentCode | None:
    """Shu yozuv uchun amal qiladigan kod qatori (yoki None).

    Guruhning O'Z kodi bo'lsa — faqat o'sha. Zaxira umumiy kodga faqat
    guruhning kodi umuman yaratilmagan holatda o'tiladi: aks holda
    umumiy kod har bir guruhning kodini ma'nosiz qilib qo'yardi."""
    scope, key, _name = await scope_for_record(db, record)
    row = await code_row(db, scope, key)
    if row is not None:
        return row
    if scope == SCOPE_ALL:
        return None
    return await code_row(db, SCOPE_ALL, "")


async def verify_for_record(db: AsyncSession, record: StudentStaff, raw: str | None) -> bool:
    """Kiritilgan kod shu odamning guruhiga tegishlimi."""
    cleaned = normalize_code(raw)
    if len(cleaned) != CODE_LENGTH:
        return False
    row = await applicable_code(db, record)
    if row is None or is_expired(row):
        return False
    # compare_digest — kodni belgima-belgi vaqt bo'yicha o'lchab
    # topishga yo'l qo'ymaydi.
    return secrets.compare_digest(row.code, cleaned)


async def find_valid_code(db: AsyncSession, raw: str | None) -> EnrollmentCode | None:
    """Kod institutda umuman mavjudmi (va muddati o'tmaganmi).

    Bu FAQAT o'zini o'zi qo'shish (register) uchun: bunday odamning hali
    guruhi yo'q, ya'ni kodni guruhga bog'lab bo'lmaydi. Kodning o'zi esa
    baribir kerak — u "menga bu kartani institutda berishdi" degan
    yagona dalil."""
    cleaned = normalize_code(raw)
    if len(cleaned) != CODE_LENGTH:
        return None
    rows = (await db.execute(select(EnrollmentCode).where(EnrollmentCode.code == cleaned))).scalars().all()
    for row in rows:
        if not is_expired(row):
            return row
    return None


async def ensure_code(db: AsyncSession, scope: str, key: str, unit_name: str) -> EnrollmentCode:
    """Kod bor bo'lsa — o'shani, bo'lmasa yangisini yaratadi.

    Admin panelida guruh ochilganda chaqiriladi: yangi guruh uchun kodni
    admin alohida "yaratish" tugmasini qidirib yurmasligi kerak."""
    row = await code_row(db, scope, key)
    if row is not None:
        if unit_name and row.unit_name != unit_name:
            row.unit_name = unit_name
        return row
    row = EnrollmentCode(scope=scope, unit_key=key, unit_name=unit_name, code=generate_code())
    db.add(row)
    await db.flush()
    return row


async def regenerate_code(
    db: AsyncSession, scope: str, key: str, unit_name: str, expires_at: datetime | None = None
) -> EnrollmentCode:
    """Kodni yangilaydi — eskisi shu zahoti ishlamay qoladi.

    Kod "chiqib ketganda" (masalan, kurs chatiga tashlanganda) yagona
    to'g'ri harakat — yangilash: qator ustiga yoziladi, ya'ni eski kod
    hech qayerda saqlanib qolmaydi."""
    row = await ensure_code(db, scope, key, unit_name)
    row.code = generate_code()
    row.created_at = datetime.now(timezone.utc)
    row.expires_at = expires_at
    await db.flush()
    return row
