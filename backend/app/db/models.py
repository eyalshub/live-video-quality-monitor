"""ORM models. The schema itself is owned by Alembic migrations (see docs/data-model.md)."""

import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.services.verdict import Reason, Verdict

# Single source: the verdict rule's own types (app/services/verdict.py).
VERDICTS: tuple[str, ...] = get_args(Verdict)
REASONS: tuple[str, ...] = get_args(Reason)

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _sql_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class MonitoringSession(Base):
    """One Start→Stop run. Named to avoid confusion with the SQLAlchemy ORM `Session`."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Threshold snapshot at creation time (ADR-002).
    fps_min: Mapped[float] = mapped_column(Double)
    brightness_min: Mapped[float] = mapped_column(Double)
    brightness_max: Mapped[float] = mapped_column(Double)
    motion_max: Mapped[float] = mapped_column(Double)

    samples: Mapped[list["Sample"]] = relationship(
        back_populates="session",
        order_by="Sample.t",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (CheckConstraint("ended_at >= started_at", name="ended_after_started"),)


Index("ix_sessions_started_at", MonitoringSession.started_at.desc())


class Sample(Base):
    """One per-second aggregate. Primary key (session_id, t) makes storage idempotent."""

    __tablename__ = "samples"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    t: Mapped[int] = mapped_column(Integer, primary_key=True)
    fps: Mapped[float] = mapped_column(Double)
    brightness: Mapped[float] = mapped_column(Double)
    motion: Mapped[float | None] = mapped_column(Double)  # NULL = not measurable (ADR-009)
    face: Mapped[bool]
    verdict: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped[MonitoringSession] = relationship(back_populates="samples")

    __table_args__ = (
        CheckConstraint("t >= 0", name="t_non_negative"),
        CheckConstraint("fps >= 0 AND fps <= 120", name="fps_range"),
        CheckConstraint("brightness >= 0 AND brightness <= 255", name="brightness_range"),
        CheckConstraint("motion >= 0 AND motion <= 255", name="motion_range"),
        CheckConstraint(f"verdict IN ({_sql_list(VERDICTS)})", name="verdict_valid"),
        CheckConstraint(f"reason IN ({_sql_list(REASONS)})", name="reason_valid"),
        CheckConstraint(
            "(verdict = 'good' AND reason IS NULL) OR (verdict = 'poor' AND reason IS NOT NULL)",
            name="verdict_reason_consistent",
        ),
    )
