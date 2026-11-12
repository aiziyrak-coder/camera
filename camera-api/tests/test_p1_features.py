import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Event, StudentStaff
from app.services.inference_gate import PRIORITY_BACKGROUND, PRIORITY_LIVE, PriorityInferenceGate
from tests.conftest import auth_headers


class TestInferencePriorityGate:
    async def test_high_priority_jumps_queue(self):
        gate = PriorityInferenceGate(1)
        order: list[str] = []
        gate_open = asyncio.Event()

        async def holder():
            async with gate.slot(priority=PRIORITY_BACKGROUND):
                order.append("holder_start")
                await gate_open.wait()
                order.append("holder_end")

        async def low():
            async with gate.slot(priority=PRIORITY_BACKGROUND):
                order.append("low")

        async def high():
            async with gate.slot(priority=PRIORITY_LIVE):
                order.append("high")

        holder_task = asyncio.create_task(holder())
        await asyncio.sleep(0.02)
        low_task = asyncio.create_task(low())
        high_task = asyncio.create_task(high())
        await asyncio.sleep(0.02)
        gate_open.set()
        await asyncio.gather(holder_task, low_task, high_task)
        assert order.index("high") < order.index("low")


@pytest.mark.usefixtures("seeded")
class TestStudentStaffImport:
    async def test_csv_import_creates_rows(self, client: AsyncClient, db_session):
        headers = await auth_headers(client, "admin", "admin123")
        faculty = "Davolash ishi"
        csv_body = (
            "full_name,type,faculty,group_or_position\n"
            f"Import Test Talaba,talaba,{faculty},101-guruh\n"
            f"Import Test Xodim,xodim,{faculty},Assistent\n"
        ).encode("utf-8")
        resp = await client.post(
            "/api/students-staff/import",
            headers=headers,
            files={"file": ("people.csv", csv_body, "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["imported"] == 2
        assert body["skipped"] == 0
        assert body["errors"] == []

        names = (
            await db_session.execute(
                select(StudentStaff.full_name).where(StudentStaff.full_name.like("Import Test%"))
            )
        ).scalars().all()
        assert len(names) == 2

    async def test_csv_import_skips_duplicate(self, client: AsyncClient, db_session):
        headers = await auth_headers(client, "admin", "admin123")
        faculty = "Davolash ishi"
        csv_body = (
            "full_name,type,faculty,group_or_position\n"
            f"Duplicate Person,talaba,{faculty},102-guruh\n"
        ).encode("utf-8")
        await client.post(
            "/api/students-staff/import",
            headers=headers,
            files={"file": ("people.csv", csv_body, "text/csv")},
        )
        resp = await client.post(
            "/api/students-staff/import",
            headers=headers,
            files={"file": ("people.csv", csv_body, "text/csv")},
        )
        assert resp.json()["imported"] == 0
        assert resp.json()["skipped"] == 1


