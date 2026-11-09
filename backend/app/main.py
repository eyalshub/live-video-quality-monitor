"""App factory. Run with: uvicorn app.main:create_app --factory"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.sessions import router as sessions_router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.request_guard import RequestGuardMiddleware
from app.core.request_id import REQUEST_ID_HEADER, RequestIdMiddleware
from app.db.session import create_db_engine, create_session_factory

# Body size limit, derived from MAX_SAMPLES_PER_BATCH rather than a separate setting. A sample is
# ~120 bytes of JSON; 1 KiB each leaves room for pretty-printing without allowing abuse.
MAX_BYTES_PER_SAMPLE = 1024
MAX_ENVELOPE_BYTES = 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    engine = create_db_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(
        title="Live Video Quality Monitor API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    register_error_handlers(app)

    # Middleware added first is innermost. Order, outside in: RequestId -> CORS -> RequestGuard,
    # so the guard's 411/413/500 responses carry both CORS headers and X-Request-ID.
    app.add_middleware(
        RequestGuardMiddleware,
        max_body_bytes=settings.max_samples_per_batch * MAX_BYTES_PER_SAMPLE + MAX_ENVELOPE_BYTES,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
    # Added last = outermost: every response (CORS preflight and errors too) gets a request id.
    app.add_middleware(RequestIdMiddleware)

    app.include_router(health_router)
    app.include_router(sessions_router)
    return app
