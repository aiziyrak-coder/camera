"""GET /api/situation/people-status — sanoq ortidagi odamlar ro'yxati.

Dunyo: tests/situation_world.py (overview testidagi sanoqlar bilan bir xil).
"""

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers
from tests.situation_world import _situation_settings, world  # noqa: F401 — pytest fikstura

URL = "/api/situation/people-status"


@pytest.fixture
async def admin(client: AsyncClient, world):
    return await auth_headers(client, "operator", "operator123")


async def test_counts_match_overview_and_lists_match_counts(client, world, admin):
    body = (await client.get(URL, headers=admin)).json()
    counts = body["counts"]
    # overview: talabalar 12, kelgan 6 (1 kech), kelmadi 2, kutilmoqda 1, yuzsiz 3
    assert counts["hammasi"] == 12 and counts["kelgan"] == 6 and counts["kechKeldi"] == 1
    assert counts["kelmadi"] == 2 and counts["kutilmoqda"] == 1 and counts["yuzsiz"] == 3
    assert body["total"] == 12
    for status, key in (("kelgan", "kelgan"), ("kech_keldi", "kechKeldi"), ("kelmadi", "kelmadi"), ("yuzsiz", "yuzsiz")):
        listing = (await client.get(URL, params={"status": status}, headers=admin)).json()
        assert listing["total"] == counts[key], status
        if status == "kech_keldi":
            assert all(p["status"] == "kech_keldi" for p in listing["items"])
        if status == "yuzsiz":
            assert all(p["biometricsStatus"] != "tasdiqlangan" for p in listing["items"])


async def test_staff_and_pagination(client, world, admin):
    staff = (await client.get(URL, params={"type": "xodim"}, headers=admin)).json()
    assert staff["counts"]["hammasi"] == 4 and staff["counts"]["kelgan"] == 2
    page = (await client.get(URL, params={"pageSize": 5, "page": 2}, headers=admin)).json()
    assert page["total"] == 12 and len(page["items"]) == 5


async def test_requires_permission(client: AsyncClient):
    assert (await client.get(URL)).status_code in (401, 403)
