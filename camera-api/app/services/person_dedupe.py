"""Talaba/xodim dublikatlarini topish va birlashtirish.

Productionda (2026-09-24) 7253 faol yozuvdan 81 tasi dublikat edi: xodimlar
ikki marta import qilingan (kadrlar ro'yxati — bo'lim va JSHSHIR bilan,
keyin lavozimlar ro'yxati — yuz bilan), talabalar esa HEMIS importidan
tashqari QR orqali o'zini yana ro'yxatdan o'tkazgan. Natija: bitta odamning
yuzi bir yozuvda, davomati boshqasida — kamera uni taniydi, lekin hisobotda
"kelmadi".

BIR ODAM deb hisoblanadi: tur, familiya, ism va otasining ismi mos
(katta-kichik harf, apostrof shakli, "o'g'li/qizi", "-ovich/-ovna" va
harflar tartibi farqi hisobga olinmaydi; otasining ismi bittasida bo'lmasa
ham mos). JSHSHIR ikkalasida bo'lib, 2 dan ko'p raqamda farq qilsa — bu
boshqa odam (adash), birlashtirilmaydi.

BIRLASHTIRISH o'chirishdan oldin hamma narsani saqlanadigan yozuvga ko'chiradi:
bo'sh maydonlar (JSHSHIR, HEMIS, karta, ota-ona aloqasi, rozilik), yuz
(saqlanadiganda bo'lmasa), to'liqroq ism, davomat (bir kunda ikkalasida
bo'lsa — ertaroq kelgani), dars davomati, tashriflar, galereya, dars
jadvali, turniket o'tishlari va tekshiruv yozuvlari.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_APOS = str.maketrans({c: "'" for c in "‘’ʻʼ`´"})
_SUFFIX = {"o'g'li", "og'li", "o'gli", "ogli", "ugli", "o'g'il", "qizi", "kizi", "qiz"}
_PATRONYMIC_END = re.compile(r"(ovich|evich|ovna|evna|yevich|yevna)$")

COPY_FIELDS = (
    "pinfl", "passport_series", "passport_number", "hemis_id", "card_number", "faculty_id",
    "parent_phone", "parent_telegram_chat_id", "telegram_link_code",
    "consent_given_at", "consent_version", "consent_source",
)
UNIQUE_FIELDS = frozenset({"pinfl", "hemis_id", "card_number", "telegram_link_code"})
BIOMETRIC_FIELDS = ("biometric_embedding", "biometric_photo_key", "biometrics_status", "biometrics_confirmed_at")

# (jadval, ustun) — shaxsga ishora qiluvchi, oddiy ko'chiriladigan havolalar.
SIMPLE_REFS = (
    ("presence_visits", "student_staff_id"),
    ("face_gallery_embeddings", "student_staff_id"),
    ("lesson_sessions", "teacher_id"),
    ("unknown_sightings", "person_id"),
    ("access_events", "student_staff_id"),
)


def name_tokens(name: str | None) -> list[str]:
    s = (name or "").translate(_APOS).lower().replace("x", "h")
    s = re.sub(r"[^a-z' ]", " ", s)
    words = [w.strip("'") for w in s.split()]
    words = [w for w in words if w and w not in _SUFFIX]
    return [_PATRONYMIC_END.sub("", w) for w in words]


def pinfl_close(a: str, b: str) -> bool:
    """Bir-ikki raqamdagi xato (qo'lda terilgan JSHSHIR) — o'sha odam."""
    return len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 2


def keeper_score(row: dict) -> float:
    """Qaysi yozuv qoladi: rasmiy import (JSHSHIR bor, o'zi ro'yxatdan
    o'tmagan) > tasdiqlangan yuz > ko'proq davomat."""
    return (
        (4 if row.get("pinfl") and not row.get("self_registered") else 0)
        + (2 if row.get("biometrics_status") == "tasdiqlangan" else 0)
        + (1 if not row.get("self_registered") else 0)
        + min(int(row.get("att") or 0), 50) / 100
    )


@dataclass
class DuplicateGroup:
    keeper: dict
    duplicates: list[dict] = field(default_factory=list)


def group_duplicates(rows: list[dict]) -> list[DuplicateGroup]:
    """Toza funksiya — sinovlanadi. `rows` — faol shaxslar (dict)."""
    buckets: dict[tuple, list[tuple[dict, list[str]]]] = {}
    for row in rows:
        tokens = name_tokens(row.get("full_name"))
        if len(tokens) >= 2:
            buckets.setdefault((row.get("type"), tokens[0], tokens[1]), []).append((row, tokens))
    groups: list[DuplicateGroup] = []
    for items in buckets.values():
        if len(items) < 2:
            continue
        patronymics = {tokens[2][:4] for _, tokens in items if len(tokens) >= 3}
        if len(patronymics) > 1:
            continue  # otasining ismi boshqa — adash
        pinfls = [row["pinfl"] for row, _ in items if row.get("pinfl")]
        if len(set(pinfls)) > 1 and not all(pinfl_close(pinfls[0], p) for p in pinfls[1:]):
            continue  # JSHSHIR butunlay boshqa — adash
        people = sorted((row for row, _ in items), key=keeper_score, reverse=True)
        groups.append(DuplicateGroup(keeper=people[0], duplicates=people[1:]))
    groups.sort(key=lambda g: (g.keeper.get("type") or "", g.keeper.get("full_name") or ""))
    return groups


_ROWS_SQL = """
    select s.*,
           (select count(*) from attendance_records a where a.student_staff_id = s.id) as att
    from students_staff s where s.active
"""


async def find_duplicates(db: AsyncSession) -> list[DuplicateGroup]:
    rows = [dict(r._mapping) for r in (await db.execute(text(_ROWS_SQL))).all()]
    return group_duplicates(rows)


async def _person(db: AsyncSession, person_id: uuid.UUID) -> dict | None:
    row = (
        await db.execute(text(_ROWS_SQL.replace("where s.active", "where s.id = :id")), {"id": person_id})
    ).first()
    return dict(row._mapping) if row else None


class MergeError(Exception):
    pass


async def merge_people(db: AsyncSession, keeper_id: uuid.UUID, duplicate_id: uuid.UUID) -> dict:
    """Bitta dublikatni saqlanadigan yozuvga qo'shib o'chiradi. Commit
    chaqiruvchida (bir guruh — bir tranzaksiya). Nima ko'chirilganini qaytaradi."""
    if keeper_id == duplicate_id:
        raise MergeError("Bir xil yozuv")
    keeper = await _person(db, keeper_id)
    dup = await _person(db, duplicate_id)
    if keeper is None or dup is None:
        raise MergeError("Yozuv topilmadi")
    if keeper["type"] != dup["type"]:
        raise MergeError("Talaba va xodimni birlashtirib bo'lmaydi")
    # Himoya: so'rov qo'lda tuzilgan bo'lsa ham, adashlarni birlashtirmaydi.
    if not group_duplicates([keeper, dup]):
        raise MergeError(f"{keeper['full_name']} va {dup['full_name']} — boshqa-boshqa odamlar")

    moved: dict[str, int] = {}
    updates = {f: dup[f] for f in COPY_FIELDS if keeper.get(f) is None and dup.get(f) is not None}
    if len(name_tokens(dup["full_name"])) > len(name_tokens(keeper["full_name"])):
        updates["full_name"] = dup["full_name"]
    if not keeper.get("biometric_embedding") and dup.get("biometric_embedding"):
        for f in BIOMETRIC_FIELDS:
            updates[f] = dup.get(f)
        moved["yuz"] = 1
    unique_moves = [f for f in updates if f in UNIQUE_FIELDS]
    if unique_moves:
        await db.execute(
            text("update students_staff set " + ", ".join(f"{f} = null" for f in unique_moves) + " where id = :d"),
            {"d": duplicate_id},
        )
    if updates:
        await db.execute(
            text("update students_staff set " + ", ".join(f"{f} = :{f}" for f in updates) + " where id = :k"),
            {**updates, "k": keeper_id},
        )

    # Davomat: kuniga bitta yozuv — ikkalasida bo'lsa, ertaroq kelgani qoladi.
    clashes = (
        await db.execute(
            text(
                """select d.id as did, k.id as kid, d.check_in as dci, k.check_in as kci
                   from attendance_records d
                   join attendance_records k on k.date = d.date and k.student_staff_id = :k
                   where d.student_staff_id = :d"""
            ),
            {"d": duplicate_id, "k": keeper_id},
        )
    ).all()
    for clash in clashes:
        drop = clash.kid if clash.dci is not None and (clash.kci is None or clash.dci < clash.kci) else clash.did
        await db.execute(text("delete from attendance_records where id = :i"), {"i": drop})
    res = await db.execute(
        text("update attendance_records set student_staff_id = :k where student_staff_id = :d"),
        {"d": duplicate_id, "k": keeper_id},
    )
    moved["davomat"] = res.rowcount or 0

    # Unikal juftliklar: dars davomati (dars+shaxs), tekshiruv (shaxs+kun+kamera).
    await db.execute(
        text(
            """delete from lesson_attendance d using lesson_attendance k
               where d.student_staff_id = :d and k.student_staff_id = :k
                 and k.lesson_session_id = d.lesson_session_id"""
        ),
        {"d": duplicate_id, "k": keeper_id},
    )
    res = await db.execute(
        text("update lesson_attendance set student_staff_id = :k where student_staff_id = :d"),
        {"d": duplicate_id, "k": keeper_id},
    )
    moved["dars davomati"] = res.rowcount or 0
    await db.execute(
        text(
            """delete from face_review_items d using face_review_items k
               where d.person_id = :d and k.person_id = :k and k.day = d.day
                 and k.camera_id is not distinct from d.camera_id"""
        ),
        {"d": duplicate_id, "k": keeper_id},
    )
    await db.execute(
        text("update face_review_items set person_id = :k where person_id = :d"), {"d": duplicate_id, "k": keeper_id}
    )
    for table, column in SIMPLE_REFS:
        res = await db.execute(
            text(f"update {table} set {column} = :k where {column} = :d"), {"d": duplicate_id, "k": keeper_id}
        )
        moved[table] = res.rowcount or 0

    await db.execute(text("delete from students_staff where id = :d"), {"d": duplicate_id})
    return {key: value for key, value in moved.items() if value}
