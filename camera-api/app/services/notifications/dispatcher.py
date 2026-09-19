"""Bildirishnoma dispatcher — interfeys (hozircha bo'sh amalga oshirish).

Imzolar o'zgarmaydi: ularni event_bus, camera_health, attendance_ai,
absence_marker, events router va access_control chaqiradi.
"""

import uuid
from datetime import date, datetime

from app.models import AttendanceRecord, Camera, Event, StudentStaff


async def notify_event(event: Event) -> None:
    """Yangi (sinov bo'lmagan) AI hodisasi — 'event' qoidalari bo'yicha."""


async def notify_event_overdue(event: Event) -> None:
    """Hal qilish muddati (due_at) o'tgan hodisa — 'event_overdue' qoidalari
    va tayinlangan foydalanuvchi."""


async def notify_camera_status(camera: Camera, *, online: bool, offline_since: datetime | None = None) -> None:
    """Kamera o'chdi ('camera_offline') yoki qayta tiklandi ('camera_online')."""


async def notify_attendance(record: AttendanceRecord, person: StudentStaff | None, camera: Camera | None) -> None:
    """Kunning birinchi qaydi — ota-onaga (parent_notify_enabled bo'lsa)."""


async def notify_absences(person_ids: list[uuid.UUID], day: date) -> None:
    """Kun oxirida 'kelmadi' deb belgilanganlar — ota-onaga."""


async def notify_access_denied(device_name: str, person_name: str | None, card_number: str | None, occurred_at: datetime) -> None:
    """Turniketda rad etilgan kirish — 'access_denied' qoidalari."""


async def notify_user(user_id: uuid.UUID | str, text: str, *, kind: str = "system", ref_id: str | None = None) -> None:
    """Bitta foydalanuvchiga (Telegram bog'langan bo'lsa, aks holda SMS)."""
