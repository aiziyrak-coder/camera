"""TT kriteriya 15 — qo'l og'iz/burunga yaqin (chekish postura evristikasi).

Sigareta obyektini aniqlamaydi — ikki kadrda ham bilak nuqtasi
burun/muayyan radius ichida bo'lsa, \"qo'l og'izga yaqin\" deb signal.
"""

import math

from app.config import settings
from app.services.pose_detection import LEFT_WRIST, NOSE, RIGHT_WRIST, PoseLandmarks


def _wrist_near_mouth(pose: PoseLandmarks) -> bool:
    nose = pose.points[NOSE]
    if nose[3] < settings.smoking_min_landmark_visibility:
        return False
    nx, ny = float(nose[0]), float(nose[1])
    for wrist_idx in (LEFT_WRIST, RIGHT_WRIST):
        w = pose.points[wrist_idx]
        if w[3] < settings.smoking_min_landmark_visibility:
            continue
        dist = math.hypot(float(w[0]) - nx, float(w[1]) - ny)
        if dist <= settings.smoking_wrist_mouth_distance:
            return True
    return False


def wrist_mouth_distance(pose: PoseLandmarks) -> float | None:
    """Ko'rinib turgan bilakning burunga eng yaqin masofasi (0-1 normallangan)."""
    nose = pose.points[NOSE]
    if nose[3] < settings.smoking_min_landmark_visibility:
        return None
    nx, ny = float(nose[0]), float(nose[1])
    distances = [
        math.hypot(float(pose.points[idx][0]) - nx, float(pose.points[idx][1]) - ny)
        for idx in (LEFT_WRIST, RIGHT_WRIST)
        if pose.points[idx][3] >= settings.smoking_min_landmark_visibility
    ]
    return min(distances) if distances else None


def closest_smoking_distance(poses: list[PoseLandmarks]) -> float | None:
    """Chekish holatidagi odamlar orasida eng kichik bilak-og'iz masofasi;
    hech kim bu holatda bo'lmasa None."""
    candidates = [d for d in (wrist_mouth_distance(p) for p in poses) if d is not None]
    near = [d for d in candidates if d <= settings.smoking_wrist_mouth_distance]
    return min(near) if near else None


def is_smoking_posture(poses: list[PoseLandmarks]) -> bool:
    return any(_wrist_near_mouth(p) for p in poses)
