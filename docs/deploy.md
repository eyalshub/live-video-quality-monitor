# Deploy

Three free services, no credit card: **Neon** (Postgres 16) → **Render** (FastAPI) → **Vercel**
(static React build). Both Render and Vercel deploy automatically on every push to `main`.

Order matters: the backend needs the database URL, the frontend needs the backend URL, and the
backend's CORS needs the frontend URL.

## Environment variables

### Backend (Render → service `vqm-backend` → Environment)
| Variable | Value | Where it is set |
|---|---|---|
| `DATABASE_URL` | Neon **direct** connection string (host without `-pooler`, `postgresql://…?sslmode=require`). The app switches it to psycopg 3 automatically. | Render dashboard only (`sync: false`). **Never in a file.** |
| `CORS_ORIGINS` | The Vercel production URL, e.g. `https://live-video-quality-monitor.vercel.app` (no trailing slash; comma-separate several) | Render dashboard (`sync: false`) |
| `THRESHOLD_FPS_MIN` | `15` | `render.yaml` |
| `THRESHOLD_BRIGHTNESS_MIN` | `80` (ADR-012) | `render.yaml` |
| `THRESHOLD_BRIGHTNESS_MAX` | `200` | `render.yaml` |
| `THRESHOLD_MOTION_MAX` | `12` (ADR-012) | `render.yaml` |
| `MAX_SAMPLES_PER_BATCH` | `120` | `render.yaml` |
| `LOG_LEVEL` | `INFO` | `render.yaml` |
| `PYTHON_VERSION` | `3.12.10` (Render's runtime selector) | `render.yaml` |

`TEST_DATABASE_URL` is only for the test suite and is **not** set on Render.

### Frontend (Vercel → project → Settings → Environment Variables, scope: Production)
| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | The Render URL, e.g. `https://vqm-backend.onrender.com` (no trailing slash) |
| `VITE_SAMPLE_BATCH_INTERVAL_MS` | `1500` |
| `VITE_ANALYSIS_WIDTH` | `160` |
| `VITE_ANALYSIS_HEIGHT` | `120` |
| `VITE_API_TIMEOUT_MS` | `70000` |
| `VITE_FACE_DETECT_EVERY_N_FRAMES` | `1` (see [ADR-011](decisions/ADR-011-face-detection-cadence.md)) |
| `VITE_SHARPNESS_MIN` | `50`: extra insight, informational. The four insight variables are optional as a group: none set → panel off; some set → error ([ADR-013](decisions/ADR-013-extra-insights-client-only.md)) |
| `VITE_CLIP_PCT_MAX` | `5`: extra insight, informational |
| `VITE_FACE_MIN_WIDTH_PCT` | `20`: extra insight, informational |
| `VITE_FACE_MAX_OFFSET_PCT` | `20`: extra insight, informational |

`VITE_*` values are baked into the bundle **at build time**. After changing one, redeploy.

## Steps

### 1. Database (Neon), done by the owner
Project on Postgres 16 in Frankfurt. Copy the **direct** connection string (host **without**
`-pooler`), not the pooled one: Alembic migrations and psycopg 3 use session-level features that a
transaction-mode pooler (PgBouncer) does not support. The app keeps its own small connection pool
(`pool_pre_ping`), so Neon's pooler is not needed. The string goes straight into Render (step 2)
and nowhere else.

### 2. Backend (Render)
1. Render dashboard → **New → Blueprint** → connect `eyalshub/live-video-quality-monitor`.
   Render reads `render.yaml` (free plan, Frankfurt, root `backend`).
2. When asked, fill `DATABASE_URL` (from Neon) and `CORS_ORIGINS` (use a placeholder such as
   `https://example.invalid` until step 3 gives the real URL).
3. Deploy. The start command runs `alembic upgrade head`, then uvicorn on `$PORT`.
   Render's health check calls `/health` (200 = up, 503 = database unreachable).
4. Check: `https://<backend>.onrender.com/health` → `{"status":"ok","db":"ok"}`.

### 3. Frontend (Vercel)
1. Vercel → **Add New → Project** → import the same repository.
2. **Root Directory: `frontend`**. `frontend/vercel.json` sets: framework Vite, install `npm ci`,
   build `npm run build`, output `dist`, and an SPA rewrite (`/(.*)` → `/index.html`) so deep
   links (e.g. a History page) load the app. Real files in `dist` are served before the rewrite.
3. Add the `VITE_*` variables above (Production), then deploy.

### 4. Connect them
1. Put the Vercel production URL into Render's `CORS_ORIGINS` → Render redeploys.
2. Open the Vercel URL in Chrome → the page shows `backend: ok, db: ok`.

Vercel **preview** deployments have different URLs and are not in `CORS_ORIGINS`, so they
cannot call the API. That is intentional: only the production frontend is allowed.

## Cold start
Render's free web service sleeps after ~15 minutes without traffic. The first request then takes up
to about a minute. The frontend waits up to `VITE_API_TIMEOUT_MS` (70 s) and says that the backend
may be waking up. Before a demo, open `/health` once to wake it.

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| Browser console: CORS error | `CORS_ORIGINS` does not exactly match the Vercel origin (scheme, no trailing slash) |
| `/health` → 503 `db: error` | Wrong `DATABASE_URL`, or the Neon compute is suspended (it wakes on connect) |
| Render deploy fails at start with "Invalid or missing configuration" | A required env var is missing; the log names it |
| Page shows "The app is not configured correctly" | A `VITE_*` variable was missing at build time; set it and redeploy |
| Camera never asks for permission | Page not on HTTPS (Vercel URLs are HTTPS) |
