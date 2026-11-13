"""Ochiq taqdimot ko'rsatkichlari: kirishsiz ochiladi va shaxsiy ma'lumot bermaydi."""

import pytest
from httpx import AsyncClient

from app.routers import presentation
from tests.conftest import auth_headers


@pytest.mark.usefixtures("seeded")
async def test_presentation_stats_are_public_and_aggregate_only(client: AsyncClient):
    presentation._cache["data"] = None
    headers = await auth_headers(client, "admin", "admin123")
    created = await client.post(
        "/api/students-staff",
        headers=headers,
        json={"fullName": "Taqdimot Talabasi", "type": "talaba", "faculty": "Davolash ishi", "groupOrPosition": "2-kurs, DI-2301"},
    )
    assert created.status_code == 201

    resp = await client.get("/api/public/taqdimot")
    assert resp.status_code == 200
    data = resp.json()
    assert data["talaba"]["total"] >= 1
    assert len(data["daily"]) == 30
    assert {"faceVectors", "photos", "byFaculty", "byCourse", "hemis", "parents"} <= data.keys()
    # Ism yoki boshqa shaxsiy ma'lumot chiqmasligi kerak.
    assert "Taqdimot Talabasi" not in resp.text
