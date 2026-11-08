# ADR-010 — Samples after Stop return 200, never 409

- **Status:** Accepted (2026-11-08). Supersedes [ADR-005](ADR-005-samples-after-stop.md).

## Context
ADR-005 answered new samples for an ended session with 409 `session_ended`. The task asks for
"samples that arrive after Stop" to be handled **without errors**, and a reviewer reads a 409 as an
error. The real goal of ADR-005 was that an ended session stays **immutable**, and that does not
need an error status.

## Decision
For a session that has ended (`ended_at` is set), `POST /sessions/{id}/samples` and a repeated
`POST /sessions/{id}/stop` with samples always return **200**:
- a sample whose `(session_id, t)` already exists → counted as `duplicates`;
- a sample with a new `t` → **not written**, counted as `ignored_after_stop`.

Response: `{ "inserted": n, "duplicates": m, "ignored_after_stop": k }` (for an ended session,
`inserted` is always 0).

Validation still applies first: a malformed or inconsistent sample is a 422 whether or not the
session has ended. "Without errors" covers the timing case, not bad data.

The client still puts its whole outbox, including in-flight samples, into the Stop request
(ADR-004), so `ignored_after_stop` should stay 0 in normal use. A non-zero value is visible in the
response and in the logs.

## Consequences
- An ended session never changes; its summary is final at Stop.
- Late or retried requests never produce an error the client has to handle.
- The session row is locked (`SELECT … FOR UPDATE`) while samples are ingested and while Stop runs,
  so a samples request cannot slip in after Stop has committed.
