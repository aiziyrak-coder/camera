"""HEMIS rasmidan tanitish — yuzi bazada yo'q odamlar uchun.

MUAMMO (2026-09-25). Bazada yuzi borlar — 27% (7259 dan 1972): qolganlarni
kamera ko'rsa ham "Notanish" deydi. HEMIS'da esa 7047 talabadan 7028 tasining
rasmi bor (student-list: image_full), xodimlarniki ham.

YECHIM. HEMIS sinxronlashi rasm manzilini StudentStaff.hemis_photo_url ga
yozadi. Bu vazifa ularni kichik to'plamlarda (settings.hemis_photo_batch)
fon navbatida qayta ishlaydi:

  * yuzi YO'Q odam — rasmdagi yagona/eng yirik yuz uning asosiy vektori
    bo'ladi (holati "tasdiqlangan": rasm universitetning rasmiy bazasidan);
  * yuzi BOR odam — rasm galereyaga qo'shimcha namuna, faqat asl rasmiga
    o'xshasa (aks holda xato sifatida belgilanadi — ehtimol noto'g'ri
    birikma, operator ko'radi);
  * boshqa tasdiqlangan odamga juda o'xshasa — yozilmaydi (adash yoki
    HEMIS'dagi xato rasm).

Har odam bir marta tekshiriladi (hemis_photo_checked_at); rasm o'zgarsa
sinxronlash belgini tozalaydi va qayta tekshiriladi. Yuklab olish faqat
HEMIS domenidan (hemis_base_url bilan bir xil asosiy domen).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal
from app.models import FaceGalleryEmbedding, StudentStaff
from app.services.face_matching import anchor_hash, announce_roster_change
from app.services.face_recognition import NoFaceDetectedError, detect_faces
from app.services.inference_gate import PRIORITY_BACKGROUND
from app.services.integrations import hemis
from app.services.unknown_sightings import _other_lookalike, _unit

logger = logging.getLogger("app.jobs.hemis_photos")

MAX_PHOTO_BYTES = 5_000_000


def allowed_photo_host(url: str) -> bool:
    """Rasm HEMIS bilan bir xil asosiy domendan (student.fjsti.uz -> fjsti.uz)."""
    base = urlsplit(settings.hemis_base_url).hostname or ""
    host = urlsplit(url).hostname or ""
    root = ".".join(base.split(".")[-2:]) if base.count(".") >= 1 else base
    return bool(root) and urlsplit(url).scheme == "https" and (host == root or host.endswith("." + root))


def _largest(faces: list):
    usable = [face for face in faces if getattr(face, "embedding", None) is not None]
    if not usable:
        return None
    return max(usable, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


async def _embed_photo(data: bytes) -> tuple[np.ndarray, int]:
    faces = await detect_faces(data, priority=PRIORITY_BACKGROUND, min_face_px=0, landmarks=False)
    face = _largest(faces)
    if face is None:
        raise NoFaceDetectedError("Rasmda yuz topilmadi")
    height = int(face.bbox[3] - face.bbox[1])
    if height < settings.hemis_photo_min_face_px:
        raise NoFaceDetectedError(f"Yuz juda kichik ({height} px)")
    if face.det_score is not None and face.det_score < 0.6:
        raise NoFaceDetectedError("Yuz aniq emas")
    return face.embedding, height


async def _upload(data: bytes) -> str | None:
    from app.storage import upload_file

    try:
        _file_id, key = await asyncio.to_thread(upload_file, data, "hemis.jpg", "image/jpeg", "biometrika")
    except Exception:
        logger.warning("HEMIS photo upload failed", exc_info=True)
        return None
    return key


async def enroll_person(db: AsyncSession, person: StudentStaff, data: bytes) -> str:
    """Natija: 'asosiy' | 'galereya'. Xato — ValueError/NoFaceDetectedError."""
    vector, height = await _embed_photo(data)
    vector = _unit(vector)
    if vector is None:
        raise ValueError("Yuz vektori buzilgan")
    lookalike = await _other_lookalike(db, vector, person.id)
    if lookalike:
        raise ValueError(f"Boshqa odamga juda o'xshaydi ({lookalike[1]:.2f})")
    encoded = json.dumps([round(float(v), 6) for v in vector])
    if person.biometric_embedding:
        anchor = _unit(json.loads(person.biometric_embedding))
        similarity = float(anchor @ vector) if anchor is not None else 0.0
        if similarity < settings.unknown_assign_min_similarity:
            raise ValueError(f"Mavjud yuz rasmiga o'xshamaydi ({similarity:.2f})")
        db.add(
            FaceGalleryEmbedding(
                student_staff_id=person.id,
                embedding=encoded,
                anchor_hash=anchor_hash(person.biometric_embedding),
                similarity=similarity,
                face_px=height,
                camera_id=None,
            )
        )
        return "galereya"
    person.biometric_embedding = encoded
    person.biometrics_status = "tasdiqlangan"
    person.biometrics_confirmed_at = datetime.now(timezone.utc)
    if not person.biometric_photo_key:
        person.biometric_photo_key = await _upload(data)
    return "asosiy"


async def run_hemis_photos_once(batch: int | None = None) -> dict[str, int]:
    stats = {"asosiy": 0, "galereya": 0, "xato": 0}
    if not settings.hemis_photo_enrollment or not hemis.hemis_configured():
        return stats
    async with SessionLocal() as db:
        people = (
            await db.execute(
                select(StudentStaff)
                .where(
                    StudentStaff.active.is_(True),
                    StudentStaff.hemis_photo_url.is_not(None),
                    StudentStaff.hemis_photo_checked_at.is_(None),
                )
                # Yuzi yo'qlar birinchi — ular tanishni eng ko'p o'stiradi.
                .order_by(StudentStaff.biometric_embedding.is_not(None), StudentStaff.full_name)
                .limit(batch or settings.hemis_photo_batch)
            )
        ).scalars().all()
        if not people:
            return stats
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            for person in people:
                url = person.hemis_photo_url or ""
                person.hemis_photo_checked_at = datetime.now(timezone.utc)
                try:
                    if not allowed_photo_host(url):
                        raise ValueError("Rasm manzili HEMIS domenidan emas")
                    response = await client.get(url)
                    if response.status_code != 200 or not response.headers.get("content-type", "").startswith("image/"):
                        raise ValueError(f"Rasmni yuklab bo'lmadi ({response.status_code})")
                    if len(response.content) > MAX_PHOTO_BYTES:
                        raise ValueError("Rasm juda katta")
                    kind = await enroll_person(db, person, response.content)
                    person.hemis_photo_error = None
                    stats[kind] += 1
                except (ValueError, NoFaceDetectedError, httpx.HTTPError) as error:
                    person.hemis_photo_error = str(error)[:200]
                    stats["xato"] += 1
                await db.commit()
    if stats["asosiy"] or stats["galereya"]:
        try:
            await announce_roster_change()
        except Exception:
            logger.warning("face roster change announcement failed", exc_info=True)
    logger.info("HEMIS photos processed", extra={"event": "hemis_photos", "stats": stats})
    return stats


async def hemis_photos_loop() -> None:
    while True:
        try:
            await run_hemis_photos_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("HEMIS photo enrollment failed")
        await asyncio.sleep(settings.hemis_photo_interval_seconds)
