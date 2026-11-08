# ADR-011 — Face detection cadence (every Nth frame)

- **Status:** Accepted (2026-11-08). Default `N = 1`, to be confirmed on a real laptop.

## Context
Face presence comes from MediaPipe Tasks Vision Face Detector (BlazeFace short range), running in
the browser on the main thread. On a slow laptop, running it on every frame could cost enough time
per frame to lower the processed FPS, and FPS is one of the metrics we judge. The measurement must
not degrade the thing it measures.

## Decision
- `VITE_FACE_DETECT_EVERY_N_FRAMES` (1–30) sets the cadence: the detector runs on frame 0, N, 2N…
  **of each second**. It always runs on the first frame of a second, so every second has at least
  one real face result.
- Frames the detector skipped carry `face = null` ("not checked"), never `false`. A second's
  `face` is true if any checked frame had a face.
- If a second ends with no face result at all (e.g. every detector call failed), no sample is
  produced for it instead of guessing (iron rule 2).
- Default `N = 1` (every frame). If FPS on a typical laptop drops below ~20 with `N = 1`, set
  `N = 2` or `3`. At 30 FPS that is still 10–15 checks per second, far more than needed to answer
  "was there a face in this second?".
- Delegate: GPU, with automatic fallback to CPU if GPU creation fails.
- Minimum detection confidence is explicit configuration, `VITE_FACE_MIN_CONFIDENCE` (0 < x < 1,
  0.5 in `.env.example`), passed to `FaceDetector.createFromOptions` as `minDetectionConfidence`,
  instead of relying on MediaPipe's implicit default (iron rule 3).
- The wasm runtime and the model are served by the app itself (`public/mediapipe/wasm`, copied from
  `node_modules` before `dev`/`build`; `public/models/blaze_face_short_range.tflite`, committed),
  never from a third-party CDN.

## Alternatives considered
BlazeFace **full range** and MediaPipe **Face Landmarker** are heavier and add nothing at laptop
distance, where the short-range model is designed to work. **YuNet** (via OpenCV.js or ONNX
Runtime Web) is more accurate on small or occluded faces, but costs several MB and more
integration work. **face-api.js** is unmaintained. The browser **Shape Detection API**
(`FaceDetector`) is still experimental and not available everywhere. **Server-side detection** is
out of the question: it would send video to the backend and break iron rule 1.

## Consequences
- FPS honesty is protected by a config change, not a code change.
- With `N > 1`, a face that appears for less than N frames can be missed. That is acceptable for a
  per-second "face present" signal.
- Headless Chrome (software rendering) is not representative of a laptop, so the final `N` is
  decided by a real-camera check in Chrome.
