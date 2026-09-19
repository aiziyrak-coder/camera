"""Hal qilish muddati (due_at) o'tgan hodisalarni ogohlantirish."""

import asyncio


async def event_escalation_loop() -> None:
    # Hozircha bo'sh — amalga oshirilmagan.
    while True:
        await asyncio.sleep(3600)
