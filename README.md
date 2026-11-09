# Live Video Quality Monitor

[![CI](https://github.com/eyalshub/live-video-quality-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/eyalshub/live-video-quality-monitor/actions/workflows/ci.yml)

A web app that checks webcam quality live. Every frame is analyzed **in the browser**; once per
second the app shows FPS, brightness, motion and face presence, a **Good / Poor** verdict with its
reason, and a 30-second chart. A Python backend stores each session's per-second numbers in
Postgres, and a History screen replays any session. **Video never leaves the browser.**

| | |
|---|---|
| **Live app** | https://live-video-quality-monitor.vercel.app (Chrome on a laptop) |
| **API** | https://vqm-backend.onrender.com ([`/health`](https://vqm-backend.onrender.com/health), [`/docs`](https://vqm-backend.onrender.com/docs)) |

> **Cold start:** the free backend sleeps after ~15 min idle and takes about a minute to wake
> (66 s measured). The app says so and waits up to 120 s. Open the app once before a demo.

![Live screen: verdict, four metric cards and extra insights](docs/img/live.webp)

![30-second chart: FPS, brightness and motion with their limits, then the Face and Verdict strips](docs/img/chart.png)

Under the chart, one cell per second: **Face** is the detector's answer; **Verdict** combines all
four rules, so it can be red while Face is green (above: the first second, FPS still below 15).

## How it works

```
Browser (Chrome, HTTPS)
  camera 640x480 → every frame → 160x120 canvas → brightness, motion, face (MediaPipe)
  → 1 sample per second → verdict → live UI + 30 s chart
  → outbox: batch every 1.5 s, kept and resent on failure
                         │  JSON, numbers only
                         ▼
FastAPI (Render): CORS → validation → verdict re-check → INSERT … ON CONFLICT DO NOTHING
                         ▼
Postgres (Neon): sessions (with a snapshot of the thresholds), samples (key: session_id + t)
```

API: `POST /sessions`, `POST /sessions/{id}/samples`, `POST /sessions/{id}/stop`, `GET /sessions`,
`GET /sessions/{id}`. Every error has one shape: `{"error": {"code", "message", "details"}}`.
Details in [`docs/api-contract.md`](docs/api-contract.md).

## Verdict rules

A second is **Good** only if all four rules pass. Thresholds belong to the backend (env vars) and
are saved with each session, so History stays correct if they change.

| Metric | Measured as | Poor when | Reason shown |
|---|---|---|---|
| Face | a face in any frame of the second, held still for 5 detector runs | no face | No face |
| Brightness | mean luma `0.299R + 0.587G + 0.114B`, 0–255 | < 80 or > 200 | Too dark / Too bright |
| Motion | mean absolute luma change vs. the previous frame, 0–255 | > 12 | Hold still |
| FPS | frames our code actually processed in that second | < 15 | Low FPS |

- When several rules fail, the reason is the first in the table's order. Each metric card still
  shows its own status.
- Values are rounded to 1 decimal before judging. The server re-checks every verdict, and both
  sides run the same test cases ([`shared/verdict-cases.json`](shared/verdict-cases.json)).
- The task suggested brightness < 60 and motion > 20. On a real webcam neither ever fired (auto-gain
  keeps a dark room near 79), so we use 80 and 12.

## Measurement

The thresholds and the face filter were chosen from **labelled recordings**, not by eye, and
validated on new recordings. Full method and data: [`docs/measurement.md`](docs/measurement.md).

| Question | Result | Decision |
|---|---|---|
| Brightness min 80 | Dark ≤ 56, normal ≥ 131: no errors | Kept |
| Motion max 12 | A moving head peaked at 8.7; ~3 would catch 89 % | Probably too high; one session is too little to change it |
| A waving hand detected as a face | 62 % of seconds → **18 %** with the "hold still" filter | Filter on ([ADR-017](docs/decisions/ADR-017-face-must-hold-still.md)) |
| Cost of the filter | Normal and dark faces: no change. Faces 1.5–2 m away: missed 5 % → 29 % | Accepted: the app targets a person at a laptop |

## Edge cases

| Case | Behavior |
|---|---|
| Network drop | Unsent samples wait in an outbox ("N samples pending") and are resent. `(session_id, t)` is unique, so a resend never duplicates. |
| Stop twice / samples after Stop | Always 200; an ended session never changes ([ADR-010](docs/decisions/ADR-010-samples-after-stop-200.md)). |
| Tab closed without Stop | Remaining samples are sent with `keepalive`; the session ends at its last sample. |
| Camera denied, missing or busy | A clear message. The camera opens before the session is created, so no empty sessions. |
| A second with no frames | No sample (a gap, never a 0). Motion that cannot be measured is `null`. |
| Duration | `max(t) + 1`, because `t` starts at 0 ([ADR-016](docs/decisions/ADR-016-duration-is-max-t-plus-one.md)). |

All cases: [`docs/edge-cases.md`](docs/edge-cases.md).

## Extra insights (beyond the task)

Sharpness, exposure clipping and face framing hints on the live screen. Informational only: computed
in the browser, never stored, never part of the verdict ([ADR-013](docs/decisions/ADR-013-extra-insights-client-only.md)).

## Stack

| Part | Technology | Hosting (free, no credit card) |
|---|---|---|
| Frontend | React 19, Vite, TypeScript (strict), own SVG chart | Vercel |
| Face detection | MediaPipe BlazeFace short range, in the browser (detection only) | served by the app |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 | Render |
| Database | Postgres 16 | Neon |

Neon rather than Render Postgres (expires) or Supabase (pauses when idle): the app must stay up
until the demo. Deployment steps: [`docs/deploy.md`](docs/deploy.md).

## Run locally

Requires Docker Desktop, [uv](https://docs.astral.sh/uv/) and Node 24.

```bash
docker compose up -d                       # Postgres 16 + a test database

cd backend && cp .env.example .env
uv sync && uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:create_app --factory --reload --port 8000

cd frontend && cp .env.example .env        # second terminal
npm install && npm run dev                 # http://localhost:5173
```

Checks (the same run in CI on every push):

```bash
cd backend && uv run ruff check . && uv run mypy && uv run python -m pytest -q    # 174 tests
cd frontend && npm run lint && npm run typecheck && npm test && npm run build       # 213 tests
```

## Limitations

- Calibrated with one laptop webcam, one person and one room.
- Motion max 12 is likely too high (see Measurement).
- Faces further than ~2 m are missed more often; a still hand can still pass as a face.
- No automated camera test in CI (a headless-Chrome run with a fake camera passed locally).
- Extra-insight limits are first guesses.
- No login, as the task specifies: everyone sees the same History.

## Documentation

[Architecture](docs/architecture.md) · [API contract](docs/api-contract.md) ·
[Data model](docs/data-model.md) · [Edge cases](docs/edge-cases.md) ·
[Measurement](docs/measurement.md) · [Decisions (ADRs)](docs/decisions/) ·
[Deploy](docs/deploy.md) · [Requirements](docs/requirements.md) · [Progress](docs/progress.md)
