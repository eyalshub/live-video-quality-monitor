# Progress

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| **P0** Foundation | Repo, docs, ADRs, backend skeleton (config, errors, logging, health), data model + migration, frontend skeleton (config, health page), CI | ✅ done (2026-11-08) |
| **P1** Sessions API + tests | `POST /sessions`, samples, stop, list, detail; verdict consistency; summary SQL; idempotency & edge-case tests | ⏳ |
| **P1.5** Early smoke deploy | Render (backend) + Neon (DB, Postgres 16) + Vercel (frontend); prove HTTPS, CORS, cold start | ⏳ |
| **P2** Capture & metrics | Camera, frame loop, luma/motion/verdict pure functions + tests, face detector, per-second aggregator | ⏳ |
| **P3** Live UI | Live metrics, verdict, 30 s chart, outbox, Start/Stop, `pagehide` flush, error states | ⏳ |
| **P4** Full deploy | Production config on all three services, end-to-end check in Chrome | ⏳ |
| **P5** History (bonus) | Session list, details chart, summary, empty states | ⏳ |
| **P6** Polish | README final, thresholds, edge-case choices, demo rehearsal | ⏳ |

## Not in P0 (deliberately)
Sessions/samples endpoints, camera, metrics, chart, history, deployment configs.

## Log
- 2026-11-08 — P0 done. Postgres in Docker, backend skeleton (config, uniform errors, request-id +
  JSON logs, CORS, `/health`), data model + migration `0001`, frontend skeleton (validated config,
  health page, generated API types), CI workflow, docs + ADR-001..009. Checks: backend 64 tests,
  frontend 18 tests, lint/type/format/build green. CI not yet run (no GitHub remote).

## Known notes
- Windows Application Control may block `.venv/Scripts/*.exe` shims → use `uv run python -m <tool>`.
- TypeScript pinned to 5.9 (ADR-001).
- Error responses (404/409/422) are not yet declared in OpenAPI; add `responses=` with
  `ErrorResponse` on the P1 routes so the frontend gets typed errors.

## Next step — P1 (Sessions API)
1. `app/services/verdict.py`: the verdict rule (incl. `motion = null`), table-driven tests on the
   boundaries. The same case table will be reused by the TS tests in P2.
2. `POST /sessions` (threshold snapshot) + Pydantic `Sample` schema (ranges, 1-decimal check,
   enums) + `ErrorResponse` in OpenAPI.
3. `POST /sessions/{id}/samples`: batch limit, first-wins within the batch, `ON CONFLICT DO NOTHING
   RETURNING`, verdict consistency (422), ended-session rule (ADR-005).
4. `POST /sessions/{id}/stop` (ADR-004), `GET /sessions`, `GET /sessions/{id}` with the SQL summary.
5. Regenerate frontend types (`npm run gen:api`).
