from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class EventOut(CamelModel):
    """Matches src/types/index.ts `AIEvent` exactly."""

    id: str
    timestamp: str
    camera_id: str
    camera_name: str
    building: str
    module_code: int
    module_name: str
    group: Literal["A", "B", "C", "D", "E", "F"]
    confidence: int
    severity: Literal["past", "o'rta", "yuqori"]
    status: Literal["yangi", "tasdiqlangan", "rad_etilgan"]
    person_name: str | None = None
    reviewed_by: str | None = None
    # Presigned URL to the frame that triggered this event — see
    # app/services/event_bus.py. Null when no frame was captured (or the
    # upload failed) for this particular event.
    snapshot_url: str | None = None
    # ISO vaqt institut mintaqasi bilan — frontend "12 daq oldin" hisoblaydi.
    occurred_at: str | None = None
    # Operator qaror qilgan payt ("2026-09-15 14:20", institut vaqti).
    reviewed_at: str | None = None
    # Sinov rejimidagi modul signali — operator navbatiga chiqmaydi.
    is_trial: bool = False
    # Dalil: {"reason": "...", "metrics": {...}} — app/services/event_bus.py.
    details: dict | None = None


class EventCreateIn(CamelModel):
    """Submitted by an AI inference service when it detects something —
    not by a human admin through the UI."""

    camera_id: str
    module_code: int
    module_name: str
    group: Literal["A", "B", "C", "D", "E", "F"]
    confidence: int
    severity: Literal["past", "o'rta", "yuqori"]
    person_name: str | None = None


class EventReviewIn(CamelModel):
    status: Literal["tasdiqlangan", "rad_etilgan"]


class EventBulkReviewIn(CamelModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    status: Literal["tasdiqlangan", "rad_etilgan"]


class EventBulkReviewOut(CamelModel):
    updated: int
    skipped: int
    status: Literal["tasdiqlangan", "rad_etilgan"]


class EventFacetOut(CamelModel):
    """Filtr ro'yxati uchun: qiymat, ko'rinadigan nom va signallar soni."""

    value: str
    label: str
    count: int


class EventSummaryOut(CamelModel):
    """Hodisalar jurnalining tepa qatori va filtrlari — bitta so'rovda.
    Ilgari sahifa sonlarni olish uchun har ro'yxat o'zgarganda uchta to'liq
    /api/events so'rovi yuborardi."""

    total: int
    unreviewed: int
    confirmed: int
    rejected: int
    unreviewed_high: int
    unreviewed_medium: int
    unreviewed_low: int
    today: int
    today_serious: int
    stale_serious_unreviewed: int
    oldest_unreviewed_hours: float | None = None
    # Oxirgi 30 kun: signal kelgandan operator qaroriga qadar o'rtacha vaqt.
    avg_review_minutes: float | None = None
    # Oxirgi 30 kun: tasdiqlangan / ko'rib chiqilgan (kamida 10 ta bo'lsa).
    # Nomida raqam yo'q: camelCase generatori "precision_30d" ni kutilgan
    # "precision30d" ga aylantirmaydi.
    recent_precision: float | None = None
    modules: list[EventFacetOut] = []
    # Sinov rejimidagi, hali baholanmagan signallar — "Sinov namunalari" uchun.
    trial_unreviewed: int = 0
    trial_modules: list[EventFacetOut] = []
    buildings: list[EventFacetOut] = []
