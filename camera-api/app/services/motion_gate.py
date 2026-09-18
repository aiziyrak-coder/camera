"""Harakat bo'lmasa tahlil yo'q — kirish kameralarining kuzatuvchilari uchun.

MUAMMO. Kameralar kalit kadrni har soniyada bera boshlagach (2026-09-18,
scripts/camera_stream_settings.py), 11 ta kirish kuzatuvchisi soniyasiga
~11 ta 4K kadrni tahlil qilmoqchi bo'ldi. AVX'siz CPU'da bitta tahlil
~1.3 s: yuz tanish navbati darhol 10/10 band, 17 ta kutmoqda edi. Vaholanki
eshik oldi ko'p vaqt bo'sh — bo'sh eshik kadrida yuz qidirish CPU'ni
odamlar kelgan paytdan tortib oladi.

YECHIM. Kadr 1/8 o'lchamda kulrang holda dekodlanadi (JPEG DCT
masshtablash — to'liq dekodlashdan o'nlab barobar arzon) va oldingi kadr
bilan solishtiriladi. O'zgargan piksellar ulushi chegaradan past bo'lsa,
to'liq tahlil o'tkazib yuboriladi. Xavfsizlik uchun kamida har
`motion_gate_max_skip_seconds` da bir kadr baribir tahlil qilinadi
(yorug'lik asta o'zgarsa yoki odam qimirlamay turgan bo'lsa ham kamera
"ko'r" bo'lib qolmasin).

Taqqoslash eshik hududi (Camera.face_roi) ichida — koridordagi boshqa
harakat (ekran, daraxt soyasi) eshik kadrini tahlilga majburlamasin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic

import cv2
import numpy as np

from app.config import settings


def small_gray(jpeg_bytes: bytes, roi: tuple[float, float, float, float] | None = None) -> np.ndarray | None:
    """1/8 o'lchamdagi kulrang, biroz xiralashtirilgan kadr (sensor shovqini
    harakat bo'lib ko'rinmasligi uchun). `roi` — normallashgan (x1, y1, x2, y2)."""
    image = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_REDUCED_GRAYSCALE_8)
    if image is None or image.size == 0:
        return None
    if roi is not None:
        height, width = image.shape[:2]
        x1, y1, x2, y2 = roi
        crop = image[int(y1 * height) : max(int(y2 * height), int(y1 * height) + 1),
                     int(x1 * width) : max(int(x2 * width), int(x1 * width) + 1)]
        if crop.size:
            image = crop
    return cv2.GaussianBlur(image, (5, 5), 0)


def changed_fraction(previous: np.ndarray, current: np.ndarray) -> float:
    """Sezilarli o'zgargan piksellar ulushi (0..1)."""
    if previous.shape != current.shape:
        return 1.0
    delta = cv2.absdiff(previous, current)
    return float(np.count_nonzero(delta >= settings.motion_gate_pixel_delta)) / delta.size


@dataclass
class MotionGate:
    """Bitta kameraning holati: oldingi kadr va oxirgi to'liq tahlil payti."""

    previous: np.ndarray | None = None
    last_analysed: float = field(default=0.0)
    skipped: int = 0

    def should_analyse(self, frame: bytes, roi: tuple[float, float, float, float] | None = None) -> bool:
        """Kadrni to'liq tahlil qilish kerakmi. Sinxron (CPU) — chaqiruvchi
        uni event loop'dan tashqarida ishga tushiradi."""
        if not settings.motion_gate_enabled:
            return True
        current = small_gray(frame, roi)
        if current is None:
            return True  # o'qib bo'lmadi — qaror tahlilning o'ziga qoldiriladi
        previous, self.previous = self.previous, current
        now = monotonic()
        if previous is None or now - self.last_analysed >= settings.motion_gate_max_skip_seconds:
            self.last_analysed = now
            return True
        if changed_fraction(previous, current) >= settings.motion_gate_min_changed_fraction:
            self.last_analysed = now
            return True
        self.skipped += 1
        return False
