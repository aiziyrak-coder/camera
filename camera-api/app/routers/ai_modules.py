"""AI modules REGISTRY endpoints.

Manages which of the TT hujjat's 25 criteria are enabled and their tuning
knobs (threshold, sensitivity). Most criteria DO have a real detector
behind them (classical CV/heuristics in app/jobs/*.py — see each row's
`method` field and app/seed.py's per-criterion notes), enforced by every
sweep loop via app/jobs/module_status.py; `accuracy` is frequently 0 not
because nothing runs, but because nobody has benchmarked that heuristic
against ground truth yet. Only `has_detector=False` rows (PPE,
smoking, general dress-code) have no detector at all — activating those
is rejected outright since the toggle would otherwise do nothing.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.models import AIModuleConfig, Event
from app.schemas.ai_module import AIModuleOut, AIModuleUpdateIn
from app.services.camera_module_mapping import count_faol_cameras_for_module

router = APIRouter(prefix="/api/ai-modules", tags=["ai-modules"])

PermDep = Annotated[CurrentUser, Depends(require_permission("configureAi"))]


# Klassik evristikalar (rang, poza geometriyasi, optik oqim) — real institut
# kamerasida kalibrlanmagan. Operator tasdiqlagan signallar yetarlicha
# yig'ilib, aniqlik isbotlanmaguncha "Sinov rejimi" deb ko'rsatiladi.
TRIAL_MODULE_CODES = {2, 10, 13, 14, 15, 17, 19, 21, 23}
# Hodisa bermaydigan, davomat yozadigan mezonlar.
ATTENDANCE_MODULE_CODES = {6, 7, 8, 9}
PRECISION_WINDOW_DAYS = 90
MIN_REVIEWS_FOR_PRECISION = 10
STABLE_MIN_REVIEWS = 30


async def _review_stats(db: AsyncSession) -> dict[int, tuple[int, int, int]]:
    """module_code -> (tasdiqlangan, rad_etilgan, jami) oxirgi 90 kun."""
    since = datetime.now(timezone.utc) - timedelta(days=PRECISION_WINDOW_DAYS)
    rows = (
        await db.execute(
            select(Event.module_code, Event.status, func.count())
            .where(Event.occurred_at >= since)
            .group_by(Event.module_code, Event.status)
        )
    ).all()
    acc: dict[int, list[int]] = defaultdict(lambda: [0, 0, 0])
    for code, status_value, count in rows:
        if status_value == "tasdiqlangan":
            acc[code][0] += count
        elif status_value == "rad_etilgan":
            acc[code][1] += count
        acc[code][2] += count
    return {code: (c, r, t) for code, (c, r, t) in acc.items()}


def _maturity(code: int, confirmed: int, rejected: int) -> tuple[str, float | None, str]:
    reviewed = confirmed + rejected
    precision = round(confirmed / reviewed * 100, 1) if reviewed >= MIN_REVIEWS_FOR_PRECISION else None
    if precision is not None and precision < 50:
        return (
            "sozlash_kerak",
            precision,
            f"Ko'rib chiqilgan {reviewed} signalning {round(100 - precision)}% i yolg'on — "
            "chegarani oshiring yoki kameralarni tekshiring",
        )
    if code in ATTENDANCE_MODULE_CODES:
        return "asosiy", precision, "Hodisa bermaydi — natijasi davomat va \"Davomat kameralari\" tashxisida ko'rinadi"
    if code in TRIAL_MODULE_CODES and not (precision is not None and precision >= 80 and reviewed >= STABLE_MIN_REVIEWS):
        note = "Kalibrlanmagan evristika — har bir signalni operator tasdiqlashi shart"
        if precision is None:
            note += f" (aniqlik uchun kamida {MIN_REVIEWS_FOR_PRECISION} ta signal ko'rib chiqilishi kerak, hozir {reviewed})"
        return "sinov", precision, note
    if precision is None:
        return (
            "asosiy",
            None,
            f"Aniqlik hali o'lchanmagan: kamida {MIN_REVIEWS_FOR_PRECISION} ta signal ko'rib chiqilishi kerak (hozir {reviewed})",
        )
    return "asosiy", precision, f"{reviewed} ta ko'rib chiqilgan signal asosida"


def _to_out(m: AIModuleConfig, camera_count: int, stats: tuple[int, int, int] = (0, 0, 0)) -> AIModuleOut:
    confirmed, rejected, total = stats
    maturity, precision, note = _maturity(m.code, confirmed, rejected)
    return AIModuleOut(
        id=str(m.id),
        code=m.code,
        group=m.group,
        name=m.name,
        description=m.description,
        method=m.method,
        # Qo'lda yozilgan statik foiz emas — o'lchangan aniqlik (bo'lmasa 0).
        accuracy=precision if precision is not None else 0,
        threshold=m.threshold,
        sensitivity=m.sensitivity,
        camera_count=camera_count,
        active=m.active,
        has_detector=m.has_detector,
        measured_precision=precision,
        reviewed_events=confirmed + rejected,
        recent_events=total,
        maturity=maturity,
        maturity_note=note,
    )


@router.get("", response_model=list[AIModuleOut])
async def list_ai_modules(db: Annotated[AsyncSession, Depends(get_db)], _: PermDep) -> list[AIModuleOut]:
    result = await db.execute(select(AIModuleConfig).order_by(AIModuleConfig.code))
    modules = result.scalars().all()
    stats = await _review_stats(db)
    out: list[AIModuleOut] = []
    for m in modules:
        count = await count_faol_cameras_for_module(db, m.code)
        out.append(_to_out(m, count, stats.get(m.code, (0, 0, 0))))
    return out


@router.patch("/{module_id}", response_model=AIModuleOut)
async def update_ai_module(
    module_id: str,
    body: AIModuleUpdateIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: PermDep,
) -> AIModuleOut:
    result = await db.execute(select(AIModuleConfig).where(AIModuleConfig.id == module_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modul topilmadi")

    if body.active and not module.has_detector:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Bu modul uchun hali aniqlash logikasi yozilmagan — faollashtirib bo'lmaydi",
        )

    module.threshold = body.threshold
    module.sensitivity = body.sensitivity
    module.active = body.active

    await log_action(db, request, current_user.id, f"AI modulni sozladi: {module.name}", "AI Modullari")
    await db.commit()
    await db.refresh(module)
    count = await count_faol_cameras_for_module(db, module.code)
    stats = await _review_stats(db)
    return _to_out(module, count, stats.get(module.code, (0, 0, 0)))
