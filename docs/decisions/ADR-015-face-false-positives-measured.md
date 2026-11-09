# ADR-015 — Face false positives: measure per frame, filter only with evidence

- **Status:** Accepted (2026-11-09). Measurement and candidate filters are built; the live decision
  is unchanged (score ≥ `VITE_FACE_MIN_CONFIDENCE`) until the report supports a change.

## Context
A waving hand is sometimes reported as a face. The task's rule makes this worse by design: a second
has a face if **any** of its ~30 frames has one. With a per-frame false-positive rate *p*, a second
is wrong with probability `1 − (1 − p)^30`. For *p* = 2 % that is about 45 %. The per-second rule is
fixed by the task, so precision has to improve **per frame**. The threshold (0.5) was MediaPipe's
default and had never been measured.

Out of scope (iron rule 5): a photo or drawing of a face *is* a face for a detector. That is a
stated limitation, not a bug; there is no liveness or anti-spoofing.

## Decision
1. **Candidates with scores.** The detector reports candidates down to a fixed floor of 0.1
   (`CANDIDATE_FLOOR` in `capture/faceDetector.ts`, an algorithm constant, not a setting). Our code
   applies `VITE_FACE_MIN_CONFIDENCE` (`metrics/faceFilter.ts`), so live behavior is the same as
   before, and the scores below the threshold become measurable.
2. **Labelled face logs, client-only.** With `?debug` in the URL, a panel labels the next session
   (`face_frontal`, `face_turned`, `face_dark`, `face_far`, `hand`, `object`, `empty`). After Stop it
   downloads a JSON file of per-frame candidates (score, box, 6 keypoints). Only numbers, saved by
   the user; nothing is sent (iron rule 1).
3. **Candidate filters**, pure functions in `metrics/faceFilter.ts`, each optional:

   | Filter | Rule | Why it rejects a hand |
   |---|---|---|
   | Score | `score ≥ minScore` | The baseline |
   | Geometry | Nose and mouth on the same side of the eye line, mouth further than nose; eye spacing a plausible fraction of the box width. Tolerant to head roll and to left/right labels | A hand rarely puts four points in a face's order |
   | Size | Box width within a % range of the frame | Many false boxes are tiny |
   | Temporal | A box counts only if it overlaps (IoU) a box in each of the previous *k − 1* detector runs | A waving hand jumps; a face stays put |

   The temporal filter changes what counts as "a frame with a face". It does not change the
   per-second rule.
4. **Offline evaluation.** `npm run face:eval -- <logs>` replays the logs through **the same
   filter code** (`metrics/faceEval.ts`), so every variant sees identical frames. It reports:
   frame-level ROC AUC; a threshold sweep with missed and false-alarm **seconds** (the unit the user
   sees); the lowest threshold meeting the targets (false alarms ≤ 5 %, misses ≤ 2 % by default);
   and every filter, alone and combined, at the current and the chosen threshold, per scenario.
5. **Decision rule.** A filter or threshold goes live only if the report shows it lowers false
   alarms without breaking the miss target in **any** face scenario. It then gets `VITE_*` config,
   a new ADR with the report pasted in, and the Vercel variables before the redeploy.

## Consequences
- The trade-off is explicit and measured. A synthetic check of the script showed why that matters:
  the temporal filter removed the hand, but it also missed most dark-face seconds, because a
  flickering score breaks the run of frames.
- Limits: one camera, one person; seconds within a log are correlated, so the rates are
  descriptive. More short logs per scenario beat one long one.
- The filters cost microseconds per frame (a few arithmetic checks on at most a few boxes); FPS is
  not affected.
