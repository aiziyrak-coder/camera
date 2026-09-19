"""Qavat rejalari (app/routers/floor_plans.py) sxemalari."""

from pydantic import Field, model_validator

from app.schemas.base import CamelModel


class FloorPlanOut(CamelModel):
    id: str
    building_id: str
    building_name: str
    floor: int
    name: str
    image_url: str | None
    """Imzolangan (presigned) havola — ombor javob bermasa None, reja
    ro'yxati baribir qaytadi."""
    width: int
    height: int
    camera_count: int
    """Shu bino+qavatga biriktirilgan kameralar soni."""
    placed_count: int
    """Ulardan rejaga joylashtirilganlari (plan_x/plan_y bor)."""
    created_at: str


class FloorPlanCameraOut(CamelModel):
    id: str
    name: str
    zone: str
    status: str
    """Admin belgilagan holat: 'faol' / 'nofaol' / 'tamirda'."""
    online: bool
    """status='faol' VA yaqinda tarmoqda javob bergan (camera_health.is_reachable)."""
    video_flowing: bool
    """Onlayn kamerada yaqinda yaroqli kadr olingan (is_video_flowing).
    Oflayn kamera uchun doim False."""
    plan_x: float | None
    plan_y: float | None
    plan_rotation: int | None
    ptz_enabled: bool
    open_events: int
    """Oxirgi 24 soatdagi ochiq (yangi/jarayonda, sinov emas) signallar."""
    stream_url: str | None = None
    """Imzolangan HLS havola — faqat viewLive huquqi borlarga."""
    assigned: bool = True
    """False — kamera hali bu qavatga biriktirilmagan (bino yoki qavati
    bo'sh), faqat includeUnassigned=true bilan qaytadi va rejaga
    qo'yilganda shu qavatga biriktiriladi."""
    building_id: str | None = None
    floor: int | None = None


class FloorPlanPositionIn(CamelModel):
    camera_id: str
    plan_x: float | None = Field(default=None, ge=0, le=1)
    plan_y: float | None = Field(default=None, ge=0, le=1)
    plan_rotation: int | None = Field(default=None, ge=0, le=359)

    @model_validator(mode="after")
    def _both_or_none(self) -> "FloorPlanPositionIn":
        # Yarim koordinata (faqat x) ma'nosiz: marker qayerda chizilishini
        # bilib bo'lmaydi. Rejadan olib tashlash — ikkalasi ham None.
        if (self.plan_x is None) != (self.plan_y is None):
            raise ValueError("planX va planY birga beriladi yoki ikkalasi ham bo'sh bo'ladi")
        if self.plan_x is None and self.plan_rotation is not None:
            raise ValueError("Rejada joyi yo'q kameraga burchak berib bo'lmaydi")
        return self


class FloorPlanPositionsIn(CamelModel):
    items: list[FloorPlanPositionIn] = Field(max_length=1000)


class FloorPlanPositionsOut(CamelModel):
    updated: int
    """Joylashuvi haqiqatan o'zgargan kameralar soni."""
    assigned: int
    """Shulardan shu bino+qavatga yangi biriktirilganlari."""
