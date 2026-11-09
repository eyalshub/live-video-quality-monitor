# Architecture

## Components
```
┌──────────────────────────── Browser (Chrome, HTTPS) ─────────────────────────────┐
│ getUserMedia 640×480 ─► <video> ─► frame loop (rVFC / rAF)                       │
│                                    │ draw to 160×120 <canvas>, getImageData       │
│                                    ▼                                              │
│                         per-frame metrics (pure fns: luma, motion) + face detect  │
│                                    ▼                                              │
│                         per-second aggregator ─► sample {t, fps, brightness, ...} │
│                                    │ round to 1 decimal → verdict (ADR-003)        │
│                     ┌──────────────┴──────────────┐                               │
│                     ▼                             ▼                               │
│               live UI + 30 s chart           outbox (unsent samples)              │
│                                                   │ batch every ~1.5 s            │
└───────────────────────────────────────────────────┼──────────────────────────────┘
                                   JSON over HTTPS  │  (numbers only — no video)
                                                    ▼
┌──────────────────── FastAPI backend (Render free tier) ──────────────────────────┐
│ request-id/logging → CORS (configured origins) → body limit + 500 net → routers  │
│ validation (Pydantic) → verdict consistency check vs. session thresholds (ADR-002)│
│ INSERT ... ON CONFLICT (session_id, t) DO NOTHING      summary = SQL aggregate    │
└───────────────────────────────────────────────────┬──────────────────────────────┘
                                                    ▼
                         Postgres (Neon free tier in prod, Docker locally)
                         tables: sessions, samples   (see data-model.md)
```

## Per-second sample flow
1. **Start** — the browser opens the camera first (ADR-006). Only on success does it call
   `POST /sessions`, which returns `id`, `started_at` and the **threshold snapshot** (ADR-002).
2. **Every frame** — the frame is drawn to a small canvas; luma mean, motion vs. the previous frame
   and face presence are computed. Video data stays in memory in the tab.
3. **Every second** `t` — the frames of that second are combined: `fps` = number of processed frames,
   `brightness` / `motion` = means, `face` = any frame had a face. Values are rounded to 1 decimal,
   then the verdict is computed with the snapshot thresholds. A second with zero frames produces
   **no sample** (no invented data).
4. **Outbox** — the sample goes to the chart and to an in-memory outbox. Roughly every
   `VITE_SAMPLE_BATCH_INTERVAL_MS` the outbox is sent as one batch to `POST /sessions/{id}/samples`.
   On success, the acknowledged samples are removed; on failure they stay and ride with the next batch.
5. **Server** — validates each sample, re-checks verdict/reason against the session's thresholds,
   inserts with `ON CONFLICT DO NOTHING` (first write wins), and answers with inserted/duplicate counts.
6. **Stop** — the camera closes; the remaining outbox (including in-flight samples) is sent inside
   `POST /sessions/{id}/stop`, which saves them and sets `ended_at` in one transaction (ADR-004).
7. **Tab closed** — on `pagehide` the outbox is flushed with `fetch(..., {keepalive: true})`.
   If that fails, the session simply stays open; its duration runs to the last stored `t`.

## Configuration
- Backend: `backend/.env.example` (DB URL, CORS origins, thresholds, batch limit, log level).
- Frontend: `frontend/.env.example` (API base URL, batch interval, analysis size, timeout).
- Thresholds exist **only** in backend config; the frontend receives them per session.
