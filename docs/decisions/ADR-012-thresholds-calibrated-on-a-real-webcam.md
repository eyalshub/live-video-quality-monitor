# ADR-012 — Thresholds calibrated against a real laptop webcam

- **Status:** Accepted (2026-11-08). Changes the values from the task's suggested starting point.

## Context
The task suggests brightness < 60 and motion > 20 as starting points and allows other values if
the README lists them. We measured on the public URL with a real laptop webcam in Chrome:

| Situation | Brightness | Motion | FPS |
|---|---|---|---|
| Normal room, sitting | 120–135 | 3–6 | 30 |
| Moving the head | — | ~16 | 30 |
| Dark room | ~79 (camera auto-gain lifts it) | — | ~9 (camera lengthens exposure) |

With the suggested values, "Too dark" (60) almost never triggered, because auto-gain keeps even a
dark room near 79. "Hold still" (20) almost never triggered, because normal head movement peaks
around 16.

## Decision
| Threshold | Before | Now |
|---|---|---|
| `THRESHOLD_FPS_MIN` | 15 | 15 (unchanged: the dark-room 9 FPS is a real problem and is caught) |
| `THRESHOLD_BRIGHTNESS_MIN` | 60 | **80** |
| `THRESHOLD_BRIGHTNESS_MAX` | 200 | 200 (unchanged) |
| `THRESHOLD_MOTION_MAX` | 20 | **12** (between sitting, 3–6, and moving, ~16) |

The values live in `render.yaml` (the Render Blueprint owns them; never edit them in the
dashboard), `backend/.env.example` and the CI workflow.

## Consequences
- Covering or dimming the camera now gives "Too dark", and a head movement gives "Hold still",
  so the demo shows every metric reacting.
- Sessions created before the change keep their snapshot thresholds (ADR-002); History judges them
  by the values they were recorded with.
- In low light, `low_fps` appears together with dark images. That is the camera slowing down,
  and it is reported honestly.
- One laptop is a small sample. The values are configuration, so they can be tuned again without
  a code change.
