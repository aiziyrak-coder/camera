from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Permission, RevokedToken, User
from app.security import TokenPayload, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, id: str, role: str, jti: str, expires_at, allowed_building_ids: list | None = None) -> None:
        self.id = id
        self.role = role
        self.jti = jti
        self.expires_at = expires_at
        # Bino doirasi — app/services/access_scope.py. Tokenda EMAS, har
        # so'rovda bazadan (rol kabi): admin doirani toraytirsa, eski
        # sessiya darhol shu doirada ishlaydi.
        self.allowed_building_ids = allowed_building_ids


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Autentifikatsiya talab qilinadi")
    return await user_from_token(credentials.credentials, db)


async def user_from_token(token: str, db: AsyncSession) -> CurrentUser:
    """Tokenni to'liq tekshiradi: imzo va muddat, chiqish (logout)
    blocklisti va token_version. HTTP so'rovlar ham, WebSocket ham shu
    yerdan o'tadi — ikkinchisida faqat imzo tekshirilsa, chiqib ketgan
    yoki paroli almashtirilgan foydalanuvchi signallarni olishda davom
    etardi."""
    try:
        payload: TokenPayload = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token yaroqsiz yoki muddati tugagan") from exc

    # Chiqish (logout) qilingan token — blocklist'da.
    revoked = await db.get(RevokedToken, payload.jti)
    if revoked is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessiya tugatilgan — qayta kiring")

    # Parol o'zgargan yoki hisob bloklangan bo'lsa token_version oshiriladi —
    # eski token (hatto muddati tugamagan bo'lsa ham) shu yerda yaroqsiz bo'ladi.
    user = await db.get(User, payload.user_id)
    if user is None or user.token_version != payload.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessiya tugatilgan — qayta kiring")

    # ROL BAZADAN OLINADI, tokendan EMAS. Token ichidagi "role" — chiqarilgan
    # paytdagi nusxa: admin foydalanuvchining rolini pasaytirsa (yoki
    # oshirsa), eski token jwt_ttl_hours tugaguncha ESKI rol bilan ishlashda
    # davom etardi — ya'ni lavozimidan olingan odam yana bir yarim kun
    # administrator huquqlari bilan yurardi. User qatori baribir shu yerda
    # o'qilgan, qo'shimcha so'rov kerak emas.
    return CurrentUser(
        id=payload.user_id,
        role=user.role,
        jti=payload.jti,
        expires_at=payload.expires_at,
        allowed_building_ids=user.allowed_building_ids,
    )


async def require_monitoring_access(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentUser | None:
    """Monitoring devori uchun himoya — settings bilan o'chirilishi mumkin.

    get_current_user'ni to'g'ridan-to'g'ri Depends qilib qo'ya olmaymiz,
    chunki u sozlamadan qat'i nazar 401 qaytaradi; bu yerda esa himoya
    o'chirilgan bo'lsa so'rov o'tishi kerak (public_monitoring_requires_auth
    izohiga qarang).
    """
    from app.config import settings

    if not settings.public_monitoring_requires_auth:
        # Himoya o'chirilgan (ochiq devor) rejim: anonim so'rov hamma
        # kameralarni ko'radi — bu sozlamaning o'zi shuni anglatadi. Lekin
        # token BILAN kelgan foydalanuvchi (admin panelidagi monitoring)
        # o'z bino doirasida qolishi kerak, shuning uchun token bo'lsa uni
        # aniqlaymiz. Yaroqsiz token 401 EMAS, anonim deb qaraladi: bu
        # rejimda anonimga baribir hamma narsa ochiq, 401 esa faqat eski
        # tokenli devor ekranini buzardi.
        if credentials is None:
            return None
        try:
            return await user_from_token(credentials.credentials, db)
        except HTTPException:
            return None
    return await get_current_user(credentials, db)


# Rol qaysi ustundan o'qiladi (app/models/permission.py).
_PERMISSION_COLUMN = {
    "super-admin": Permission.super_admin,
    "admin": Permission.admin,
    "kamera-masuli": Permission.camera_steward,
}


async def has_any_permission(db: AsyncSession, role: str, keys: tuple[str, ...]) -> bool:
    """Rol berilgan huquqlardan kamida bittasiga egami.

    Noma'lum rol — huquq yo'q. Yangi rol qo'shilganda uni
    _PERMISSION_COLUMN ga kiritish esdan chiqsa, tizim ochilib qolmasin.
    Matritsada yo'q kalit ham — huquq yo'q."""
    column = _PERMISSION_COLUMN.get(role)
    if column is None:
        return False
    result = await db.execute(select(column).where(Permission.key.in_(keys)))
    return any(result.scalars().all())


def require_permission(key: str, *alternatives: str):
    """Server-side equivalent of the frontend's usePermissions().can(key, role) —
    this is the real security boundary; the frontend's own check is UX-only.

    `alternatives` — o'qish endpointlari bir nechta sahifadan chaqiriladi
    (masalan davomat kalendari ham, hisobot ham bitta odamning kunini
    ko'rsatadi). Sanab o'tilgan huquqlardan birortasi yetarli.
    """
    keys = (key, *alternatives)

    async def checker(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> CurrentUser:
        if not await has_any_permission(db, current_user.role, keys):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Sizda bu amal uchun huquq yo'q")
        return current_user

    return checker
