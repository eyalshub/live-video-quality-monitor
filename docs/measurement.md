# Measurement and calibration

How the verdict thresholds and the face filter were chosen. Summary in the [README](../README.md#measurement).

The thresholds and the face filter were chosen from **measured, labelled recordings**, not by eye.
Two read-only tools do the analysis: `backend/tools/calibrate.py` (verdict thresholds,
[ADR-014](decisions/ADR-014-threshold-calibration-protocol.md)) and `npm run face:eval` (face
detector, [ADR-015](decisions/ADR-015-face-false-positives-measured.md)). Recordings are
numbers only: per-second samples in the database, and with `?debug` a per-frame log of face scores
and keypoints that the user downloads. Video never leaves the browser.

## The measures we used
- **Miss rate:** of the seconds that *should* be flagged (a real face, a dark room, a moving head),
  the share that was not. **False-alarm rate:** of the seconds that should *not* be flagged, the
  share that was. Every threshold trades one against the other, so both are always reported.
- **Seconds, not frames:** the user sees one verdict per second, so errors are counted per second.
  This matters: under the task's rule (a face in *any* frame of the second), a 2 % per-frame error
  becomes about 45 % wrong seconds (`1 − 0.98^30`).
- **ROC AUC** (face detector): the probability that a frame with a face scores higher than a frame
  without one. 1.0 = perfect separation, 0.5 = a coin flip.
- **Balanced error** `(miss + false alarm) / 2`: how the calibration tool proposes a threshold.
- **IoU** (intersection over union) of two boxes: how "the same place" is decided across frames.
- **Tuning vs. validation:** settings were chosen on one set of recordings and then checked on new
  ones, so the reported result is not just a fit to the data it was tuned on.

## Verdict thresholds (11 labelled sessions)
| Threshold | What the data showed | Decision |
|---|---|---|
| Brightness min **80** | Dark ≤ 56, normal ≥ 131: zero misses, zero false alarms | Kept, now backed by data |
| Brightness max **200** | A lamp aimed at the lens reached 176: the camera's auto-exposure compensates | Kept (task value); this webcam cannot reach it |
| Motion max **12** | A moving head peaked at 8.7, so 12 missed it; ~3 would catch 89 % with 2 % false alarms | Unchanged for now: one session is too little evidence (see below) |
| FPS min **15** | 3.8 % false alarms in normal light | Kept (task value) |

## Face detector: a waving hand counted as a face
**Round 1 (tuning, 12 logs).** The model separates faces from hands well per frame (ROC AUC
0.989), but the any-frame rule turned rare frame errors into a hand being a "face" in 33 % of its
seconds and an object in 28 %. Tested on the same frames: a keypoint-geometry check (29 %) and a
box-size check (33 %) did not help, because BlazeFace places face-like keypoints on a hand too.
Raising the score threshold to 0.65 helped but lost 46 % of far-face seconds. Requiring the face to
**hold still for 5 detector runs** gave 3 % / 10 % with 1.5 % missed faces.

**Round 2 (validation, 6 new logs, filter on).** The same new frames, replayed both ways:

| Scenario | Without the filter | With the filter |
|---|---|---|
| Hand (false faces) | 64.6 % | **16.9 %** |
| Object (false faces) | 55.9 % | **20.6 %** |
| Face, normal light (missed) | 0.0 % | 0.0 % |
| Face, dark (missed) | 3.1 % | 3.1 % |
| Face, 1.5–2 m away (missed) | 5.3 % | **28.9 %** |

The live app's own numbers matched the replay exactly. About **70 % fewer false faces**, and no
change for a face at laptop distance or in the dark. Validation was harder than tuning (the hand was
moved to fool the detector on purpose), which is why 18 % false faces remain, not the 4 % round 1
predicted. A hand or object held still looks like a face to the model; rejecting it would need a
second model.

**Distance.** The detector (BlazeFace short range) is built for a person sitting close to the
screen, within about 2 m. Its scores fall with distance, so the further away the face, the larger
the error: 29 % missed seconds at 1.5–2 m, more beyond. This app targets a person at a laptop.

**Limits.** One webcam, one person, one room, one day; seconds within a recording are correlated,
so the rates are descriptive, not statistical guarantees. A photo of a face *is* a face to a
detector (no liveness, by the task's rules).
