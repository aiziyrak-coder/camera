# -*- coding: utf-8 -*-
"""Bir odamning ikki yozuvini birlashtirish.

MUAMMO. Xodimlar ro'yxati import qilingandan keyin ba'zi xodimlar admin
panelidagi "Yangi biriktirish" orqali QAYTA qo'shilgan va yuzi o'sha yangi
yozuvda tasdiqlangan. Natijada bitta odamning ikki yozuvi bor:

    import qilingan  — JSHSHIR va aniq kafedra bor
    qo'lda qo'shilgan — JSHSHIR yo'q, lavozim yozilgan, yuzi TASDIQLANGAN

Hisobotlarda bu odam ikki marta sanaladi; JSHSHIR bilan qidirilganda esa
qo'lda qo'shilgan (yuzi bor) yozuv topilmaydi.

IKKI BOSQICH.

  1. ANIQ juftliklar (standart). Turi bir xil, to'liq ismi bir xil
     (katta-kichik harf, bo'shliq, ‘ ’ ` ʻ farqi hisobga olinmaydi), import
     nusxasining yuzi tasdiqlanmagan. Hech qanday shubha yo'q — shunchaki
     ishga tushirilsa birlashtiriladi.

  2. NOANIQ juftliklar (faqat --qisman bilan). Ism boshqacha yozilgan:
       * harf farqi: Salohiddin/Saloxiddin, Saydullaeva/Saydullayeva,
         Qaxorovich/Koxorovich;
       * so'z tartibi teskari: "Arslonbek Ikromiy" / "Ikromiy Arslonbek";
       * kirill yozuvi: "Махаматова Умидахон" / "Maxamatova Umidaxon";
       * otasining ismi yozilmagan: "Kurbonova Aziza" / "Kurbonova Aziza
         Anvarovna";
       * IKKALA yozuv ham tasdiqlangan (odam JSHSHIR bilan ham, admin orqali
         ham yuzini tasdiqlagan).
     Qoida qat'iy: ism aynan mos, familiya juda yaqin, ikkalasida otasining
     ismi bo'lsa — u ham yaqin bo'lishi SHART (aks holda bir xil ism-
     familiyali boshqa odam qo'shilib ketardi). Faqat BIRGA-BIR juftliklar
     olinadi. Avval --dry-run bilan ko'rib chiqing.

NIMA QILADI. Har bir juftlik uchun:

  * yuzi tasdiqlangan yozuv saqlanadi (ikkalasi tasdiqlangan bo'lsa —
    JSHSHIRli rasmiy yozuv), identifikatori o'zgarmaydi;
  * unga JSHSHIR, fakultet, kafedra, rasmiy ism yozilishi va pasport
    ko'chiriladi;
  * o'chiriladigan yozuvga bog'langan davomat, dars davomati va dars
    jadvalidagi o'qituvchi bog'lanishi saqlanadigan yozuvga o'tkaziladi
    (bir kun/bir dars uchun ikkalasida bo'lsa — saqlanadigandagisi qoladi);
  * ikkinchi yozuv o'chiriladi va audit jurnaliga yoziladi.

Birlashtirilmaydigan holatlar (bir ismda bir nechta nomzod, turi boshqa,
faqat familiya yozilgan) batafsil — JSHSHIR oxiri, kafedra, qo'shilgan va
tasdiqlangan vaqti bilan — hisobotda ko'rsatiladi, ular admin panelda qo'lda
hal qilinadi.

ISHGA TUSHIRISH (server, /opt/camera/camera-api):

    docker compose cp scripts/merge_duplicate_people.py api:/app/scripts/merge_duplicate_people.py
    docker compose exec -T api python scripts/merge_duplicate_people.py --dry-run             # aniq juftliklar
    docker compose exec -T api python scripts/merge_duplicate_people.py --qisman --dry-run    # noaniqlar bilan
    docker compose exec -T api python scripts/merge_duplicate_people.py --qisman              # birlashtirish

Qayta ishga tushirish xavfsiz: birlashtirilganlar ikkinchi marta topilmaydi.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import SessionLocal
from app.models import AttendanceRecord, AuditLog, Faculty, LessonAttendance, LessonSession, StudentStaff
from app.timezone import to_local

_APOSTROPHES = "‘’`ʻʼ´"
AUDIT_USER = "Dublikatlarni birlashtirish"

# ── ism solishtirish ─────────────────────────────────────────────────────


def name_key(full_name: str | None) -> str:
    """Aniq moslik kaliti: faqat harf kattaligi, bo'shliq va tutuq belgisi
    shakli farqi e'tiborsiz."""
    text = full_name or ""
    for ch in _APOSTROPHES:
        text = text.replace(ch, "'")
    return " ".join(text.lower().split())


