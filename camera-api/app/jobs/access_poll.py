"""Turniket qurilmalaridan hodisalarni so'rab olish (Hikvision ISAPI)."""

import asyncio


async def access_poll_loop() -> None:
    # Hozircha bo'sh — amalga oshirilmagan.
    while True:
        await asyncio.sleep(3600)
