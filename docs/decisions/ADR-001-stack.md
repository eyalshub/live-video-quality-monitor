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

## Versions (installed at P0, 2026-11-08)
| Backend | Version | Frontend | Version |
|---|---|---|---|
| Python | 3.12 | Node | 24 |
| FastAPI | 0.162 | React | 19.3 |
| Starlette | 1.10 | Vite | 8.3 |
| SQLAlchemy | 2.1 | TypeScript | **5.9** (pinned, see below) |
| psycopg | 3.3 | ESLint / typescript-eslint | 10 / 8.72 |
| Alembic | 1.20 | Prettier | 3.9 |
| Pydantic / pydantic-settings | 2.14 / 2.16 | Vitest | 5.1 |
| pytest / ruff / mypy | 9.2 / 0.17 / 2.4 | openapi-typescript | 7.13 |

**TypeScript 5.9, not 7:** the Vite template now ships TypeScript 7 and oxlint. We keep ESLint
(decided above), and `typescript-eslint` supports TypeScript < 6.1 while `openapi-typescript`
requires 5.x. 5.9 is the newest version both accept without `--legacy-peer-deps`.
Revisit when both support a newer major.
