# backend/AGENTS.md

## Responsibility
The HTTP API that creates sessions, stores per-second samples **idempotently**, validates them,
and computes session summaries. It never receives or stores video, only numbers.

## Folder map
| Path | What |
|---|---|
| `app/main.py` | `create_app(settings)` factory: middleware (outside in: request id → CORS → guard), error handlers, routers |
| `app/core/config.py` | `Settings` (pydantic-settings). All required except `LOG_LEVEL` |
| `app/core/errors.py` | Uniform error body, `AppError(status, code, message, details)` |
| `app/core/request_id.py` | `X-Request-ID`, one JSON log line per request (outermost) |
| `app/core/request_guard.py` | Body size limit (411/413) and 500 safety net, inside CORS so errors stay readable cross-origin |
| `app/core/logging.py` | JSON log formatter |
| `app/db/models.py` | `MonitoringSession`, `Sample` (schema documented in `docs/data-model.md`) |
| `app/db/session.py` | Engine, session factory, `get_db` dependency |
| `app/api/` | Routers: `health.py`, `sessions.py` |
| `app/schemas/` | Pydantic request/response models (they drive OpenAPI → frontend types) |
| `app/services/` | `verdict.py` (the rule), `sessions.py` (lifecycle, ingest, summary) |
| `migrations/` | Alembic. One migration per schema change; never edit an applied one |
| `tests/` | pytest. DB tests run against `TEST_DATABASE_URL` |
| `tools/calibrate.py` | Read-only threshold calibration report from labelled sessions (ADR-014) |

## Commands (run inside `backend/`)
```bash
cp .env.example .env              # once; Postgres from the root docker-compose.yml
uv sync
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:create_app --factory --reload --port 8000
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run python -m pytest -q
uv run python -m alembic revision --autogenerate -m "..."   # then review the file by hand
uv run python -m alembic check                              # models == migrations?
```
`python -m <tool>` is used instead of the `.exe` shims because Windows Application Control may
block them; it works the same everywhere.

## Conventions
- Sync SQLAlchemy 2.x style (`select()`, `Mapped[...]`). One DB session per request via `get_db`.
- Errors: raise `AppError` with a stable snake_case `code`. Never return a bare `HTTPException` detail.
- Every new setting goes into `Settings` **and** `.env.example` **and** the CI workflow env. No defaults in code.
- Pydantic models describe every response (`response_model`), so the OpenAPI schema stays complete.
- Tests: no mocks for the database. Use the `db` fixture (rolled-back transaction) or the `client`.

## Invariants this part must protect
1. **Idempotency:** `(session_id, t)` is the primary key; inserts use `ON CONFLICT DO NOTHING`.
   A resent sample is a duplicate, never an error and never a second row.
2. **Validation:** ranges (fps 0–120, brightness/motion 0–255), enums, and verdict/reason
   consistency with the session's threshold snapshot (ADR-002, ADR-003). Invalid → 4xx.
3. **Uniform errors:** every error body is `{"error": {"code", "message", "details"}}`.
4. **Summary is computed server-side** at read time with SQL aggregates; never stored, never
   trusted from the client. Empty session → `null` averages.
5. **Ended sessions are immutable** (ADR-004, ADR-010): late samples are counted, never written.
