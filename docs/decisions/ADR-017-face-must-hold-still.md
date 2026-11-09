# ADR-017 — A face counts only if it holds still for 5 detector runs

- **Status:** Accepted (2026-11-09). Implements the outcome of the ADR-015 measurement.

## Context
ADR-015 built the measurement: labelled face logs and an offline replay of the filters. Two rounds
were recorded on 2026-11-09 with one laptop webcam, one person, one room.

**Round 1 (tuning, 12 logs, 491 s).** The score separates faces from hands and objects well per
frame (ROC AUC 0.989). The errors come from the task's per-second rule: one wrong frame out of ~30
marks the whole second. At the threshold 0.5, a hand was a "face" in 33 % of its seconds, an
object in 28 %. Faces were never missed.

| Filter (threshold 0.5) | False faces (hand / object) | Missed faces | Outcome |
|---|---|---|---|
| None | 33 % / 28 % | 0 % | baseline |
| Geometry (eye line, nose, mouth) | 29 % / 28 % | 0 % | rejected: BlazeFace places face-like keypoints on a hand too |
| Box size | 33 % / 28 % | 0 % | rejected: no effect |
| Threshold 0.65 instead | 3 % / 13 % | 46 % of far-face seconds | rejected: loses far faces |
| **Stable for 5 runs** | **3 % / 10 %** | 1.5 % | chosen |

**Round 2 (validation, 6 new logs, 203 s)**, recorded with the filter on and replayed on the
**same frames** with and without it:

| Scenario | Without the filter | With the filter |
|---|---|---|
| Hand (false faces) | 64.6 % | **16.9 %** |
| Object (false faces) | 55.9 % | **20.6 %** |
| Face, normal light (missed) | 0.0 % | 0.0 % |
| Face, dark (missed) | 3.1 % | 3.1 % |
| Face, 1.5–2 m away (missed) | 5.3 % | **28.9 %** |

The live app's own results (from the database) matched the replay exactly, so the app runs the
filter that was measured.

## Decision
A face candidate counts only if its box overlaps (IoU ≥ 0.3) a box in each of the previous 4
detector runs (`VITE_FACE_STABLE_FRAMES=5`, `VITE_FACE_STABLE_IOU=0.3`; `1` turns it off). The
score threshold stays 0.5. The per-second rule is unchanged: a second has a face if any of its
frames has a confirmed one. Implemented with the same `filterFrame` / `TemporalFilter` code that
the replay used (`metrics/faceFilter.ts`, `session/monitor.ts`).

## Consequences
- About 70 % fewer false faces on the same frames; no change for a face at a normal laptop distance
  or in the dark. At 30 FPS the filter needs about 0.17 s, at 10 FPS (dark) about 0.5 s.
- **Distance.** BlazeFace short range is built for a face close to the camera (roughly within
  2 m). Its scores drop with distance, so the filter misses more far faces: 29 % of the seconds at
  1.5–2 m. The app targets a person at a laptop; beyond that the error grows.
- **Honest gap.** Round 1 predicted 4 % false faces; round 2, where the hand was moved to fool the
  detector on purpose, measured 18 %. A hand or object held still looks like a face to the model,
  and no stability filter can reject it. The next step would be a second model to confirm faces
  (out of scope; ADR-015).
- Two new required frontend variables: they must be set in Vercel before the deploy.
