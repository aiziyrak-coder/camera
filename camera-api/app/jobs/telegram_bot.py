"""Telegram bot: '/start <kod>' orqali foydalanuvchi va ota-onalarni bog'lash (getUpdates)."""

import asyncio


async def telegram_bot_loop() -> None:
    # Hozircha bo'sh — amalga oshirilmagan.
    while True:
        await asyncio.sleep(3600)
