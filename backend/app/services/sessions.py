"""Session lifecycle: create, load, ingest samples, stop, summarize."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import MonitoringSession


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
