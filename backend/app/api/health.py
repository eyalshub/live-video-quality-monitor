import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Database unreachable"}},
)
def health(response: Response, db: Annotated[Session, Depends(get_db)]) -> HealthResponse:
    """Liveness + database check. 503 is a status report, not the uniform error body."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.warning("health check: database unreachable", exc_info=True)
        response.status_code = 503
        return HealthResponse(status="degraded", db="error")
    return HealthResponse(status="ok", db="ok")
