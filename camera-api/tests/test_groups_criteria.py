"""Nazorat → "Kriteriyalar bo'yicha": guruh kataklari (hisobot bilan bir xil hisob)."""

import uuid
from datetime import date

from app.services import hisobot
from app.services.attendance_policy import Policy


def _member(enrolled: bool) -> hisobot.Member:
    return hisobot.Member(uuid.uuid4(), "Talaba", "1-kurs, TPI-126", None, None, enrolled)


def test_attendance_counts_only_registered_students():
    """Davomat — "kelgan / ro'yxatdan o'tgan" (Nazorat qoidasi: ro'yxatdan
    o'tmaganlar HEMIS bo'yicha kelgan bo'lsa ham sanalmaydi)."""
    people = [_member(True) for _ in range(4)] + [_member(False) for _ in range(3)]
    day = date(2026, 10, 6)
    data = hisobot.Data("talaba", day, day, Policy(), people)
    data.day_rows = {
        people[0].id: {"status": "keldi"},
        people[1].id: {"status": "kech_keldi"},
        people[4].id: {"status": "keldi"},  # ro'yxatdan o'tmagan — sanalmaydi
    }
    data.active_modules = {6, 7, 8, 9, 10, 15, 19, 21, 22}
    cell = hisobot.group_cell(data, "davomat", analysed=False)
    assert cell["value"] == "2/4" and "4 talabadan 2" in cell["title"]
    assert hisobot.group_cell(data, "kechikish", analysed=False)["value"] == "1"


def test_hidden_lesson_criteria_are_not_columns():
    assert set(hisobot.HIDDEN_IN_GROUP) == {"dars_qatnashish", "darsga_kech", "darsdan_erta"}


def test_no_made_up_values_without_video_analysis():
    """2026-10-26: hech qayerda soxta qiymat yo'q — diqqat foizi o'ylab
    topilmaydi, tekshirilmagan oq xalat/chekish "0" yoki ✓ emas, "—"."""
    people = [_member(True), _member(True)]
    day = date(2026, 10, 6)
    data = hisobot.Data("talaba", day, day, Policy(), people)
    data.active_modules = {6, 7, 8, 9, 10, 15, 19, 21, 22}
    data.day_rows = {people[0].id: {"status": "keldi"}}
    assert not hasattr(hisobot, "demo_attention_percent")
    for key in ("diqqat", "forma", "chekish"):
        cell = hisobot.group_cell(data, key, analysed=False)
        assert cell["value"] == "—", (key, cell)
        assert not cell["value"].endswith("%")


def test_unchecked_coat_is_not_a_tick():
    base = {"value": "1", "tone": "danger"}
    assert hisobot.coat_cell(0, 0, base, analysed=True)["value"] == "—"
    assert hisobot.coat_cell(0, 0, base, analysed=False)["value"] == "—"
    assert hisobot.coat_cell(2, 0, base, analysed=True)["value"] == "✓"
    assert hisobot.coat_cell(1, 1, base, analysed=True) is base
