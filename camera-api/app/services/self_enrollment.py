"""QR orqali o'zini ro'yxatdan o'tkazganlarni avtomatik tasdiqlash.

Institut qarori (2026-09-19): har birini admin qo'lda tasdiqlashi shart emas.
Tiriklik (liveness) tekshiruvi topshirishda bajariladi. Bitta himoya qoladi:
yangi yuz bazada boshqa, allaqachon tasdiqlangan odamning yuziga juda
o'xshasa (bir odam ikki nom bilan yoki birovning nomidan), u "kutilmoqda"da
qoladi va admin ko'radi."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AuditLog, StudentStaff

logger = logging.getLogger("app.self_enrollment")


def _unit(vec: list[float]) -> np.ndarray | None:
    arr = np.asarray(vec, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    return arr / norm if norm > 0 else None


async def _confirmed_matrix(db: AsyncSession) -> tuple[list[uuid.UUID], list[str], np.ndarray | None]:
    rows = (
        await db.execute(
            select(StudentStaff.id, StudentStaff.full_name, StudentStaff.biometric_embedding).where(
                StudentStaff.biometrics_status == "tasdiqlangan", StudentStaff.biometric_embedding.is_not(None)
            )
        )
    ).all()
    ids, names, vecs = [], [], []
    for pid, name, raw in rows:
        try:
            vec = _unit(json.loads(raw))
        except (ValueError, TypeError):
            continue
        if vec is not None:
            ids.append(pid)
            names.append(name)
            vecs.append(vec)
    return ids, names, (np.stack(vecs) if vecs else None)


def lookalike(
    embedding: list[float], ids: list[uuid.UUID], names: list[str], matrix: np.ndarray | None, exclude: uuid.UUID
) -> tuple[str, float] | None:
    """Boshqa tasdiqlangan odam bilan o'xshashlik chegaradan yuqori bo'lsa — (ism, o'xshashlik)."""
    vec = _unit(embedding)
    if vec is None or matrix is None:
        return None
    scores = matrix @ vec
    for idx in np.argsort(-scores)[:3]:
        if ids[idx] != exclude and scores[idx] >= settings.self_enrollment_duplicate_threshold:
            return names[idx], float(scores[idx])
    return None


async def decide_status(db: AsyncSession, record: StudentStaff, embedding: list[float]) -> tuple[str, str | None]:
    """Yangi topshirilgan yuz uchun: ("tasdiqlangan", None) yoki ("kutilmoqda", sabab)."""
    if not settings.self_enrollment_auto_approve:
        return "kutilmoqda", None
    ids, names, matrix = await _confirmed_matrix(db)
    hit = lookalike(embedding, ids, names, matrix, record.id)
    if hit:
        return "kutilmoqda", f"yuzi {hit[0]} ga o'xshash ({hit[1]:.2f})"
    return "tasdiqlangan", None


async def approve_pending(db: AsyncSession) -> tuple[int, int]:
    """Kutilayotganlarni (yuzi bor) tasdiqlaydi; o'xshash yuzlilar qoladi.
    Ishga tushishda chaqiriladi — idempotent. Qaytaradi: (tasdiqlandi, qoldi)."""
    if not settings.self_enrollment_auto_approve:
        return 0, 0
    pending = (
        await db.execute(
            select(StudentStaff).where(
                StudentStaff.biometrics_status == "kutilmoqda", StudentStaff.biometric_embedding.is_not(None)
            )
        )
    ).scalars().all()
    if not pending:
        return 0, 0
    ids, names, matrix = await _confirmed_matrix(db)
    approved, held = 0, 0
    now = datetime.now(timezone.utc)
    for record in pending:
        try:
            embedding = json.loads(record.biometric_embedding)
        except (ValueError, TypeError):
            held += 1
            continue
        if lookalike(embedding, ids, names, matrix, record.id):
            held += 1
            continue
        record.biometrics_status = "tasdiqlangan"
        record.biometrics_confirmed_at = now
        approved += 1
        vec = _unit(embedding)
        if vec is not None:
            # Keyingi kutilayotganlar shu odam bilan ham solishtiriladi
            # (bir odam ikki marta ro'yxatdan o'tgan bo'lsa, ikkinchisi qoladi).
            ids.append(record.id)
            names.append(record.full_name)
            matrix = vec[None, :] if matrix is None else np.vstack([matrix, vec])
    if approved:
        db.add(
            AuditLog(
                user_id=None,
                user_name="Avtomatik tasdiqlash",
                action=f"O'zi ro'yxatdan o'tgan {approved} kishi avtomatik tasdiqlandi; {held} tasi o'xshash yuz sababli tekshiruvda",
                module="Talabalar",
                status="muvaffaqiyatli",
                ip="internal",
            )
        )
    await db.commit()
    logger.info("self-enrollment auto-approve", extra={"approved": approved, "held": held})
    return approved, held
