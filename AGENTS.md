# AGENTS.md — Live Video Quality Monitor

## Purpose
A web app that opens the webcam, analyzes every frame **in the browser**, and shows live quality
metrics (FPS, brightness, motion, face present) with a per-second Good/Poor verdict and a 30 s chart.
A Python backend stores each session's per-second samples in Postgres; a History screen replays them.

## Iron rules (invariants — never break these)
1. **Video never leaves the browser.** Only numbers are sent to the backend.
2. **Real numbers only.** FPS = frames our code actually processed in that second. Never a fake,
   default or placeholder value. Missing data is `null` / "no data", never `0`.
3. **No hard-coded settings.** URLs, keys, thresholds, intervals come from environment variables,
   each documented in a `.env.example`.
4. **Free only.** No service that needs a credit card.
5. **Face = detection only**, not liveness. No anti-spoofing.
6. **Idempotent storage.** `(session_id, t)` is unique; a resent sample never creates a duplicate.

## Repo map
| Path | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy + Alembic API. See `backend/AGENTS.md`. |
| `frontend/` | React + Vite + TypeScript app. See `frontend/AGENTS.md`. |
| `shared/verdict-cases.json` | Verdict test cases read by both pytest and Vitest (one source). |
| `docs/requirements.md` | The task requirements as a checklist. |
| `docs/architecture.md` | Browser → API → DB, per-second sample flow. |
| `docs/api-contract.md` | Endpoints, payloads, error format. |
| `docs/data-model.md` | Tables, constraints, verdict rule, summary. |
| `docs/edge-cases.md` | Every edge case and the chosen behavior. |
| `docs/decisions/` | ADRs — why things are the way they are. |
| `docs/deploy.md` | Render + Vercel + Neon: env vars per service and exact steps. |
| `render.yaml` | Render Blueprint for the backend (free, Frankfurt). |
| `docs/progress.md` | Roadmap, status, next step. |
| `docker-compose.yml` | Local Postgres 16 (+ `vqm_test` DB for tests). |
| `.github/workflows/ci.yml` | Lint, type-check, migrate, test, build. |

## Run & test (from the repo root)
```bash
docker compose up -d                                   # Postgres on :5432

cd backend
cp .env.example .env                                   # once
uv sync
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:create_app --factory --reload --port 8000
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run python -m pytest -q

cd ../frontend
cp .env.example .env                                   # once
npm install
npm run dev                                            # http://localhost:5173
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
npm run gen:api                                        # regenerate API types (backend must be running)
```

## How to resume work
1. Read this file.
2. Read `docs/progress.md` — current phase, status and the next step.
3. Read the `AGENTS.md` of the part you are working on (`backend/` or `frontend/`).
4. Check `docs/decisions/` before changing anything an ADR covers. Changing a decision = new ADR.

## Working agreements
- Small steps; run the checks; small Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`).
- Never commit `.env` files or task material. Only `.env.example` with placeholder values.
- Code, docs, comments and commit messages are in English.
