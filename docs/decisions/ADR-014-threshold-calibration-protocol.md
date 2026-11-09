# ADR-014 — Thresholds are chosen by a measured calibration protocol

- **Status:** Accepted (2026-11-09). Refines ADR-012; does not change any threshold by itself.

## Context
ADR-012 set the thresholds from a few observed ranges on one laptop ("~16", "~79"). That is a
reasonable start, but it does not say how often each threshold is wrong. A threshold is a binary
classifier on a per-second metric. It should be chosen and reported like one: its **miss rate**
(bad seconds that pass) and its **false-alarm rate** (good seconds that are flagged).

## Decision
1. **Record labelled sessions** with the live app, about 60 s each, one scenario per session:

   | Scenario | How to record | Should trigger |
   |---|---|---|
   | `normal` | Sit still, normal room light, face centred | nothing |
   | `moving` | Turn and nod the head continuously | `hold_still` |
   | `dark` | Lights off / hand partly over the lens | `too_dark` |
   | `bright` | Lamp or window straight into the lens | `too_bright` |
   | `no_face` | Step out of the frame, camera still on | `no_face` |

2. **Run** `backend/tools/calibrate.py` with the session ids and their labels. It is read-only
   (`GET /sessions/{id}`), uses only the stored per-second samples, and prints Markdown tables:
   seconds per scenario, p5/p50/p95 of each metric per scenario, the current thresholds' miss and
   false-alarm rates, the threshold with the lowest **balanced error** (`(miss + false alarm) / 2`),
   and the face detector's missed-face and phantom-face rates.
3. **Rule for the "best" threshold:** candidates are midpoints between neighbouring observed values;
   among equally good ones the middle is taken, so the threshold sits in the centre of the gap
   between the classes rather than on its edge. Comparisons are strict, like the verdict rule
   (a value on the boundary passes). When even the best value has a balanced error of 25 % or more,
   it is marked **(weak separation)**: the scenarios overlap, so re-record them rather than use it.
4. **A threshold changes only through config** (`render.yaml`, `.env.example`, CI env, ADR-002) and a
   new ADR that pastes the tool's table as evidence.

## What it deliberately does not do
- It does not change how any metric is defined (task definition, `docs/requirements.md`).
- `fps_min` cannot be staged on purpose, so only its false alarms in good conditions are measured.
- `null` motion (ADR-009) is left out, never counted as 0 (iron rule 2).

## Consequences
- Every threshold in the README can be backed by a table with *n* and error rates.
- The face detector (BlazeFace short range) gets a measured error rate in this setup, which is the
  evidence needed before considering another model.
- Limits, stated honestly: one camera, one person, one room. Seconds within a session are
  correlated, so the rates are descriptive, not a statistical guarantee. A scenario with fewer than
  30 seconds is flagged as thin.
