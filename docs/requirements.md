# Requirements checklist

The assignment, restated in our own words as a checklist. `Phase` = where it is delivered
(see `progress.md`). Status is tracked in `progress.md`, not here.

## 1. Live screen
### Camera
- [ ] Camera permission is requested only when the user clicks **Start**. *(P3)*
- [ ] Request 640×480 from the front-facing camera. *(P2)*
- [ ] Denied permission or no camera → a clear on-screen message; never a crash or blank screen. *(P2/P3)*
- [ ] Camera preview visible on screen. *(P3)*

### Processing
- [ ] Every frame is drawn to a `<canvas>` and its pixels are read in the browser
      (`requestVideoFrameCallback`, fallback `requestAnimationFrame`). *(P2)*
- [ ] Frames may be downscaled (e.g. 160×120) before computing brightness and motion. *(P2)*
- [ ] Once per second, the frames of that second are combined (averaged) into one **sample**;
      that sample feeds the chart and is sent to the backend. *(P2)*

### Metrics (per second)
| Metric | Definition | Default warning |
|---|---|---|
| FPS | Number of frames our code actually processed in that second | < 15 → `low_fps` |
| Brightness | Mean luma `0.299R + 0.587G + 0.114B` over all pixels, 0–255 | < 60 → `too_dark`, > 200 → `too_bright` |
| Motion | Mean absolute luma difference vs. the previous frame, 0–255 | > 20 → `hold_still` |
| Face | At least one face detected (detection only, e.g. MediaPipe) | no face in **any** frame of the second → `no_face` |

- [ ] Thresholds are configurable; the values used are listed in the README. *(P0 config, P6 README)*
- [ ] Face is **detection only** — no liveness / anti-spoofing.

### Verdict
- [ ] One verdict per second: **Good** only if all four metrics are within limits, otherwise **Poor**. *(P2/P3)*
- [ ] Poor shows the cause, e.g. "Poor: too dark". *(P3)*
- [ ] Reason priority when several fail: no face → too dark / too bright → hold still → low FPS.

### Live chart
- [ ] Last 30 seconds, updated every second. *(P3)*
- [ ] FPS, brightness, motion as lines; face and verdict as colored strips (green OK / red not OK). *(P3)*

### Start / Stop
- [ ] Start creates a backend session, opens the camera and starts sending samples. *(P3; order per ADR-006)*
- [ ] Stop closes the camera, sends the last samples and ends the session. *(P3; ADR-004)*
- [ ] Closing the tab without Stop is acceptable; the session ends at its last sample. *(P3)*

## 2. Backend (Python)
### Endpoints (names may differ; behavior must match) *(P1)*
- [ ] `POST /sessions` — create; returns `id` and `started_at`.
- [ ] `POST /sessions/{id}/samples` — accept a list of samples and store them.
- [ ] `POST /sessions/{id}/stop` — end the session, store `ended_at`.
- [ ] `GET /sessions` — all sessions, newest first, each with its summary.
- [ ] `GET /sessions/{id}` — one session with all samples and its summary.

### Sample shape
`{ "t": 12, "fps": 29.6, "brightness": 132.4, "motion": 3.1, "face": true, "verdict": "good", "reason": null }`
- `t` = whole seconds since session start; `reason` = failing metric code or `null` when good.

### Summary (computed by the backend) *(P1)*
- [ ] Duration (s) = `t` of the last sample (works without Stop).
- [ ] Average FPS.
- [ ] % of seconds with a face.
- [ ] % of seconds with verdict Good.

### Behavior
- [ ] Samples are sent in small batches roughly every 1–2 s. *(P3)*
- [ ] Input validation → 4xx with a clear JSON error: missing fields, out of range
      (FPS 0–120, brightness/motion 0–255), unknown session. *(P0 format, P1 rules)*
- [ ] Failed sends are kept by the browser and resent with the next batch; nothing lost,
      nothing stored twice; `(session_id, t)` is unique. *(P0 schema, P1 API, P3 outbox)*
- [ ] Stop twice and samples after Stop handled without errors or duplicates; choice explained
      in the README. *(P1, ADR-004/005)*
- [ ] CORS allows only the frontend origin, from configuration. *(P0)*
- [ ] Real database (Postgres); data survives a backend restart. *(P0)*

## 3. History screen (bonus) *(P5)*
- [ ] Session list, newest first: date/time, duration, average FPS, % Good.
- [ ] Empty state: "No sessions yet".
- [ ] Row click → full-session chart (same style as live), summary (duration, avg FPS, % face, % Good), Back button.
- [ ] No login; everyone sees the same list.

## 4. Deploy *(P1.5 smoke, P4 full)*
- [ ] Frontend, backend and database on free tiers; no credit card, no paid plan.
- [ ] Choose services that stay up until the demo (avoid ones that pause or need a card).
- [ ] Public HTTPS URL that works in Chrome on a laptop (camera needs HTTPS).
- [ ] Cold start of a sleeping backend is acceptable; mentioned in the README.

## Rules
- [ ] Video never leaves the browser; only numbers are sent.
- [ ] Real numbers only: FPS measured from processed frames, "No face" when none, never fake values.
- [ ] No hard-coded settings; `.env.example` provided.
- [ ] Free only.

## Deliverables *(P6)*
- [ ] Public URL of the running app.
- [ ] Link to the GitHub repository.
- [ ] README: run locally, stack + free services, thresholds, architecture sketch, unfinished items.
- [ ] Demo: start a session, show metrics reacting (cover camera, change light, move head), stop, open in History.
