from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ErrorResponse
from app.db.models import MonitoringSession
from app.db.session import get_db
from app.schemas.sessions import SessionCreated, Thresholds
from app.services import sessions as service

router = APIRouter(prefix="/sessions", tags=["sessions"])

DbSession = Annotated[Session, Depends(get_db)]

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "Unknown session"}
}
INVALID: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "Invalid request (validation_error, ...)"}
}


def get_settings_from_app(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


AppSettings = Annotated[Settings, Depends(get_settings_from_app)]


def thresholds_of(session: MonitoringSession) -> Thresholds:
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
        id=session.id, started_at=session.started_at, thresholds=thresholds_of(session)
    )
