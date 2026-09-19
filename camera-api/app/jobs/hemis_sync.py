"""HEMIS bilan davriy sinxronlash (settings.hemis_sync_interval_hours)."""

import asyncio


async def hemis_sync_loop() -> None:
    # Hozircha bo'sh — amalga oshirilmagan.
    while True:
        await asyncio.sleep(3600)
