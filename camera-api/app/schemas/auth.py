from pydantic import Field

from app.schemas.base import CamelModel


class LoginRequest(CamelModel):
    login: str
    password: str


class LoginResponse(CamelModel):
    token: str
    role: str  # "super-admin" | "admin" — always derived server-side, never trusted from the client
    user_name: str


class SessionResponse(CamelModel):
    """GET /api/auth/me — joriy sessiya haqiqati.

    Rol tokenda emas, BAZADA: mijoz uni kirish paytida olib localStorage'da
    12 soat saqlaydi, lekin admin rolni shu orada o'zgartirishi mumkin.
    Mijoz vaqti-vaqti bilan shu yerdan so'rab, menyusini haqiqatga
    moslaydi (yoki 401 olib, sessiyani tozalaydi)."""

    role: str
    user_name: str


class ForgotPasswordIn(CamelModel):
    login: str


class ResetPasswordIn(CamelModel):
    token: str
    new_password: str = Field(min_length=8)
