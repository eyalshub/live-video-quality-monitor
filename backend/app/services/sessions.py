"""Session lifecycle: create, load, ingest samples, stop, summarize."""

import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import Row, case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.db.models import MonitoringSession, Sample
from app.schemas.sessions import (
    IngestResult,
    SampleIn,
    SampleOut,
    SessionDetail,
    SessionOut,
    Summary,
)
from app.schemas.sessions import Thresholds as ThresholdsOut
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
    """The session's threshold snapshot, for the verdict rule."""
    return Thresholds(
        fps_min=session.fps_min,
        brightness_min=session.brightness_min,
        brightness_max=session.brightness_max,
        motion_max=session.motion_max,
    )


def thresholds_out(session: MonitoringSession) -> ThresholdsOut:
    """The session's threshold snapshot, for API responses (same fields, read from the row)."""
    return ThresholdsOut.model_validate(session, from_attributes=True)


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


def stop_session(
    db: Session, session_id: uuid.UUID, samples: Sequence[SampleIn], max_batch: int
) -> tuple[MonitoringSession, IngestResult]:
    """Save the final samples and end the session in one transaction (ADR-004).

    Stopping an ended session keeps its original ended_at; its samples follow ADR-010.
    """
    session = lock_session(db, session_id)
    result = ingest_samples(db, session, samples, max_batch)
    if session.ended_at is None:
        session.ended_at = max(datetime.now(UTC), session.started_at)
    db.commit()
    return session, result


# --- summary (computed at read time, never stored) -----------------------------------------

_SUMMARY_COLUMNS = (
    func.count(Sample.t).label("sample_count"),
    # t is a 0-based second index: samples t=0..59 cover 60 seconds.
    (func.max(Sample.t) + 1).label("duration_s"),
    func.avg(Sample.fps).label("avg_fps"),
    func.avg(case((Sample.face, 100.0), else_=0.0)).label("face_pct"),
    func.avg(case((Sample.verdict == "good", 100.0), else_=0.0)).label("good_pct"),
)


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 1)


def _summary(row: Row[tuple[int, int | None, float | None, float | None, float | None]]) -> Summary:
    count = row.sample_count or 0
    if count == 0:
        return Summary(duration_s=None, avg_fps=None, face_pct=None, good_pct=None, sample_count=0)
    return Summary(
        duration_s=row.duration_s,
        avg_fps=_round(row.avg_fps),
        face_pct=_round(row.face_pct),
        good_pct=_round(row.good_pct),
        sample_count=count,
    )


def summary_of(db: Session, session_id: uuid.UUID) -> Summary:
    row = db.execute(select(*_SUMMARY_COLUMNS).where(Sample.session_id == session_id)).one()
    return _summary(row)


def to_session_out(session: MonitoringSession, summary: Summary) -> SessionOut:
    return SessionOut(
        id=session.id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        thresholds=thresholds_out(session),
        summary=summary,
    )


def list_sessions(db: Session) -> list[SessionOut]:
    """All sessions, newest first, each with its summary, in one query."""
    stats = select(Sample.session_id, *_SUMMARY_COLUMNS).group_by(Sample.session_id).subquery()
    query = (
        select(
            MonitoringSession,
            stats.c.sample_count,
            stats.c.duration_s,
            stats.c.avg_fps,
            stats.c.face_pct,
            stats.c.good_pct,
        )
        .outerjoin(stats, stats.c.session_id == MonitoringSession.id)
        .order_by(MonitoringSession.started_at.desc(), MonitoringSession.id.desc())
    )
    return [to_session_out(row[0], _summary(row)) for row in db.execute(query).all()]


def session_detail(db: Session, session_id: uuid.UUID) -> SessionDetail:
    session = get_session(db, session_id)
    samples = db.scalars(
        select(Sample).where(Sample.session_id == session_id).order_by(Sample.t)
    ).all()
    out = to_session_out(session, summary_of(db, session_id))
    return SessionDetail(
        **out.model_dump(),
        samples=[SampleOut.model_validate(sample, from_attributes=True) for sample in samples],
    )
