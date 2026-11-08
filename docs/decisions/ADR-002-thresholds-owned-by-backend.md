# ADR-002 — Thresholds are owned by the backend

- **Status:** Accepted (2026-11-08)

## Context
The verdict is computed live in the browser, but the backend must store trustworthy data and
history must stay correct even if thresholds change later. Two copies of the thresholds (frontend
env and backend env) would drift.

## Decision
- Thresholds (`THRESHOLD_FPS_MIN`, `THRESHOLD_BRIGHTNESS_MIN`, `THRESHOLD_BRIGHTNESS_MAX`,
  `THRESHOLD_MOTION_MAX`) exist **only** in backend configuration. They are **required**: there are
  no defaults in code, and a missing value is a startup error. Values live in
  `backend/.env.example` and in the CI workflow.
- `POST /sessions` returns the thresholds; the browser uses them for the live verdict.
- They are **snapshotted** onto the session row (`fps_min`, `brightness_min`, `brightness_max`,
  `motion_max`).
- The backend re-checks each sample: verdict/reason must equal the verdict rule applied to the
  sample's values and the session's snapshot. Mismatch → 422 `inconsistent_verdict`.

## Consequences
- Changing a threshold affects only new sessions; history is stable.
- The verdict rule exists in two languages (TS and Python) and must stay identical. Both sides get
  table-driven tests over the same cases.
