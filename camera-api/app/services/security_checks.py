"""Hali standart (demo) parol bilan ishlayotgan hisoblarni aniqlash.

2026-09-17 da production'da `admin` / `admin123` va `operator` /
`operator123` hisoblari faol ishlatilgan, bu parollar esa ochiq
repozitoriyda va kirish sahifasining o'zida yozilgan edi. Tizim buni
boshqaruv panelida baland ovozda aytishi kerak — jimgina emas.

bcrypt tekshiruvi qimmat (~0.2 s), shuning uchun natija bir necha daqiqa
keshlanadi va parol almashtirilganda tozalanadi.
"""

import asyncio
import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.security import verify_password

logger = logging.getLogger("app.security_checks")

# app/seed.py dagi DEMO_USERS bilan bir xil (aylanma importdan qochish uchun
# nusxa emas — seed shu yerdan o'qiydi).
DEMO_PASSWORDS = {"admin": "admin123", "operator": "operator123"}
CACHE_SECONDS = 600

_cache: tuple[float, list[str]] | None = None


def forget_default_password_check() -> None:
    global _cache
    _cache = None


def _still_default(pairs: list[tuple[str, str]]) -> list[str]:
    return sorted(login for login, password_hash in pairs if verify_password(password_hash, DEMO_PASSWORDS[login]))


async def default_password_logins(db: AsyncSession) -> list[str]:
    """Parolini hali demo qiymatidan o'zgartirmagan loginlar."""
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    rows = (
        await db.execute(select(User.login, User.password_hash).where(User.login.in_(list(DEMO_PASSWORDS))))
    ).all()
    logins = await asyncio.to_thread(_still_default, [(login, password_hash) for login, password_hash in rows])
    if logins:
        logger.warning("accounts still use the published demo password", extra={"logins": logins})
    _cache = (now, logins)
    return logins
