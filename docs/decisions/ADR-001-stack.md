# ADR-001 — Stack

- **Status:** Accepted (2026-11-08)

## Context
The task requires a Python backend (FastAPI, Django or Flask) and leaves the frontend open. We want
fast iteration, typed contracts and tooling that a reviewer recognizes immediately.

## Decision
- **Backend:** FastAPI, SQLAlchemy 2.x (sync), psycopg 3, Alembic, Pydantic v2, pydantic-settings.
  Packaged with `uv` (lockfile `uv.lock`). Python 3.12.
- **Frontend:** React + Vite + TypeScript (`strict`). Node 24.
- **Tests:** pytest (backend), Vitest (frontend).
- **Quality gates:** ruff (lint + format), mypy (strict), ESLint, Prettier, `tsc --noEmit`.

Sync SQLAlchemy is enough: the load is a handful of requests per second per user, and sync code
is simpler to read, test and debug than async.

## Consequences
- Exact versions are pinned by `uv.lock` and `package-lock.json`. The versions installed at P0 are
  recorded below.
- One language per side; no shared runtime code — the contract is shared via OpenAPI (ADR-008).

## Versions (installed at P0)
_Filled in when the projects are scaffolded._
