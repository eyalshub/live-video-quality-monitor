# ADR-003 — Verdict is computed on rounded values

- **Status:** Accepted (2026-11-08)

## Context
If the browser judged `fps = 14.96` as `low_fps` but then sent `15.0`, the server (ADR-002) would
see a "good" value with a "poor" verdict and reject it. Floating-point boundaries must not cause
disagreement.

## Decision
The browser rounds `fps`, `brightness` and `motion` to **1 decimal** first, and computes the verdict
on the rounded values. Those exact rounded values are displayed, sent and stored.

## Consequences
- Browser and server always judge identical numbers.
- 0.1 precision is far finer than the thresholds' meaning; nothing is lost in practice.
