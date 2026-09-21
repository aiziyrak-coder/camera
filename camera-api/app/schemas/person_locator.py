from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class PersonLocationSearchIn(CamelModel):
    query: str = Field(min_length=2, max_length=160)
    limit: int = Field(default=12, ge=1, le=30)


class PersonLocationOut(CamelModel):
    id: str
    full_name: str
    type: Literal["talaba", "xodim"]
    faculty: str | None = None
    group_or_position: str
    initials: str
    camera_id: str | None = None
    camera_name: str | None = None
    building: str | None = None
    floor: int | None = None
    zone: str | None = None
    last_seen_at: datetime | None = None
    currently_visible: bool = False
