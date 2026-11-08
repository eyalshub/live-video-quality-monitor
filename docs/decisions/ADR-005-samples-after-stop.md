# ADR-005 — Samples that arrive after Stop

- **Status:** Superseded by [ADR-010](ADR-010-samples-after-stop-200.md) (2026-11-08)

## Context
A samples request may be in flight (or retried) when Stop arrives. The task asks us to handle
"samples after Stop" without errors and without duplicate data.

## Decision
For an ended session:
- Samples whose `(session_id, t)` already exist → **200**, counted as duplicates. This covers
  retries of requests that were already saved, racing with Stop.
- Any **new** `t` → **409 `session_ended`**, and nothing from that request is written.

The client puts its entire outbox, including samples currently in flight, into the Stop request
(ADR-004), so a real sample is never left to arrive after Stop. The client treats 409 as final and
does not retry.

## Consequences
- An ended session is immutable; its summary never changes after Stop.
- "Without errors" is read as: no 5xx, no crash, no duplicates. 409 is a defined, documented
  answer. This reasoning goes into the README.
