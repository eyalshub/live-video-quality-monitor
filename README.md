# Live Video Quality Monitor

A web app that opens your webcam, analyzes every frame **in the browser**, and shows live video
quality metrics (FPS, brightness, motion, face present), a per-second **Good / Poor** verdict with
its reason, and a 30-second live chart. Each session's per-second samples are stored by a Python
backend in Postgres. Video never leaves the browser; only numbers are sent.

- **Live app:** TODO (Phase 4)
- **Status:** Phase 0 (foundation) done. See [`docs/progress.md`](docs/progress.md).

---

## Run locally

Prerequisites: Docker Desktop, [uv](https://docs.astral.sh/uv/), Node 24.

```bash
# 1. Database (Postgres 16 + a separate test database)
docker compose up -d

# 2. Backend → http://localhost:8000  (API docs at /docs)
cd backend
cp .env.example .env
uv sync
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:create_app --factory --reload --port 8000

# 3. Frontend → http://localhost:5173  (in a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173 in Chrome. The page shows `backend: ok, db: ok`.

Checks:

```bash
cd backend  && uv run ruff check . && uv run mypy && uv run python -m pytest -q
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

## Stack and free services

| Part | Technology | Hosting (free tier, no credit card) |
|---|---|---|
| Frontend | React + Vite + TypeScript | Vercel. TODO (Phase 1.5 / 4) |
| Backend | Python, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 | Render. TODO (Phase 1.5 / 4) |
| Database | Postgres 16 | Neon. TODO (Phase 1.5 / 4) |
| Face detection | TODO (Phase 2): in-browser detector, detection only | runs in the browser |

Why these choices: [`docs/decisions/`](docs/decisions/).

## Thresholds used

Configured in the backend environment only ([ADR-002](docs/decisions/ADR-002-thresholds-owned-by-backend.md)),
returned to the browser when a session starts, and stored with each session.

| Metric | Poor when | Reason shown |
|---|---|---|
| Face | no face in any frame of that second | No face |
| Brightness | < 60 / > 200 (mean luma, 0–255) | Too dark / Too bright |
| Motion | > 20 (mean abs. luma change between frames, 0–255) | Hold still |
| FPS | < 15 (frames actually processed in that second) | Low FPS |

When several fail, the first in this order is reported: no face → too dark / too bright → hold
still → low FPS. Values are rounded to 1 decimal before judging, so browser and server always agree
([ADR-003](docs/decisions/ADR-003-verdict-on-rounded-values.md)).

## Architecture

```
Browser (camera → canvas → per-frame metrics → 1 sample/second → verdict → chart + outbox)
   │  JSON over HTTPS, numbers only, batched every ~1.5 s, retried on failure
   ▼
FastAPI (validation, verdict check, INSERT … ON CONFLICT (session_id, t) DO NOTHING, summary in SQL)
   │
   ▼
Postgres (sessions, samples)
```

Details: [`docs/architecture.md`](docs/architecture.md), [`docs/api-contract.md`](docs/api-contract.md),
[`docs/data-model.md`](docs/data-model.md).

## Edge-case choices

Full list: [`docs/edge-cases.md`](docs/edge-cases.md). The main ones:

- **No duplicates, nothing lost:** `(session_id, t)` is the primary key and inserts use
  `ON CONFLICT DO NOTHING`, so a resent sample is counted as a duplicate, never stored twice.
  Unsent samples stay in the browser's outbox and go out with the next batch.
- **Stop twice:** the second call returns 200 with the same `ended_at`
  ([ADR-004](docs/decisions/ADR-004-stop-carries-final-samples.md)).
- **Samples after Stop:** Stop carries the browser's remaining samples in the same request.
  A late retry of samples that are already stored → 200 (duplicates). A brand-new sample for an
  ended session → 409 `session_ended`, so an ended session never changes
  ([ADR-005](docs/decisions/ADR-005-samples-after-stop.md)).
- **Honest numbers:** a second with no processed frames produces no sample. Motion that cannot be
  measured is `null`, never `0` ([ADR-009](docs/decisions/ADR-009-nullable-motion.md)).
- TODO (Phase 2-3): camera denied / not found / busy, tab hidden, tab closed without Stop.

## Cold start

TODO (Phase 1.5): the free backend sleeps when idle, so the first request after a pause can take up
to about a minute. The page shows "waking up the backend…" and waits up to `VITE_API_TIMEOUT_MS`.

## Not finished

TODO (Phase 6): list anything not completed. Current state: Phase 0 only. No camera, metrics,
sessions API, chart or history yet. See [`docs/progress.md`](docs/progress.md).