_CYRILLIC = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh",
    "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o", "қ": "q", "ғ": "g", "ҳ": "h",
}
# Otasining ismidan keyingi qo'shimchalar (fuzzy_word'dan keyingi shaklda)
_PARTICLES = {"ogli", "ugli", "ogil", "kizi", "kiz"}


def fuzzy_word(word: str) -> str:
    """Bir so'zni yozilish farqlaridan tozalaydi: kirill -> lotin, tutuq va
    chiziqchalar, x/h, q/k, ye/yo/yu/ya, qo'sh harflar."""
    text = "".join(_CYRILLIC.get(ch, ch) for ch in word.lower())
    text = re.sub(r"[‘’`ʻʼ´'\-.]", "", text)
    for old, new in (("ye", "e"), ("yo", "o"), ("yu", "u"), ("ya", "a"), ("x", "h"), ("q", "k")):
        text = text.replace(old, new)
    return re.sub(r"(.)\1+", r"\1", text)


def name_tokens(full_name: str | None) -> list[str]:
    tokens = [fuzzy_word(t) for t in re.split(r"[\s\-]+", full_name or "") if t.strip(" '‘’`ʻʼ")]
    return [t for t in tokens if t and t not in _PARTICLES]


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _patronymic_close(a: str, b: str) -> bool:
    """Yaqin: umumiy o'xshashlik >= 0.80 ("Qaxorovich"/"Koxorovich" 0.90).
    Chegara ataylab qattiq: "Olimovich"/"Botirovich" — ikki xil ota — 0.74.

    Qo'shimcha yo'l faqat QISQA, kesilib qolgan yozuv uchun: "Toshqo 'ziyevich"
    bo'shliq sabab "Toshko" bo'lib qoladi. Uzun so'zlarga umumiy boshlanish
    yetarli emas — "Muhammadovich"/"Muhammadaliyevich" boshqa-boshqa ota."""
    if _ratio(a, b) >= 0.80:
        return True
    shorter, longer = sorted((a, b), key=len)
    common = 0
    for x, y in zip(shorter, longer):
        if x != y:
            break
        common += 1
    return len(shorter) <= 7 and common >= 5


def names_match(a: list[str], b: list[str]) -> bool:
    """Ism AYNAN, familiya juda yaqin; so'z tartibi ahamiyatsiz. Ikkalasida
    otasining ismi bo'lsa — u ham yaqin bo'lishi shart."""
    if len(a) < 2 or len(b) < 2:
        return False
    for surname, given in ((a[0], a[1]), (a[1], a[0])):
        if given != b[1]:
            continue
        if surname != b[0] and _ratio(surname, b[0]) < 0.85:
            continue
        if len(a) >= 3 and len(b) >= 3 and not _patronymic_close(a[2], b[2]):
            continue
        return True
    return False


# ── reja ─────────────────────────────────────────────────────────────────


def _is_confirmed(record: StudentStaff) -> bool:
    return record.biometrics_status == "tasdiqlangan" and bool(record.biometric_embedding)


def _mask(pinfl: str | None) -> str:
    return f"••••••••••{pinfl[-4:]}" if pinfl else "JSHSHIR yo'q"


@dataclass
class Pair:
    keep: StudentStaff  # saqlanadi
    remove: StudentStaff  # ma'lumoti ko'chiriladi va o'chiriladi
    take_identity: bool  # True — JSHSHIR va kafedra `remove` dan `keep` ga ko'chiriladi
    kind: str  # "aniq" | "qisman" | "ikkalasi_tasdiqlangan"


