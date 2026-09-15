"""Yuzni tanish statistikasi (har kamera, bugungi kun) va "yumshoq"
mosliklarni takroriy ko'rinish bilan tasdiqlash.

NEGA KERAK. Davomatda "tizimdan o'tganlar ko'p, lekin hech kim davomatga
tushmayapti" holatida savol har doim bir xil: kamera yuzni ko'rmayaptimi,
ko'rib tanimayaptimi yoki umuman tekshirilmayaptimi? Bu modul uchalasini
raqam bilan ko'rsatadi:

  * frames / faces     — kamera tekshirildimi, kadrda yuz bormi;
  * face_px_median     — yuz necha piksel (40 dan kichik yuz tanilmaydi);
  * similarity buckets — eng yaqin nomzodga o'xshashlik taqsimoti: agar
    ko'pchilik 0.47-0.55 oralig'ida bo'lsa, chegara juda qat'iy;
  * strict / relaxed_confirmed / relaxed_pending — nechta moslik yozildi.

Hammasi xotirada (DB emas): bu tashxis uchun, bir necha soniyada
yangilanadi va qayta ishga tushganda nol bo'ladi.

YUMSHOQ MOSLIKNI TASDIQLASH. relaxed moslik (face_matching.graded_matches)
bitta kadrning o'zida yetarli emas. Xuddi shu odam
settings.attendance_relaxed_confirm_window_seconds ichida YANA bir marta
(boshqa kadrda, istalgan kamerada) yumshoq yoki qat'iy mos kelsagina
davomatga yoziladi. Tasodifiy o'xshash begona odam ketma-ket ikki kadrda
bir xil ro'yxatdagi odamga eng yaqin bo'lib chiqishi ehtimoli juda past.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from datetime import date, datetime
from statistics import median

from app.config import settings
from app.timezone import local_now

SIMILARITY_BUCKETS: tuple[tuple[str, float, float], ...] = (
    ("<0.30", -2.0, 0.30),
    ("0.30-0.40", 0.30, 0.40),
    ("0.40-0.47", 0.40, 0.47),
    ("0.47-0.55", 0.47, 0.55),
    (">=0.55", 0.55, 2.0),
)


@dataclass
class CameraRecognitionStats:
    day: date
    frames: int = 0
    frames_with_faces: int = 0
    faces: int = 0
    small_faces: int = 0
    strict: int = 0
    relaxed_confirmed: int = 0
    relaxed_pending: int = 0
    best_similarity: float = -1.0
    last_frame_at: datetime | None = None
    last_face_at: datetime | None = None
    last_match_at: datetime | None = None
    buckets: dict[str, int] = field(default_factory=lambda: {name: 0 for name, _, _ in SIMILARITY_BUCKETS})
    _face_heights: deque[int] = field(default_factory=lambda: deque(maxlen=500))

    @property
    def face_px_median(self) -> int | None:
        return int(median(self._face_heights)) if self._face_heights else None


_stats: dict[str, CameraRecognitionStats] = {}
# person_id -> monotonic vaqt: yumshoq moslik birinchi marta ko'ringan payt.
_pending_relaxed: dict[str, float] = {}


def _bucket(similarity: float) -> str:
    for name, low, high in SIMILARITY_BUCKETS:
        if low <= similarity < high:
            return name
    return SIMILARITY_BUCKETS[-1][0]


def _camera_stats(camera_id: str) -> CameraRecognitionStats:
    today = local_now().date()
    current = _stats.get(camera_id)
    if current is None or current.day != today:
        current = CameraRecognitionStats(day=today)
        _stats[camera_id] = current
    return current


def face_height_px(face) -> int:
    bbox = getattr(face, "bbox", None)
    if bbox is None or len(bbox) < 4:
        return 0
    return max(0, int(bbox[3] - bbox[1]))


def record_frame(camera_id: str | None, faces: list, graded: list) -> None:
    """Bitta tahlil qilingan kadr natijasini qayd etadi (yuz bo'lmasa ham)."""
    if camera_id is None:
        return
    stats = _camera_stats(camera_id)
    now = local_now()
    stats.frames += 1
    stats.last_frame_at = now
    if not faces:
        return
    stats.frames_with_faces += 1
    stats.last_face_at = now
    stats.faces += len(faces)
    for face in faces:
        height = face_height_px(face)
        stats._face_heights.append(height)
        if height < settings.attendance_min_face_px:
            stats.small_faces += 1
    for match in graded:
        if match.similarity > stats.best_similarity:
            stats.best_similarity = match.similarity
        stats.buckets[_bucket(match.similarity)] += 1


def record_credit(camera_id: str | None, grade: str) -> None:
    if camera_id is None:
        return
    stats = _camera_stats(camera_id)
    if grade == "strict":
        stats.strict += 1
    elif grade == "relaxed_confirmed":
        stats.relaxed_confirmed += 1
    elif grade == "relaxed_pending":
        stats.relaxed_pending += 1
        return
    stats.last_match_at = local_now()


def confirm_relaxed(person_id: str, *, now: float | None = None) -> bool:
    """True — shu odam oynada allaqachon bir marta ko'ringan (tasdiqlandi).
    False — birinchi ko'rinish, eslab qolindi va keyingisi kutiladi."""
    moment = time.monotonic() if now is None else now
    window = settings.attendance_relaxed_confirm_window_seconds
    for key, seen_at in list(_pending_relaxed.items()):
        if moment - seen_at > window:
            del _pending_relaxed[key]
    first = _pending_relaxed.get(person_id)
    if first is not None and moment - first >= settings.attendance_relaxed_min_gap_seconds:
        del _pending_relaxed[person_id]
        return True
    if first is None:
        _pending_relaxed[person_id] = moment
    return False


def note_strict_sighting(person_id: str) -> None:
    """Qat'iy moslik allaqachon ishonchli — kutilayotgan yumshoq holatni
    tozalaymiz, keyingi yumshoq ko'rinish qaytadan boshlanadi."""
    _pending_relaxed.pop(person_id, None)


def snapshot(camera_id: str) -> CameraRecognitionStats | None:
    stats = _stats.get(camera_id)
    if stats is None or stats.day != local_now().date():
        return None
    return stats


def reset_for_tests() -> None:
    _stats.clear()
    _pending_relaxed.clear()
