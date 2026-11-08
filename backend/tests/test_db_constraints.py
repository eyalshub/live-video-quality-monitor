"""The database itself enforces idempotency and value ranges (iron rule 6, docs/data-model.md)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Connection, delete, func, insert, inspect, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from app.db.models import MonitoringSession, Sample

STARTED = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)


def _new_session(db: Connection, **overrides: Any) -> uuid.UUID:
    values: dict[str, Any] = {
        "id": uuid.uuid4(),
        "started_at": STARTED,
        "fps_min": 15,
        "brightness_min": 60,
        "brightness_max": 200,
        "motion_max": 20,
        **overrides,
    }
    db.execute(insert(MonitoringSession).values(**values))
    session_id: uuid.UUID = values["id"]
    return session_id


def _sample(session_id: uuid.UUID, t: int = 0, **overrides: Any) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "t": t,
        "fps": 29.6,
        "brightness": 132.4,
        "motion": 3.1,
        "face": True,
        "verdict": "good",
        "reason": None,
        **overrides,
    }


def _assert_rejected(db: Connection, statement: Any, constraint: str) -> None:
    """Run in a savepoint so the outer test transaction survives the failure."""
    with pytest.raises(IntegrityError) as exc_info, db.begin_nested():
        db.execute(statement)
    assert constraint in str(exc_info.value)


def _count(db: Connection, session_id: uuid.UUID) -> int:
    query = select(func.count()).select_from(Sample).where(Sample.session_id == session_id)
    return db.execute(query).scalar_one()


# --- idempotency -------------------------------------------------------------------------


def test_duplicate_session_and_t_is_rejected(db: Connection) -> None:
    session_id = _new_session(db)
    db.execute(insert(Sample).values(**_sample(session_id, t=5)))
    _assert_rejected(db, insert(Sample).values(**_sample(session_id, t=5)), "pk_samples")


def test_on_conflict_do_nothing_keeps_the_first_write(db: Connection) -> None:
    session_id = _new_session(db)
    upsert = (
        pg_insert(Sample)
        .on_conflict_do_nothing(index_elements=["session_id", "t"])
        .returning(Sample.t)
    )
    first = db.execute(upsert.values(**_sample(session_id, t=1, fps=30.0))).all()
    resent = db.execute(upsert.values(**_sample(session_id, t=1, fps=10.0))).all()

    assert len(first) == 1
    assert resent == []  # nothing inserted -> the API reports it as a duplicate (Phase 1)
    assert _count(db, session_id) == 1
    stored_fps = db.execute(select(Sample.fps).where(Sample.session_id == session_id)).scalar_one()
    assert stored_fps == 30.0


def test_same_t_in_other_session_is_independent(db: Connection) -> None:
    first, second = _new_session(db), _new_session(db)
    db.execute(insert(Sample), [_sample(first, t=0), _sample(second, t=0)])
    assert _count(db, first) == 1
    assert _count(db, second) == 1


# --- value constraints --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"t": -1}, "ck_samples_t_non_negative"),
        ({"fps": -0.1}, "ck_samples_fps_range"),
        ({"fps": 120.1}, "ck_samples_fps_range"),
        ({"fps": float("nan")}, "ck_samples_fps_range"),
        ({"brightness": -1}, "ck_samples_brightness_range"),
        ({"brightness": 255.1}, "ck_samples_brightness_range"),
        ({"motion": 256}, "ck_samples_motion_range"),
        ({"motion": float("inf")}, "ck_samples_motion_range"),
        # An unknown verdict also breaks verdict_reason_consistent; Postgres names only one.
        ({"verdict": "ok"}, "ck_samples_verdict_"),
        ({"verdict": "poor", "reason": "blurry"}, "ck_samples_reason_valid"),
        ({"verdict": "good", "reason": "too_dark"}, "ck_samples_verdict_reason_consistent"),
        ({"verdict": "poor", "reason": None}, "ck_samples_verdict_reason_consistent"),
    ],
)
def test_invalid_sample_is_rejected(
    db: Connection, overrides: dict[str, Any], constraint: str
) -> None:
    session_id = _new_session(db)
    _assert_rejected(db, insert(Sample).values(**_sample(session_id, **overrides)), constraint)


@pytest.mark.parametrize(
    "overrides",
    [
        {"fps": 0, "brightness": 0, "motion": 0},
        {"fps": 120, "brightness": 255, "motion": 255},
        {"motion": None},  # ADR-009: not measurable
        {"face": False, "verdict": "poor", "reason": "no_face"},
    ],
)
def test_boundary_and_null_values_are_accepted(db: Connection, overrides: dict[str, Any]) -> None:
    session_id = _new_session(db)
    db.execute(insert(Sample).values(**_sample(session_id, **overrides)))
    assert _count(db, session_id) == 1


@pytest.mark.parametrize("column", ["fps", "brightness", "face", "verdict"])
def test_required_sample_columns_are_not_null(db: Connection, column: str) -> None:
    session_id = _new_session(db)
    overrides: dict[str, Any] = {column: None}
    statement = insert(Sample).values(**_sample(session_id, **overrides))
    with pytest.raises(IntegrityError, match="not-null"), db.begin_nested():
        db.execute(statement)


def test_received_at_is_set_by_the_database(db: Connection) -> None:
    session_id = _new_session(db)
    db.execute(insert(Sample).values(**_sample(session_id)))
    received_at = db.execute(select(Sample.received_at)).scalar_one()
    assert received_at.tzinfo is not None


# --- sessions -----------------------------------------------------------------------------


def test_ended_before_started_is_rejected(db: Connection) -> None:
    statement = insert(MonitoringSession).values(
        id=uuid.uuid4(),
        started_at=STARTED,
        ended_at=STARTED - timedelta(seconds=1),
        fps_min=15,
        brightness_min=60,
        brightness_max=200,
        motion_max=20,
    )
    _assert_rejected(db, statement, "ck_sessions_ended_after_started")


def test_open_and_ended_sessions_are_accepted(db: Connection) -> None:
    _new_session(db, ended_at=None)
    _new_session(db, ended_at=STARTED)
    _new_session(db, ended_at=STARTED + timedelta(minutes=5))


def test_threshold_snapshot_is_required(db: Connection) -> None:
    with pytest.raises(IntegrityError, match="not-null"), db.begin_nested():
        _new_session(db, motion_max=None)


def test_sample_for_unknown_session_is_rejected(db: Connection) -> None:
    statement = insert(Sample).values(**_sample(uuid.uuid4()))
    _assert_rejected(db, statement, "fk_samples_session_id_sessions")


def test_deleting_a_session_cascades_to_its_samples(db: Connection) -> None:
    session_id = _new_session(db)
    db.execute(insert(Sample), [_sample(session_id, t=t) for t in range(3)])
    db.execute(delete(MonitoringSession).where(MonitoringSession.id == session_id))
    assert _count(db, session_id) == 0


def test_history_index_exists(db: Connection) -> None:
    indexes = {index["name"] for index in inspect(db).get_indexes("sessions")}
    assert "ix_sessions_started_at" in indexes
