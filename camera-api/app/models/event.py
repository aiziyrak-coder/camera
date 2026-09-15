import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, false, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Event(Base):
    """Matches src/types/index.ts `AIEvent`. camera_name/building are
    denormalized snapshots taken at detection time — an event must stay
    readable even if the camera it came from is later deleted."""

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("severity IN ('past', 'o''rta', 'yuqori')", name="ck_events_severity"),
        CheckConstraint("status IN ('yangi', 'tasdiqlangan', 'rad_etilgan')", name="ck_events_status"),
        # Every AI sweep's _recently_flagged() dedup query:
        # WHERE camera_id = ? AND module_code = ? AND occurred_at >= ?
        Index("ix_events_camera_module_occurred", "camera_id", "module_code", "occurred_at"),
        # Hodisalar jurnali filtrlari va hisobot agregatlari (e6f7a8b9c0d1).
        Index("ix_events_status_occurred", "status", "occurred_at"),
        Index("ix_events_severity_occurred", "severity", "occurred_at"),
        Index("ix_events_module_occurred", "module_code", "occurred_at"),
        # Operator ko'rinishlari faqat ishchi signallarni oladi (h1b2c3d4e5f6).
        Index("ix_events_trial_occurred", "is_trial", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    camera_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True
    )
    camera_name: Mapped[str] = mapped_column(String, nullable=False)
    building: Mapped[str] = mapped_column(String, nullable=False)
    module_code: Mapped[int] = mapped_column(Integer, nullable=False)
    module_name: Mapped[str] = mapped_column(String, nullable=False)
    group: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="yangi")
    person_name: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    # Operator qaror qilgan payt — "o'rtacha ko'rib chiqish vaqti" uchun
    # (f7a8b9c0d1e2). Eski ko'rib chiqilgan hodisalarda NULL.
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # S3/MinIO object key for the frame that triggered this event (see
    # app/services/event_bus.py) — null for events raised without a frame
    # on hand (e.g. POST /api/events' generic path) or where the upload
    # itself failed; a human reviewing "Hodisalar jurnali" should see what
    # the AI actually saw, not a live feed of whatever's on camera now.
    snapshot_key: Mapped[str | None] = mapped_column(String, nullable=True)
    # Sinov rejimidagi modul signali (app/services/event_bus.py). Operator
    # navbati, ogohlantirishlar va hisobotlar faqat is_trial = false ni ko'radi.
    is_trial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # Dalil: sabab matni va o'lchangan qiymatlar — "Nega signal?" bloki uchun.
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
