import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.email import send_password_reset_email
from app.models import AuditLog, PasswordResetToken, RevokedToken, User
from app.rate_limit import limiter
from app.schemas.auth import ForgotPasswordIn, LoginRequest, LoginResponse, ResetPasswordIn, SessionResponse
from app.security import create_access_token, hash_password, verify_password
from app.services.security_checks import forget_default_password_check

logger = logging.getLogger("app.auth")

RESET_TOKEN_TTL_MINUTES = 30

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _mask_login(login: str) -> str:
    """Noto'g'ri urinishdagi login jurnalga to'liq yozilmaydi.

    Odamlar login maydoniga ko'pincha JSHSHIR yoki pasport raqamini
    yozadi (ro'yxatdan o'tish sahifasi bilan adashtirib) — tizim jurnali
    esa ko'p adminlarga ochiq. Mavjud foydalanuvchi logini bo'lsa ham
    brute-force monitoringi uchun boshi va oxiri yetarli."""
    text = (login or "").strip()
    digits = sum(ch.isdigit() for ch in text)
    if len(text) <= 3:
        return "*" * len(text)
    if digits >= 6:
        return f"{text[:2]}{'*' * (len(text) - 4)}{text[-2:]}"
    return f"{text[:3]}{'*' * max(0, len(text) - 3)}"


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    result = await db.execute(select(User).where(User.login == body.login))
    user = result.scalar_one_or_none()
    ip = request.client.host if request.client else "unknown"

    if user is None or not verify_password(user.password_hash, body.password):
        # Muvaffaqiyatsiz urinish ham audit qilinadi — brute-force monitoringi uchun.
        db.add(
            AuditLog(
                user_id=user.id if user else None,
                user_name=_mask_login(body.login),
                action="Noto'g'ri login urinishi",
                module="Autentifikatsiya",
                status="xatolik",
                ip=ip,
            )
        )
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login yoki parol noto'g'ri")

    user.last_login_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=user.id,
            user_name=user.full_name,
            action="Tizimga kirish",
            module="Autentifikatsiya",
            status="muvaffaqiyatli",
            ip=ip,
        )
    )
    await db.commit()

    token = create_access_token(str(user.id), user.role, user.token_version)
    return LoginResponse(token=token, role=user.role, user_name=user.full_name)


@router.get("/me", response_model=SessionResponse)
async def me(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SessionResponse:
    """Sessiyaning hozirgi haqiqati: rol va ism BAZADAN.

    get_current_user allaqachon tokenni, blocklistni va token_version'ni
    tekshiradi — ya'ni chiqib ketgan, paroli almashtirilgan yoki o'chirilgan
    hisob bu yerda 401 oladi. Mijoz shu javob bilan localStorage'dagi
    (kirish paytida muzlatilgan) rolni yangilaydi: lavozimi o'zgargan odam
    JWT muddati tugashini kutmasdan to'g'ri menyuni ko'radi."""
    user = await db.get(User, current_user.id)
    if user is None:  # pragma: no cover — get_current_user allaqachon tekshirgan
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessiya tugatilgan — qayta kiring")
    return SessionResponse(role=user.role, user_name=user.full_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> None:
    """Real server-side revocation — the token's own jti is blocklisted until
    its natural expiry, so a copy of it (stolen, cached, whatever) stops
    working immediately instead of staying valid for the rest of its TTL."""
    db.add(RevokedToken(jti=uuid.UUID(current_user.jti), expires_at=current_user.expires_at))
    await log_action(db, request, current_user.id, "Tizimdan chiqdi", "Autentifikatsiya")
    await db.commit()


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Har doim bir xil (bo'sh, 204) javob qaytaradi — hisob mavjudligini
    yoki unga email biriktirilganini oshkor qilmaslik uchun. Haqiqiy ish
    (token yaratish, email/log) faqat hisob topilganda ichkarida bajariladi."""
    result = await db.execute(select(User).where(User.login == body.login))
    user = result.scalar_one_or_none()
    if user is None:
        return

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)
    db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    await log_action(db, request, str(user.id), "Parolni tiklashni so'radi", "Autentifikatsiya")
    await db.commit()

    reset_link = f"{settings.frontend_base_url}/parolni-tiklash?token={raw_token}"
    if user.email:
        send_password_reset_email(user.email, user.full_name, reset_link)
    else:
        # HAVOLANING O'ZI JURNALGA YOZILMAYDI. Token — bir martalik parol
        # tiklash kaliti: jurnalni o'qiy oladigan (yoki jurnal yig'uvchi
        # tizimga ulangan) har kim shu havola bilan hisobni egallab olardi.
        # Email yo'q bo'lsa to'g'ri yo'l — administrator orqali tiklash
        # (POST /api/users/{id}/reset-password).
        logger.warning(
            "parolni tiklash so'raldi, lekin foydalanuvchida email manzili yo'q — havola yuborilmadi",
            extra={"user_id": str(user.id)},
        )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    body: ResetPasswordIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    token_hash = hashlib.sha256(body.token.encode("utf-8")).hexdigest()
    result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    reset_token = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if reset_token is None or reset_token.used_at is not None or reset_token.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Havola yaroqsiz yoki muddati tugagan")

    user = await db.get(User, reset_token.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Havola yaroqsiz yoki muddati tugagan")

    user.password_hash = hash_password(body.new_password)
    forget_default_password_check()
    # Parol o'zgarganda barcha eski sessiyalar (barcha qurilmalardagi JWT'lar)
    # avtomatik yaroqsiz bo'ladi — get_current_user token_version'ni solishtiradi.
    user.token_version += 1
    reset_token.used_at = now
    # Shu foydalanuvchining BOSHQA ishlatilmagan tiklash havolalari ham
    # bekor qilinadi: bir necha marta "parolni unutdim" bosilgan bo'lsa,
    # eski email'dagi havola parol allaqachon almashtirilganidan keyin
    # ham ishlab turardi (hisobni qayta egallash yo'li).
    await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )

    await log_action(db, request, str(user.id), "Parolni muvaffaqiyatli tikladi", "Autentifikatsiya")
    await db.commit()