@dataclass
class Plan:
    pairs: list[Pair] = field(default_factory=list)  # aniq — standart birlashtiriladi
    partial: list[Pair] = field(default_factory=list)  # noaniq — faqat --qisman bilan
    ambiguous: list[list[StudentStaff]] = field(default_factory=list)
    cross_type: list[tuple[StudentStaff, StudentStaff]] = field(default_factory=list)
    incomplete: list[StudentStaff] = field(default_factory=list)  # faqat bitta so'z
    not_found: list[StudentStaff] = field(default_factory=list)  # ro'yxatda o'xshashi yo'q


def build_plan(records: list[StudentStaff]) -> Plan:
    plan = Plan()

    # 1-bosqich: aniq juftliklar
    groups: dict[tuple[str, str], list[StudentStaff]] = defaultdict(list)
    for record in records:
        groups[(record.type, name_key(record.full_name))].append(record)

    handled: set = set()
    for members in groups.values():
        keeps = [r for r in members if not r.pinfl and _is_confirmed(r)]
        sources = [r for r in members if r.pinfl and not _is_confirmed(r)]
        if len(keeps) == 1 and len(sources) == 1:
            plan.pairs.append(Pair(keep=keeps[0], remove=sources[0], take_identity=True, kind="aniq"))
            handled.update({keeps[0].id, sources[0].id})
        elif keeps and sources:
            plan.ambiguous.append(keeps + sources)
            handled.update(r.id for r in keeps + sources)

    # 2-bosqich: qolgan JSHSHIRsiz tasdiqlanganlar uchun noaniq moslik
    orphans = [r for r in records if not r.pinfl and _is_confirmed(r) and r.id not in handled]
    candidates = [r for r in records if r.pinfl and r.id not in handled]
    candidate_tokens = [(c, name_tokens(c.full_name)) for c in candidates]

    matches: dict = {}
    reverse: dict = defaultdict(list)
    for orphan in orphans:
        tokens = name_tokens(orphan.full_name)
        if len(tokens) < 2:
            plan.incomplete.append(orphan)
            continue
        found = [c for c, c_tokens in candidate_tokens if names_match(tokens, c_tokens)]
        matches[orphan.id] = (orphan, found)
        for candidate in found:
            reverse[candidate.id].append(orphan)

    for orphan, found in matches.values():
        if not found:
            plan.not_found.append(orphan)
            continue
        if len(found) > 1 or len(reverse[found[0].id]) > 1:
            group = [orphan, *found] if len(found) > 1 else [*reverse[found[0].id], found[0]]
            if not any({r.id for r in g} == {r.id for r in group} for g in plan.ambiguous):
                plan.ambiguous.append(group)
            continue
        source = found[0]
        if source.type != orphan.type:
            plan.cross_type.append((orphan, source))
        elif _is_confirmed(source):
            plan.partial.append(Pair(keep=source, remove=orphan, take_identity=False, kind="ikkalasi_tasdiqlangan"))
        else:
            plan.partial.append(Pair(keep=orphan, remove=source, take_identity=True, kind="qisman"))
    return plan


# ── birlashtirish ─────────────────────────────────────────────────────────


