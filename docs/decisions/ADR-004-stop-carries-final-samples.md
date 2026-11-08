# ADR-004 — Stop carries the final samples

- **Status:** Accepted (2026-11-08)

## Context
If Stop and the last batch of samples are separate requests, they can race: the session ends before
the last samples arrive, or the user closes the tab between the two.

## Decision
`POST /sessions/{id}/stop` accepts an optional `samples` list. It stores them (same rules as the
samples endpoint) and sets `ended_at` **in one transaction**. An empty body is valid. Calling Stop on
an already-ended session returns 200 with the original `ended_at`. Samples in that repeated call
follow ADR-005.

## Consequences
- One request ends a session cleanly; there is no window where data is half-saved.
- Stop is idempotent, so a retried Stop is harmless.
