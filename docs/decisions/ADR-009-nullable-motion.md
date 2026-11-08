# ADR-009 — `motion` may be null

- **Status:** Accepted (2026-11-08)

## Context
Motion compares a frame to the previous one. The first frame of a session, and the first frame
after a gap (hidden tab), have no valid previous frame. If a second contains only such frames,
there is no real motion value. Writing `0` would be a fake value (iron rule 2).

## Decision
- `samples.motion` is nullable; `fps` and `brightness` are NOT NULL (a sample exists only if at
  least one frame was processed in that second).
- Frames without a previous frame are excluded from the motion average.
- When `motion` is null, the `hold_still` rule is skipped: no evidence of motion is not evidence
  of too much motion. The chart shows a gap.

## Consequences
- The verdict rule on both sides handles `motion = null`.
- The summary does not use motion, so it is unaffected.
