"""Initial schema: sessions and samples.

Revision ID: 0001
Revises:
Create Date: 2026-11-08

Literal values are frozen here on purpose: a migration must not change when app code changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fps_min", sa.Double(), nullable=False),
        sa.Column("brightness_min", sa.Double(), nullable=False),
        sa.Column("brightness_max", sa.Double(), nullable=False),
        sa.Column("motion_max", sa.Double(), nullable=False),
        sa.CheckConstraint("ended_at >= started_at", name=op.f("ck_sessions_ended_after_started")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )
    op.create_index("ix_sessions_started_at", "sessions", [sa.literal_column("started_at DESC")])

    op.create_table(
        "samples",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("t", sa.Integer(), nullable=False),
        sa.Column("fps", sa.Double(), nullable=False),
        sa.Column("brightness", sa.Double(), nullable=False),
        sa.Column("motion", sa.Double(), nullable=True),
        sa.Column("face", sa.Boolean(), nullable=False),
        sa.Column("verdict", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("t >= 0", name=op.f("ck_samples_t_non_negative")),
        sa.CheckConstraint("fps >= 0 AND fps <= 120", name=op.f("ck_samples_fps_range")),
        sa.CheckConstraint(
            "brightness >= 0 AND brightness <= 255", name=op.f("ck_samples_brightness_range")
        ),
        sa.CheckConstraint("motion >= 0 AND motion <= 255", name=op.f("ck_samples_motion_range")),
        sa.CheckConstraint("verdict IN ('good', 'poor')", name=op.f("ck_samples_verdict_valid")),
        sa.CheckConstraint(
            "reason IN ('no_face', 'too_dark', 'too_bright', 'hold_still', 'low_fps')",
            name=op.f("ck_samples_reason_valid"),
        ),
        sa.CheckConstraint(
            "(verdict = 'good' AND reason IS NULL) OR (verdict = 'poor' AND reason IS NOT NULL)",
            name=op.f("ck_samples_verdict_reason_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            name=op.f("fk_samples_session_id_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id", "t", name=op.f("pk_samples")),
    )


def downgrade() -> None:
    op.drop_table("samples")
    op.drop_index("ix_sessions_started_at", table_name="sessions")
    op.drop_table("sessions")
