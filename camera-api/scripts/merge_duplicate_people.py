# -*- coding: utf-8 -*-
"""Bir odamning ikki yozuvini birlashtirish.

MUAMMO. Xodimlar ro'yxati import qilingandan keyin ba'zi xodimlar admin
panelidagi "Yangi biriktirish" orqali QAYTA qo'shilgan va yuzi o'sha yangi
yozuvda tasdiqlangan. Natijada bitta odamning ikki yozuvi bor:

    import qilingan  — JSHSHIR va aniq kafedra bor, yuzi TASDIQLANMAGAN
    qo'lda qo'shilgan — JSHSHIR yo'q, lavozim yozilgan, yuzi TASDIQLANGAN

Hisobotlarda bu odam bir vaqtda ham "o'tgan", ham "o'tmagan" bo'lib
chiqadi; JSHSHIR bilan qidirilganda esa tasdiqlanmagan nusxa topiladi.

NIMA QILADI. Har bir shunday juftlik uchun:

  * yuzi tasdiqlangan yozuv SAQLANADI — identifikatori o'zgarmaydi, ya'ni
    yuz tanish, davomat va hodisalar tarixi uzilmaydi;
  * unga import qilingan nusxadan JSHSHIR, fakultet, kafedra, rasmiy ism
    yozilishi va (bo'lmasa) pasport ko'chiriladi;
  * tasdiqlanmagan nusxaga bog'langan davomat, dars davomati va dars
    jadvalidagi o'qituvchi bog'lanishi tasdiqlangan yozuvga o'tkaziladi.
    Bir kun/bir dars uchun ikkalasida yozuv bo'lsa, tasdiqlangandagisi
    qoladi;
  * tasdiqlanmagan nusxa o'chiriladi va audit jurnaliga yoziladi.

JUFTLIK QANDAY ANIQLANADI. Turi bir xil, to'liq ismi bir xil (katta-kichik
harf, ortiqcha bo'shliq va ‘ ’ ` ʻ tutuq belgilari farqi hisobga olinmaydi),
bittasida JSHSHIR bor va yuzi tasdiqlanmagan, ikkinchisida JSHSHIR yo'q va
yuzi tasdiqlangan. SHUBHALI holatlar birlashtirilMAYDI, faqat hisobotda
ko'rsatiladi — ularni admin panelda qo'lda tekshirish kerak:

  * bir ism uchun bir nechta nomzod (masalan, ikkita "Karimov Aziz");
  * familiya va ism mos, lekin to'liq ism emas (otasining ismi yozilmagan);
  * ism mos, lekin turi boshqa (talaba va xodim).

ISHGA TUSHIRISH (server, /opt/camera/camera-api):

    docker compose cp scripts/merge_duplicate_people.py api:/app/scripts/merge_duplicate_people.py
    docker compose exec -T api python scripts/merge_duplicate_people.py --dry-run   # faqat ko'rish
    docker compose exec -T api python scripts/merge_duplicate_people.py             # birlashtirish

Qayta ishga tushirish xavfsiz: birlashtirilganlar ikkinchi marta topilmaydi.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import SessionLocal
from app.models import AttendanceRecord, AuditLog, LessonAttendance, LessonSession, StudentStaff

_APOSTROPHES = "‘’`ʻʼ´"
AUDIT_USER = "Dublikatlarni birlashtirish"


def name_key(full_name: str | None) -> str:
    text = full_name or ""
    for ch in _APOSTROPHES:
        text = text.replace(ch, "'")
    return " ".join(text.lower().split())


def _is_confirmed(record: StudentStaff) -> bool:
    return record.biometrics_status == "tasdiqlangan" and bool(record.biometric_embedding)


def _mask(pinfl: str | None) -> str:
    return f"••••••••••{pinfl[-4:]}" if pinfl else "—"


@dataclass
class Pair:
    keep: StudentStaff  # yuzi tasdiqlangan, JSHSHIRsiz
    source: StudentStaff  # import qilingan, JSHSHIRli, tasdiqlanmagan


@dataclass
class Plan:
    pairs: list[Pair] = field(default_factory=list)
    ambiguous: list[str] = field(default_factory=list)
    partial: list[tuple[StudentStaff, StudentStaff]] = field(default_factory=list)
    cross_type: list[tuple[StudentStaff, StudentStaff]] = field(default_factory=list)


def build_plan(records: list[StudentStaff]) -> Plan:
    plan = Plan()
    groups: dict[tuple[str, str], list[StudentStaff]] = defaultdict(list)
    for record in records:
        groups[(record.type, name_key(record.full_name))].append(record)

    unmatched_keeps: list[StudentStaff] = []
    free_sources: list[StudentStaff] = []
    for (_type, _name), members in groups.items():
        keeps = [r for r in members if not r.pinfl and _is_confirmed(r)]
        sources = [r for r in members if r.pinfl and not _is_confirmed(r)]
        if len(keeps) == 1 and len(sources) == 1:
            plan.pairs.append(Pair(keep=keeps[0], source=sources[0]))
            continue
        if keeps and sources:
            plan.ambiguous.append(
                f"{members[0].full_name} — tasdiqlangan JSHSHIRsiz: {len(keeps)} ta, "
                f"JSHSHIRli tasdiqlanmagan: {len(sources)} ta"
            )
            continue
        unmatched_keeps.extend(keeps)
        free_sources.extend(sources)

    # Faqat hisobot uchun: aniq mos kelmagan, lekin ehtimol bir odam
    sources_by_two_words: dict[str, list[StudentStaff]] = defaultdict(list)
    sources_by_full_name: dict[str, list[StudentStaff]] = defaultdict(list)
    for source in free_sources:
        words = name_key(source.full_name).split()
        sources_by_two_words[" ".join(words[:2])].append(source)
        sources_by_full_name[name_key(source.full_name)].append(source)
    for keep in unmatched_keeps:
        key = name_key(keep.full_name)
        for source in sources_by_full_name.get(key, []):
            if source.type != keep.type:
                plan.cross_type.append((keep, source))
        if len(key.split()) >= 2:
            for source in sources_by_two_words.get(" ".join(key.split()[:2]), []):
                if name_key(source.full_name) != key and source.type == keep.type:
                    plan.partial.append((keep, source))
    return plan


async def _merge(db: AsyncSession, pair: Pair) -> dict[str, int]:
    keep, source = pair.keep, pair.source
    moved: dict[str, int] = {}

    # Kunlik davomat: shu kunga tasdiqlangan yozuvda qator bo'lmasa — ko'chiriladi
    keep_days = select(AttendanceRecord.date).where(AttendanceRecord.student_staff_id == keep.id)
    result = await db.execute(
        update(AttendanceRecord)
        .where(AttendanceRecord.student_staff_id == source.id)
        .where(AttendanceRecord.date.not_in(keep_days))
        .values(student_staff_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["davomat"] = result.rowcount or 0

    keep_lessons = select(LessonAttendance.lesson_session_id).where(LessonAttendance.student_staff_id == keep.id)
    result = await db.execute(
        update(LessonAttendance)
        .where(LessonAttendance.student_staff_id == source.id)
        .where(LessonAttendance.lesson_session_id.not_in(keep_lessons))
        .values(student_staff_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["dars_davomati"] = result.rowcount or 0

    result = await db.execute(
        update(LessonSession)
        .where(LessonSession.teacher_id == source.id)
        .values(teacher_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["dars_jadvali"] = result.rowcount or 0

    # Qolgan (ikkala yozuvda ham bor bo'lgan kun/dars) nusxalari — o'chiriladi
    await db.execute(delete(AttendanceRecord).where(AttendanceRecord.student_staff_id == source.id))
    await db.execute(delete(LessonAttendance).where(LessonAttendance.student_staff_id == source.id))

    pinfl = source.pinfl
    full_name = source.full_name
    faculty_id = source.faculty_id
    unit = source.group_or_position
    passport = (source.passport_series, source.passport_number)
    previous_position = keep.group_or_position

    # JSHSHIR unikal: avval nusxani o'chirib, keyin raqamni beramiz
    await db.delete(source)
    await db.flush()

    keep.pinfl = pinfl
    keep.full_name = full_name
    if faculty_id is not None:
        keep.faculty_id = faculty_id
    if unit:
        keep.group_or_position = unit
    if passport[1] and not keep.passport_number:
        keep.passport_series, keep.passport_number = passport

    db.add(
        AuditLog(
            user_id=None,
            user_name=AUDIT_USER,
            action=(
                f"Dublikat birlashtirildi: {full_name} — JSHSHIR {_mask(pinfl)} va "
                f"«{unit}» yuzi tasdiqlangan yozuvga ko'chirildi (oldingi: «{previous_position}»), "
                f"tasdiqlanmagan nusxa o'chirildi"
            ),
            module="Talabalar",
            status="muvaffaqiyatli",
            ip="internal",
        )
    )
    await db.flush()
    return moved


async def run(dry_run: bool = False, session_factory: async_sessionmaker[AsyncSession] = SessionLocal) -> Plan:
    async with session_factory() as db:
        records = list((await db.execute(select(StudentStaff))).scalars().all())
        plan = build_plan(records)
        _report(plan, dry_run)

        if dry_run or not plan.pairs:
            return plan

        totals: dict[str, int] = defaultdict(int)
        for pair in plan.pairs:
            for key, value in (await _merge(db, pair)).items():
                totals[key] += value
        await db.commit()

        left = await db.scalar(
            select(func.count()).select_from(StudentStaff).where(
                StudentStaff.id.in_([p.source.id for p in plan.pairs])
            )
        )

    print()
    print(f"  Birlashtirildi          : {len(plan.pairs)} ta juftlik")
    print(f"  Ko'chirilgan davomat    : {totals['davomat']} ta kun")
    print(f"  Ko'chirilgan dars davomati: {totals['dars_davomati']} ta")
    print(f"  Dars jadvalida o'qituvchi: {totals['dars_jadvali']} ta darsda almashtirildi")
    print(f"  O'chirilmay qolgan nusxa: {left}")
    print("\nHammasi joyida." if left == 0 else "\nDIQQAT: ba'zi nusxalar o'chmadi — yuqoriga qarang.")
    return plan


def _report(plan: Plan, dry_run: bool) -> None:
    line = "=" * 72
    print(line)
    print(f"  Topilgan dublikat juftliklar: {len(plan.pairs)}")
    print(line)
    for i, pair in enumerate(sorted(plan.pairs, key=lambda p: name_key(p.source.full_name)), 1):
        print(f"  {i:>3}. {pair.source.full_name} ({'Talaba' if pair.source.type == 'talaba' else 'Xodim'})")
        print(f"       saqlanadi (yuzi tasdiqlangan): «{pair.keep.group_or_position}», JSHSHIR yo'q")
        print(f"       ko'chiriladi va o'chiriladi   : «{pair.source.group_or_position}», "
              f"JSHSHIR {_mask(pair.source.pinfl)}")

    if plan.ambiguous:
        print(f"\n  Birlashtirilmadi — bir ismda bir nechta nomzod ({len(plan.ambiguous)}):")
        for text in plan.ambiguous:
            print(f"    {text}")
    if plan.partial:
        print(f"\n  Birlashtirilmadi — ism to'liq mos emas, qo'lda tekshiring ({len(plan.partial)}):")
        for keep, source in plan.partial:
            print(f"    tasdiqlangan: {keep.full_name}  <->  JSHSHIRli: {source.full_name}")
    if plan.cross_type:
        print(f"\n  Birlashtirilmadi — turi boshqa ({len(plan.cross_type)}):")
        for keep, source in plan.cross_type:
            print(f"    {keep.full_name}: tasdiqlangan {keep.type}, JSHSHIRli {source.type}")
    if dry_run:
        print("\n[dry-run] Bazaga hech narsa yozilmadi.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bir odamning ikki yozuvini birlashtirish")
    parser.add_argument("--dry-run", action="store_true", help="faqat ko'rsatish, bazaga yozmaydi")
    args = parser.parse_args(argv)
    asyncio.run(run(dry_run=args.dry_run))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
