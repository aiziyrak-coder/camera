"""Darslar bo'yicha davomat jadvali (`/api/hisobot/darslar`, app/services/lesson_grid.py)
— tests/situation_world.py dunyosida (DI-2301: L1 tugagan, L2 davom etmoqda, LY kecha)."""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.services import lesson_grid
from tests.conftest import auth_headers
from tests.situation_world import _situation_settings, world  # noqa: F401 — pytest fikstura


@pytest.fixture
async def admin(client: AsyncClient, world):
    return await auth_headers(client, "operator", "operator123")


async def _grid(client, headers, **params):
    res = await client.get("/api/hisobot/darslar", params=params, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _row(data, name):
    return next(r for r in data["rows"] if r["full_name"] == name)


def test_group_keys_match_timetable_and_student_records():
    assert lesson_grid.lesson_group_key("M-626 (Rentgen)") == lesson_grid.student_group_key("3-kurs, M-626")
    assert lesson_grid.lesson_group_key("FT -1724") == lesson_grid.student_group_key("2-kurs, FT-1724")


async def test_one_day_columns_are_lesson_slots_with_each_status(client, admin, world):
    data = await _grid(client, admin, kind="talaba", group="DI-2301")
    assert data["mode"] == "slots"
    assert [c["label"] for c in data["columns"]] == ["1-juftlik", "2-juftlik"]
    first, second = (c["key"] for c in data["columns"])
    aliyev = _row(data, "Aliyev Anvar")
    assert aliyev["cells"][first]["status"] == "keldi" and aliyev["cells"][first]["subject"] == "Anatomiya"
    assert aliyev["cells"][second]["status"] == "kutilmoqda"  # L2 hali tugamagan
    assert _row(data, "Botirova Nigora")["cells"][first]["status"] == "kech_keldi"
    choriyev = _row(data, "Choriyev Sardor")
    assert choriyev["cells"][first]["status"] == "kelmadi" and choriyev["totals"]["absent"] == 1
    assert data["counts"]["kelmadi"] >= 2


async def test_smart_filter_and_sort(client, admin, world):
    absent = await _grid(client, admin, kind="talaba", group="DI-2301", status="kelmadi", sort="ism")
    names = [r["full_name"] for r in absent["rows"]]
    assert "Choriyev Sardor" in names and "Aliyev Anvar" not in names
    assert names == sorted(names)
    assert absent["total"] == absent["counts"]["kelmadi"]


async def test_several_days_show_attended_out_of_lessons(client, admin, world):
    today = date.fromisoformat((await _grid(client, admin, kind="talaba"))["date_to"])
    data = await _grid(client, admin, kind="talaba", group="DI-2301",
                       **{"from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()})
    assert data["mode"] == "days" and len(data["columns"]) == 2
    yesterday_key = data["columns"][0]["key"]
    cell = _row(data, "Aliyev Anvar")["cells"][yesterday_key]
    # Kechagi dars (LY) kamerada baholanmagan — o'lchanmagan.
    assert cell["lessons"] == 1 and cell["unmeasured"] == 1 and cell["status"] == "olchanmadi"


async def test_teachers_show_their_lessons(client, admin, world):
    data = await _grid(client, admin, kind="xodim")
    yusupova = _row(data, "Yusupova Dilnoza Anvarovna")
    statuses = {c["status"] for c in yusupova["cells"].values()}
    assert "keldi" in statuses
    assert all(c["detail"] for c in yusupova["cells"].values())  # katakda guruh nomi


async def test_requires_auth(client, world):
    res = await client.get("/api/hisobot/darslar")
    assert res.status_code in (401, 403)


async def test_full_attendance_ignores_lessons_not_yet_over_and_flags_faceless(client, admin, world):
    data = await _grid(client, admin, kind="talaba", group="DI-2301", status="toliq")
    # Aliyev L1 ga keldi, L2 hali tugamagan — baribir "to'liq qatnashgan".
    assert "Aliyev Anvar" in [r["full_name"] for r in data["rows"]]
    everyone = await _grid(client, admin, kind="talaba", group="DI-2301")
    assert all(r["enrolled"] for r in everyone["rows"]) or everyone["counts"]["yuzsiz"] > 0
    faceless = await _grid(client, admin, kind="talaba", status="yuzsiz")
    assert all(not r["enrolled"] for r in faceless["rows"])
    assert all("Yuzi kiritilmagan" in (c["detail"] or "") for r in faceless["rows"] for c in r["cells"].values())