async def _merge(db: AsyncSession, pair: Pair) -> dict[str, int]:
    keep, remove = pair.keep, pair.remove
    moved: dict[str, int] = {}

    keep_days = select(AttendanceRecord.date).where(AttendanceRecord.student_staff_id == keep.id)
    result = await db.execute(
        update(AttendanceRecord)
        .where(AttendanceRecord.student_staff_id == remove.id)
        .where(AttendanceRecord.date.not_in(keep_days))
        .values(student_staff_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["davomat"] = result.rowcount or 0

    keep_lessons = select(LessonAttendance.lesson_session_id).where(LessonAttendance.student_staff_id == keep.id)
    result = await db.execute(
        update(LessonAttendance)
        .where(LessonAttendance.student_staff_id == remove.id)
        .where(LessonAttendance.lesson_session_id.not_in(keep_lessons))
        .values(student_staff_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["dars_davomati"] = result.rowcount or 0

    result = await db.execute(
        update(LessonSession)
        .where(LessonSession.teacher_id == remove.id)
        .values(teacher_id=keep.id)
        .execution_options(synchronize_session=False)
    )
    moved["dars_jadvali"] = result.rowcount or 0

    await db.execute(delete(AttendanceRecord).where(AttendanceRecord.student_staff_id == remove.id))
    await db.execute(delete(LessonAttendance).where(LessonAttendance.student_staff_id == remove.id))

    removed_name, removed_unit = remove.full_name, remove.group_or_position
    identity = (remove.pinfl, remove.full_name, remove.faculty_id, remove.group_or_position,
                remove.passport_series, remove.passport_number)
    previous_unit = keep.group_or_position
    previous_name = keep.full_name

    # JSHSHIR unikal: avval nusxani o'chirib, keyin raqamni beramiz
    await db.delete(remove)
    await db.flush()

    pinfl, full_name, faculty_id, unit, series, number = identity
    if pair.take_identity:
        keep.pinfl = pinfl
        keep.full_name = full_name
        if faculty_id is not None:
            keep.faculty_id = faculty_id
        if unit:
            keep.group_or_position = unit
        if number and not keep.passport_number:
            keep.passport_series, keep.passport_number = series, number
        action = (
            f"Dublikat birlashtirildi ({pair.kind}): «{removed_name}» JSHSHIR {_mask(pinfl)} va «{unit}» "
            f"yuzi tasdiqlangan «{previous_name}» yozuviga ko'chirildi (oldingi lavozim: «{previous_unit}»), "
            f"nusxa o'chirildi"
        )
    else:
        if keep.faculty_id is None and faculty_id is not None:
            keep.faculty_id = faculty_id
        action = (
            f"Dublikat birlashtirildi ({pair.kind}): ikkinchi tasdiqlangan nusxa «{removed_name}» "
            f"(«{removed_unit}», JSHSHIRsiz) o'chirildi, «{keep.full_name}» JSHSHIR {_mask(keep.pinfl)} saqlandi"
        )

    db.add(AuditLog(user_id=None, user_name=AUDIT_USER, action=action, module="Talabalar",
                    status="muvaffaqiyatli", ip="internal"))
    await db.flush()
    return moved


async def run(
    dry_run: bool = False,
    include_partial: bool = False,
    session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
) -> Plan:
    async with session_factory() as db:
        records = list((await db.execute(select(StudentStaff))).scalars().all())
        faculties = {f.id: f.name for f in (await db.execute(select(Faculty))).scalars().all()}
        plan = build_plan(records)
        _report(plan, faculties, dry_run, include_partial)

        to_merge = plan.pairs + (plan.partial if include_partial else [])
        if dry_run or not to_merge:
            return plan

        removed_ids = [p.remove.id for p in to_merge]
        deletes_confirmed_face = any(p.kind == "ikkalasi_tasdiqlangan" for p in to_merge)
        totals: dict[str, int] = defaultdict(int)
        for pair in to_merge:
            for key, value in (await _merge(db, pair)).items():
                totals[key] += value
        await db.commit()

        left = await db.scalar(select(func.count()).select_from(StudentStaff).where(StudentStaff.id.in_(removed_ids)))

    print()
    print(f"  Birlashtirildi              : {len(to_merge)} ta juftlik")
    print(f"  Ko'chirilgan davomat        : {totals['davomat']} ta kun")
    print(f"  Ko'chirilgan dars davomati  : {totals['dars_davomati']} ta")
    print(f"  Dars jadvalida o'qituvchi   : {totals['dars_jadvali']} ta darsda almashtirildi")
    print(f"  O'chirilmay qolgan nusxa    : {left}")
    print("\nHammasi joyida." if left == 0 else "\nDIQQAT: ba'zi nusxalar o'chmadi — yuqoriga qarang.")
    if deletes_confirmed_face:
        print(
            "\nMUHIM: yuz vektori bor yozuvlar o'chirildi. AI tanish ro'yxatini 5 daqiqagacha xotirada\n"
            "saqlaydi — API'ni qayta ishga tushiring (docker compose ... restart api) yoki 5 daqiqa kuting."
        )
    return plan


# ── hisobot ───────────────────────────────────────────────────────────────


def _describe(record: StudentStaff, faculties: dict) -> str:
    created = to_local(record.created_at).strftime("%d.%m.%Y %H:%M") if record.created_at else "?"
    confirmed = (
        to_local(record.biometrics_confirmed_at).strftime("%d.%m.%Y %H:%M")
        if record.biometrics_confirmed_at
        else ("ha" if _is_confirmed(record) else "yo'q")
    )
    return (
        f"{record.full_name} | {'Talaba' if record.type == 'talaba' else 'Xodim'} | {_mask(record.pinfl)} | "
        f"{faculties.get(record.faculty_id, 'Fakultetsiz')} | «{record.group_or_position}» | "
        f"qo'shilgan {created} | yuz: {confirmed}"
    )


def _report(plan: Plan, faculties: dict, dry_run: bool, include_partial: bool) -> None:
    line = "=" * 76
    print(line)
    print(f"  Aniq dublikat juftliklar: {len(plan.pairs)}")
    print(line)
    for i, pair in enumerate(sorted(plan.pairs, key=lambda p: name_key(p.remove.full_name)), 1):
        print(f"  {i:>3}. {pair.remove.full_name}")
        print(f"       saqlanadi : «{pair.keep.group_or_position}» (yuzi tasdiqlangan)")
        print(f"       ko'chadi  : «{pair.remove.group_or_position}», JSHSHIR {_mask(pair.remove.pinfl)}")

    print()
    print(line)
    status = "BIRLASHTIRILADI" if include_partial else "faqat --qisman bilan birlashtiriladi"
    print(f"  Noaniq juftliklar (ism boshqacha yozilgan): {len(plan.partial)} — {status}")
    print(line)
    for i, pair in enumerate(sorted(plan.partial, key=lambda p: name_key(p.keep.full_name)), 1):
        label = "ikkalasi ham tasdiqlangan" if pair.kind == "ikkalasi_tasdiqlangan" else "ism farqi"
        print(f"  {i:>3}. [{label}]")
        print(f"       saqlanadi : {_describe(pair.keep, faculties)}")
        print(f"       o'chiriladi: {_describe(pair.remove, faculties)}")

    if plan.ambiguous:
        print(f"\n  QO'LDA HAL QILING — bir ismda bir nechta yozuv ({len(plan.ambiguous)}):")
        for group in plan.ambiguous:
            print("    ---")
            for record in group:
                print(f"    {_describe(record, faculties)}")
    if plan.cross_type:
        print(f"\n  QO'LDA HAL QILING — biri talaba, biri xodim ({len(plan.cross_type)}):")
        for orphan, source in plan.cross_type:
            print(f"    {_describe(orphan, faculties)}")
            print(f"    {_describe(source, faculties)}")
            print("    ---")
    if plan.incomplete:
        print(f"\n  Faqat bitta so'z yozilgan — moslab bo'lmaydi, ismini to'liq kiriting ({len(plan.incomplete)}):")
        for record in plan.incomplete:
            print(f"    {_describe(record, faculties)}")
    if plan.not_found:
        print(f"\n  Kadrlar ro'yxatida o'xshashi topilmadi — yangi yoki ro'yxatdan tashqari xodimlar ({len(plan.not_found)}):")
        for record in sorted(plan.not_found, key=lambda r: name_key(r.full_name)):
            print(f"    {record.full_name} — «{record.group_or_position}»")
    if dry_run:
        print("\n[dry-run] Bazaga hech narsa yozilmadi.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bir odamning ikki yozuvini birlashtirish")
    parser.add_argument("--dry-run", action="store_true", help="faqat ko'rsatish, bazaga yozmaydi")
    parser.add_argument("--qisman", action="store_true",
                        help="ismi boshqacha yozilgan (noaniq) juftliklarni ham birlashtirish")
    args = parser.parse_args(argv)
    asyncio.run(run(dry_run=args.dry_run, include_partial=args.qisman))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
