"""Osilib qolgan ulanishlar himoyasi (2026-11-02): har ulanishda Postgres
idle_in_transaction_session_timeout sozlamadagi qiymatga o'rnatiladi."""

import pytest
from sqlalchemy import text

from app.config import settings
from app.database import engine


@pytest.mark.anyio
async def test_engine_sets_idle_in_transaction_timeout():
    async with engine.connect() as conn:
        value = (await conn.execute(text("SHOW idle_in_transaction_session_timeout"))).scalar_one()
    expected = settings.db_idle_in_transaction_timeout_seconds
    assert value in (f"{expected}s", f"{expected // 60}min", f"{expected * 1000}ms")
