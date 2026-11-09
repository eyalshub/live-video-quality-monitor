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
| **P6** Polish | README final, thresholds, edge-case choices, demo rehearsal | 🚧 README done (2026-11-08); demo rehearsal left |

## Requirements status (audit 2026-11-09, against `docs/requirements.md`)
Every item is implemented. Open: demo rehearsal; the live URLs were not re-opened in this audit.
Gaps that are tests, not features: no unit test for `session/monitor.ts` (Start/Stop, `pagehide`)
or for the camera constraints in `openCamera`.

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
- 2026-11-08 — Deployed: Vercel + Render + Neon (P1.5/P4). Live screen (P2/P3) with per-metric
  cards; History (P5); chart layout fix; English dates.
- 2026-11-08 — Thresholds calibrated on a real webcam: brightness min 80, motion max 12 (ADR-012).
- 2026-11-08 — Extra insights panel, informational and client-only (ADR-013).
- 2026-11-08 — `d60f267` (explicit `VITE_FACE_MIN_CONFIDENCE`) reverted in `bb556c6`: Vercel's
  production build did not contain the new variable and the site showed "not configured". Re-apply
  with `git revert bb556c6` once the variable is in Vercel's Production build.
- 2026-11-08 — README final. Checks: backend 162 tests, frontend 188 tests, CI green.
- 2026-11-08 — Face confidence change re-applied (`9c8b354`) after the 5 variables were added in
  Vercel; the deployed bundle contains all 11 `VITE_*` values. Frontend 193 tests, CI green.
- 2026-11-09 — Calibration protocol (ADR-014) + `backend/tools/calibrate.py`: per-scenario p5/p50/p95,
  miss / false-alarm rate per threshold, balanced-error best threshold, face-detector error rates.
  Read-only, 7 new unit tests. Thresholds unchanged until labelled sessions are recorded.
- 2026-11-09 — Face false positives (ADR-015): detector reports scored candidates (floor 0.1, live
  decision unchanged), pure filters (score, geometry, size, temporal), `?debug` face-log download,
  `npm run face:eval` (ROC AUC, threshold sweep in seconds, filter comparison per scenario).
- 2026-11-09 — Fixed: leaving the live screen while `POST /sessions` is in flight now ends that
  session at once (first `monitor.ts` unit test).
- 2026-11-09 — Measured on a real webcam (11 sessions + 12 face logs, then 6 validation logs).
  Brightness min 80 confirmed; brightness max 200 unreachable on this camera; motion max 12 too
  high (one session, not changed yet). Face: stability filter live (5 runs, IoU 0.3, ADR-017):
  false faces 62 % → 18 % on the same validation frames; far faces (1.5–2 m) missed 5 % → 29 %.
  Geometry and size filters rejected. Results in README "Measurement and calibration".
- 2026-11-09 — Deployed `d1c5d75` after adding `VITE_FACE_STABLE_FRAMES=5` and
  `VITE_FACE_STABLE_IOU=0.3` in Vercel. Verified live: bundle contains both values, `/health` →
  `{"status":"ok","db":"ok"}`, body guard on Render answers 413 for a 3 MB body, app loads.
- 2026-11-09 — `VITE_API_TIMEOUT_MS` 70000 → 120000 (a 66 s Render wake-up was measured; 70 s left
  no margin). Vercel no longer accepts `VITE_*` as Secret, so it was re-created as Config; the
  redeployed bundle contains `120000`.

## Known notes
- Windows Application Control may block `.venv/Scripts/*.exe` shims → use `uv run python -m <tool>`.
- TypeScript pinned to 5.9 (ADR-001).
- `VITE_*` values are baked in at build time. A Vercel env change needs a new build (redeploy).
  Verify with the deployed bundle: it contains `` VITE_<NAME>:`<value>` ``.

## Known debt
- No automated browser test in CI. A headless-Chrome smoke run (fake camera, CDP) passed locally
  on 2026-11-08: detector loads, samples saved, Stop releases the camera and returns a summary.
- No concurrent (multi-thread) race test for Stop vs. an in-flight samples request. The session row
  lock (`SELECT … FOR UPDATE`) serializes them; behavior before/after Stop is tested. Decided
  2026-11-08: the lock is enough for now.
- Extra-insight limits (50 / 5 / 20 / 20) are first guesses; calibrate them on a real camera.

## Next step
1. Optional: record 2–3 more moving-head sessions (gentle and strong) to decide motion max.
2. Calibrate the extra-insight limits on a real camera (raw values are shown in the panel).
3. Demo rehearsal on the public URL (wake the backend first).
