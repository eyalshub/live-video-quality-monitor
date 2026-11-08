# Progress

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| **P0** Foundation | Repo, docs, ADRs, backend skeleton (config, errors, logging, health), data model + migration, frontend skeleton (config, health page), CI | ✅ done (2026-11-08) |
| **P1** Sessions API + tests | `POST /sessions`, samples, stop, list, detail; verdict consistency; summary SQL; idempotency & edge-case tests | ✅ done (2026-11-08) |
| **P1.5** Early smoke deploy | Render (backend) + Neon (DB, Postgres 16) + Vercel (frontend); prove HTTPS, CORS, cold start | ⏳ |
| **P2** Capture & metrics | Camera, frame loop, luma/motion/verdict pure functions + tests, face detector, per-second aggregator | ⏳ |
| **P3** Live UI | Live metrics, verdict, 30 s chart, outbox, Start/Stop, `pagehide` flush, error states | ⏳ |
| **P4** Full deploy | Production config on all three services, end-to-end check in Chrome | ⏳ |
| **P5** History (bonus) | Session list, details chart, summary, empty states | ⏳ |
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
- The session row lock (`SELECT … FOR UPDATE`) that serializes ingest and Stop is covered by the
  behavior tests, but there is no concurrent (multi-thread) race test yet.
- CI has not run yet: waiting for the GitHub repository URL.

## Next step — P1.5 (early smoke deploy)
Blocked on accounts. Needs: the GitHub repo (user is creating it) and free accounts on Neon, Render
and Vercel. Nothing is signed up or pushed without the user's go-ahead.
1. Push; confirm CI is green on GitHub.
2. Neon project on Postgres 16 → `DATABASE_URL`; run `alembic upgrade head` against it.
3. Render web service from `backend/` (start: `uvicorn app.main:create_app --factory --host 0.0.0.0
   --port $PORT`; env from `backend/.env.example`).
4. Vercel project from `frontend/` with `VITE_*` env; add the Vercel URL to `CORS_ORIGINS`.
5. Prove: HTTPS page shows `backend: ok, db: ok`; measure cold-start time; note it in the README.
