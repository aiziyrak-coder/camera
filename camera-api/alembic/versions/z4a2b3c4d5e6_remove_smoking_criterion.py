"""Chekish (15) kriteriyasi olib tashlandi (2026-10-26, buyurtmachi).

Modul qatori o'chiriladi (app/seed.py uni endi qo'shmaydi), eski chekish
hodisalari z3a2b3c4d5e6 dagi kabi `events_archive`/`event_comments_archive`
ga ko'chiriladi — hech qayerda ko'rinmaydi, lekin yo'qolmaydi.

Revision ID: z4a2b3c4d5e6
Revises: z3a2b3c4d5e6
"""

from alembic import op

revision = "z4a2b3c4d5e6"
down_revision = "z3a2b3c4d5e6"
branch_labels = None
depends_on = None

SMOKING_CODE = 15


def upgrade() -> None:
    op.execute(
        f"""INSERT INTO event_comments_archive
            SELECT c.* FROM event_comments c JOIN events e ON e.id = c.event_id
            WHERE e.module_code = {SMOKING_CODE}"""
    )
    op.execute(f"INSERT INTO events_archive SELECT e.*, now() FROM events e WHERE e.module_code = {SMOKING_CODE}")
    op.execute(f"DELETE FROM events WHERE module_code = {SMOKING_CODE}")
    op.execute(f"DELETE FROM ai_modules WHERE code = {SMOKING_CODE}")


def downgrade() -> None:
    op.execute(
        f"""DO $$
        DECLARE cols text;
        BEGIN
          SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
          FROM information_schema.columns WHERE table_name = 'events' AND table_schema = current_schema();
          EXECUTE format('INSERT INTO events (%s) SELECT %s FROM events_archive WHERE module_code = {SMOKING_CODE}
                          ON CONFLICT (id) DO NOTHING', cols, cols);
        END $$"""
    )
