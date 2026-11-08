# Progress

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| **P0** Foundation | Repo, docs, ADRs, backend skeleton (config, errors, logging, health), data model + migration, frontend skeleton (config, health page), CI | 🚧 in progress |
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
- 2026-11-08 — P0 started.

## Next step
Finish P0 (see the plan in the P0 commits).
