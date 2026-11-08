# Progress

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| **P0** Foundation | Repo, docs, ADRs, backend skeleton (config, errors, logging, health), data model + migration, frontend skeleton (config, health page), CI | ✅ done (2026-11-08) |
| **P1** Sessions API + tests | `POST /sessions`, samples, stop, list, detail; verdict consistency; summary SQL; idempotency & edge-case tests | ✅ done (2026-11-08) |
| **P1.5** Early smoke deploy | Render (backend) + Neon (DB, Postgres 16) + Vercel (frontend); prove HTTPS, CORS, cold start | ✅ done (2026-11-08) |
| **P2** Capture & metrics | Camera, frame loop, luma/motion/verdict pure functions + tests, face detector, per-second aggregator | ✅ done (2026-11-08; real camera: 30 FPS with N = 1) |
| **P3** Live UI | Live metrics, verdict, 30 s chart, outbox, Start/Stop, `pagehide` flush, error states, per-metric cards | ✅ done (2026-11-08) |
| **P4** Full deploy | Production config on all three services, end-to-end check in Chrome | ✅ done (2026-11-08): https://live-video-quality-monitor.vercel.app |
| **P5** History (bonus) | Session list, details chart, summary, empty states | ✅ done (2026-11-08) |
| **P6** Polish | README final, thresholds, edge-case choices, demo rehearsal | ⏳ |

## Not yet built
Camera, metrics, chart, outbox, history UI, deployment configs.

## Log
- 2026-11-08 — P0 done. Postgres in Docker, backend skeleton (config, uniform errors, request-id +
  JSON logs, CORS, `/health`), data model + migration `0001`, frontend skeleton (validated config,
  health page, generated API types), CI workflow, docs + ADR-001..009. Checks: backend 64 tests,
  frontend 18 tests, lint/type/format/build green. CI not yet run (no GitHub remote).
- 2026-11-08 — ADR-005 superseded by ADR-010 (samples after Stop → 200, `ignored_after_stop`).
- 2026-11-08 — P1 done. `POST /sessions`, `POST /sessions/{id}/samples`, `POST /sessions/{id}/stop`,
  `GET /sessions`, `GET /sessions/{id}`; verdict rule + `shared/verdict-cases.json` (read by pytest and
  Vitest); summary in SQL; `ErrorResponse` declared for 404/422; frontend types regenerated.
  Checks: backend 162 tests, frontend 20 tests, all lint/type/format/build green.

## Known notes
- Windows Application Control may block `.venv/Scripts/*.exe` shims → use `uv run python -m <tool>`.
- TypeScript pinned to 5.9 (ADR-001).
- CI has not run yet: waiting for the GitHub repository URL.

## Known debt
- No automated browser test in CI. A headless-Chrome smoke run (fake camera, CDP) passed locally
  on 2026-11-08: detector loads, samples saved, Stop releases the camera and returns a summary.
- No concurrent (multi-thread) race test for Stop vs. an in-flight samples request. The session row
  lock (`SELECT … FOR UPDATE`) serializes them; behavior before/after Stop is tested. Decided
  2026-11-08: the lock is enough for now.

## Next step
1. Owner sends camera calibration numbers → decide thresholds (backend env only, ADR-002).
2. P6: README final (live URLs, thresholds, edge-case choices, cold start, what is not finished),
   demo rehearsal.
