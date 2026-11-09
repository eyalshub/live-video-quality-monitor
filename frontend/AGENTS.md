# frontend/AGENTS.md

## Responsibility

Everything the user sees, and **all video analysis**. The browser opens the camera, measures each
frame, builds one sample per second, judges it, charts it, and sends only the numbers to the
backend.

## Folder map

| Path                  | What                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`       | `parseConfig(env)` / `getConfig()`: validates every `VITE_*` variable; no defaults                                                                        |
| `src/api/client.ts`   | fetch wrapper (timeout from config, cancellable)                                                                                                          |
| `src/api/schema.d.ts` | **Generated** by `npm run gen:api` from the backend OpenAPI. Never edit by hand                                                                           |
| `src/metrics/`        | Pure functions: luma, motion, round1, verdict (tested on shared cases); face filters + eval (ADR-015)                                                     |
| `src/capture/`        | Camera, frame loop (rVFC / rAF), canvas analyzer, MediaPipe face detector                                                                                 |
| `src/session/`        | Per-second aggregator, outbox, `MonitorController` (Start/Stop/pagehide), face log (ADR-015)                                                              |
| `src/ui/`             | React UI: `LiveMonitor`, `LiveStatus` (verdict + metric cards), `QualityChart`, `History` (list + details), `router.ts` / `Link.tsx` (History API routes) |
| `scripts/`            | `gen-api.ts` (API types), `copy-mediapipe.ts` (wasm into public/, pre dev/build), `face-eval.ts` (ADR-015)                                                |
| `public/models/`      | BlazeFace short-range model, served by the app (ADR-011)                                                                                                  |

## Commands (run inside `frontend/`)

```bash
cp .env.example .env     # once
npm install
npm run dev              # http://localhost:5173 (must be listed in the backend's CORS_ORIGINS)
npm run lint             # ESLint, strict type-checked rules, zero warnings allowed
npm run format:check     # Prettier (npm run format to fix)
npm run typecheck        # tsc -b
npm test                 # Vitest
npm run build
npm run gen:api          # backend must be running at VITE_API_BASE_URL
```

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any`, no non-null `!` shortcuts.
- API types come only from `src/api/schema.d.ts` (ADR-008). After a backend API change: run
  `npm run gen:api` and commit the regenerated file.
- New setting → `config.ts` (validated, required) + `.env.example` + CI env. No literals in code.
- Metric code is split into pure functions (testable without a browser) and thin browser glue.
- TypeScript is pinned to 5.9: `typescript-eslint` supports < 6.1 and `openapi-typescript` needs 5.x.

## Invariants this part must protect

1. **No video leaves the browser.** Never upload frames, images, blobs or canvases. Only numbers.
2. **Real FPS:** the number of frames our code actually processed in that second. Never the camera's
   advertised frame rate.
3. **No fake values:** missing data is `null` / "no data" / a gap in the chart, never `0`.
   A second with no frames produces no sample.
4. **Pure, tested metric functions:** luma, motion, aggregation and verdict live in `src/metrics/`
   with unit tests, including boundary values and `motion = null` (ADR-009).
5. **Verdict on rounded values** with the thresholds the backend returned for this session
   (ADR-002, ADR-003). There are no threshold values in frontend config.
