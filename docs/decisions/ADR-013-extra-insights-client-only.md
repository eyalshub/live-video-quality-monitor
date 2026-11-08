# ADR-013 — Extra insights are client-only and frontend-configured

- **Status:** Accepted (2026-11-08)

## Context
Beyond the four required metrics we show three image-quality insights that help a user fix their
picture:
- **Sharpness**: variance of the Laplacian on the downscaled luma frame. "Blurry" below a minimum.
- **Exposure clipping**: % of pixels with luma ≤ 5 (crushed shadows) and ≥ 250 (blown
  highlights). This catches what an average hides, e.g. a bright window behind a dark face.
- **Face framing**, from the detector's largest bounding box: "Move closer" (face too narrow),
  "Center your face" (center too far from the frame center), "Face cut off" (box touches an
  edge). With no face there is no framing value: "—", never a fake one.

The verdict thresholds are owned by the backend, snapshotted per session and re-checked by the
server (ADR-002). These insights must not blur that contract.

## Decision
- **Informational only.** They never affect the verdict, the reason, the sample, the API or the
  database. They are computed in the browser, aggregated per second by a separate
  `InsightAggregator` (not `SecondAggregator`), shown only in the "Extra insights" panel on the live
  screen, and never sent to the backend. They are not in History.
- **Configured in the frontend** (`VITE_SHARPNESS_MIN`, `VITE_CLIP_PCT_MAX`,
  `VITE_FACE_MIN_WIDTH_PCT`, `VITE_FACE_MAX_OFFSET_PCT`). Nothing on the server depends on them:
  no stored data and no validation. So there is no consistency to protect, and a backend
  round-trip or snapshot would add complexity for no benefit. They are still configuration, not
  literals (iron rule 3).
- **Optional as a group.** If none of the four variables is set, the panel is off and the app
  works as before. Setting only some of them, or an invalid value, is a loud configuration error.
  A deployment that has not added them yet must not break: this feature is informational.
- **Image quality only.** No emotion, age, gender, identity, gaze or attention.
- Pixel levels 5 / 250 and the 1 px edge tolerance are part of the definitions, not tunable
  limits.

Initial defaults, picked before real-camera calibration (raw values are shown in the panel):

| Variable | Default | Why |
|---|---|---|
| `VITE_SHARPNESS_MIN` | 50 | A focused webcam frame at 160×120 has strong edges; strong defocus or motion blur drops the variance by an order of magnitude |
| `VITE_CLIP_PCT_MAX` | 5 | A few specular highlights or a dark corner are normal; 5 % of the frame is a visible problem |
| `VITE_FACE_MIN_WIDTH_PCT` | 20 | At a normal laptop distance a face is about 25–35 % of the frame width |
| `VITE_FACE_MAX_OFFSET_PCT` | 20 | The face center may drift a fifth of the frame from the center before we nag |

## Consequences
- The verdict, the samples and History are exactly as before; the backend is untouched.
- Insight limits can be tuned per deployment by changing Vercel env and redeploying.
- The face detector now also returns the largest bounding box; face presence for the verdict is
  unchanged.
