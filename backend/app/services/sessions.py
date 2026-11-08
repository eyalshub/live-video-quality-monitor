"""Session lifecycle: create, load, ingest samples, stop, summarize."""

import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.db.models import MonitoringSession, Sample
from app.schemas.sessions import IngestResult, SampleIn
from app.services.verdict import Thresholds, evaluate

logger = logging.getLogger(__name__)


def create_session(db: Session, settings: Settings) -> MonitoringSession:
    """Create a session with a snapshot of the current thresholds (ADR-002)."""
    session = MonitoringSession(
        started_at=datetime.now(UTC),
        fps_min=settings.threshold_fps_min,
        brightness_min=settings.threshold_brightness_min,
        brightness_max=settings.threshold_brightness_max,
        motion_max=settings.threshold_motion_max,
    )
    db.add(session)
    db.commit()
    return session


def _not_found(session_id: uuid.UUID) -> AppError:
    return AppError(404, "not_found", "Session not found", {"session_id": str(session_id)})


def get_session(db: Session, session_id: uuid.UUID) -> MonitoringSession:
    session = db.get(MonitoringSession, session_id)
    if session is None:
        raise _not_found(session_id)
    return session


def lock_session(db: Session, session_id: uuid.UUID) -> MonitoringSession:
    """Load the session with a row lock so ingest and Stop never interleave (ADR-010)."""
    query = select(MonitoringSession).where(MonitoringSession.id == session_id).with_for_update()
    session = db.execute(query).scalar_one_or_none()
    if session is None:
        raise _not_found(session_id)
    return session


def thresholds_of(session: MonitoringSession) -> Thresholds:
    return Thresholds(
        fps_min=session.fps_min,
        brightness_min=session.brightness_min,
        brightness_max=session.brightness_max,
        motion_max=session.motion_max,
    )


def _check_verdicts(samples: Sequence[SampleIn], thresholds: Thresholds) -> None:
    """The client verdict must equal the rule applied to the same numbers (ADR-002, ADR-003)."""
    mismatches = []
    for sample in samples:
        verdict, reason = evaluate(
            fps=sample.fps,
            brightness=sample.brightness,
            motion=sample.motion,
            face=sample.face,
            thresholds=thresholds,
        )
        if (verdict, reason) != (sample.verdict, sample.reason):
            mismatches.append(
                {
                    "t": sample.t,
                    "expected": {"verdict": verdict, "reason": reason},
                    "received": {"verdict": sample.verdict, "reason": sample.reason},
                }
            )
    if mismatches:
        raise AppError(
            422,
            "inconsistent_verdict",
            "verdict/reason do not match the sample values and the session thresholds",
            mismatches,
        )


def ingest_samples(
    db: Session, session: MonitoringSession, samples: Sequence[SampleIn], max_batch: int
) -> IngestResult:
    """Validate and store a batch. All-or-nothing: one invalid sample rejects the whole batch.

    The caller must hold the session row lock (`lock_session`) and commit.
    """
    if len(samples) > max_batch:
        raise AppError(
            422,
            "batch_too_large",
            f"At most {max_batch} samples per request",
            {"max": max_batch, "received": len(samples)},
        )

    unique: dict[int, SampleIn] = {}
    for sample in samples:
        unique.setdefault(sample.t, sample)  # same t twice in one request -> first wins
    repeated_in_request = len(samples) - len(unique)

    _check_verdicts(list(unique.values()), thresholds_of(session))

    if not unique:
        return IngestResult(inserted=0, duplicates=repeated_in_request, ignored_after_stop=0)

    if session.ended_at is not None:
        # Ended sessions are immutable (ADR-010): count, never write.
        stored = db.scalars(
            select(Sample.t).where(Sample.session_id == session.id, Sample.t.in_(list(unique)))
        ).all()
        ignored = len(unique) - len(stored)
        if ignored:
            logger.warning(
                "samples ignored after stop",
                extra={"session_id": str(session.id), "ignored_after_stop": ignored},
            )
        return IngestResult(
            inserted=0,
            duplicates=repeated_in_request + len(stored),
            ignored_after_stop=ignored,
        )

    rows = [{"session_id": session.id, **sample.model_dump()} for sample in unique.values()]
    statement = (
        pg_insert(Sample)
        .values(rows)
        .on_conflict_do_nothing(index_elements=[Sample.session_id, Sample.t])
        .returning(Sample.t)
    )
    inserted = len(db.execute(statement).all())
    return IngestResult(
        inserted=inserted,
        duplicates=repeated_in_request + len(unique) - inserted,
        ignored_after_stop=0,
    )
