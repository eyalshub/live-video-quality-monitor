import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ErrorResponse
from app.db.models import MonitoringSession
from app.db.session import get_db
from app.schemas.sessions import (
    IngestResult,
    SamplesBatch,
    SessionCreated,
    SessionDetail,
    SessionOut,
    StopRequest,
    StopResponse,
    Thresholds,
)
from app.services import sessions as service

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)

DbSession = Annotated[Session, Depends(get_db)]

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "Unknown session (not_found)"}
}
INVALID: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "Invalid request: validation_error, inconsistent_verdict, batch_too_large",
    }
}


def get_settings_from_app(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


AppSettings = Annotated[Settings, Depends(get_settings_from_app)]


def thresholds_out(session: MonitoringSession) -> Thresholds:
    return Thresholds(
        fps_min=session.fps_min,
        brightness_min=session.brightness_min,
        brightness_max=session.brightness_max,
        motion_max=session.motion_max,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SessionCreated)
def create_session(db: DbSession, settings: AppSettings) -> SessionCreated:
    """Start a session. Returns the thresholds the browser must use for the live verdict."""
    session = service.create_session(db, settings)
    return SessionCreated(
        id=session.id, started_at=session.started_at, thresholds=thresholds_out(session)
    )


@router.post(
    "/{session_id}/samples",
    response_model=IngestResult,
    responses={**NOT_FOUND, **INVALID},
)
def add_samples(
    session_id: uuid.UUID, batch: SamplesBatch, db: DbSession, settings: AppSettings
) -> IngestResult:
    """Store a batch idempotently. Resent samples count as `duplicates`. After Stop nothing is
    written and new samples count as `ignored_after_stop` (ADR-010)."""
    session = service.lock_session(db, session_id)
    result = service.ingest_samples(db, session, batch.samples, settings.max_samples_per_batch)
    db.commit()
    logger.info("samples ingested", extra={"session_id": str(session_id), **result.model_dump()})
    return result


@router.post(
    "/{session_id}/stop",
    response_model=StopResponse,
    responses={**NOT_FOUND, **INVALID},
)
def stop_session(
    session_id: uuid.UUID,
    db: DbSession,
    settings: AppSettings,
    body: Annotated[StopRequest | None, Body()] = None,
) -> StopResponse:
    """End the session, saving any final samples in the same transaction (ADR-004).
    Calling it again returns the same ended_at."""
    samples = body.samples if body else []
    session, result = service.stop_session(db, session_id, samples, settings.max_samples_per_batch)
    logger.info("session stopped", extra={"session_id": str(session_id), **result.model_dump()})
    return StopResponse(
        session=service.to_session_out(session, service.summary_of(db, session_id)),
        ingest=result,
    )


@router.get("", response_model=list[SessionOut])
def list_sessions(db: DbSession) -> list[SessionOut]:
    """All sessions, newest first, each with its summary."""
    return service.list_sessions(db)


@router.get(
    "/{session_id}",
    response_model=SessionDetail,
    responses={**NOT_FOUND, **INVALID},
)
def get_session(session_id: uuid.UUID, db: DbSession) -> SessionDetail:
    """One session with all its samples (ordered by t) and its summary."""
    return service.session_detail(db, session_id)
