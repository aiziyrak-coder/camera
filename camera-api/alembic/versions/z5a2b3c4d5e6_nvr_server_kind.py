"""NVR manbasi turi "server" — serverning o'z MediaMTX yozuvi.

Revision ID: z5a2b3c4d5e6
Revises: z4a2b3c4d5e6
"""

from alembic import op

revision = "z5a2b3c4d5e6"
down_revision = "z4a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_nvr_devices_kind", "nvr_devices", type_="check")
    op.create_check_constraint("ck_nvr_devices_kind", "nvr_devices", "kind IN ('hikvision', 'fayl', 'server')")


def downgrade() -> None:
    op.execute("UPDATE cameras SET nvr_id = NULL, nvr_channel = NULL WHERE nvr_id IN (SELECT id FROM nvr_devices WHERE kind = 'server')")
    op.execute("DELETE FROM nvr_devices WHERE kind = 'server'")
    op.drop_constraint("ck_nvr_devices_kind", "nvr_devices", type_="check")
    op.create_check_constraint("ck_nvr_devices_kind", "nvr_devices", "kind IN ('hikvision', 'fayl')")
