# ADR-016 — Session duration is `max(t) + 1`

- **Status:** Accepted (2026-11-09). Deviates on purpose from the task's literal wording.

## Context
The task says "Duration (s) = `t` of the last sample". But `t` is a 0-based second index: the first
sample covers second 0, so a session with samples `t = 0 … 59` covers **60** seconds. Taken
literally, that rule reports 59, and a session with a single sample would last 0 s.

## Decision
`duration_s = max(t) + 1`, computed in SQL at read time (`services/sessions.py`). Everything else
the task asks for still holds: it works without Stop (it depends only on stored samples), and an
empty session has `duration_s = null`, never 0.

## Consequences
- Duration matches the seconds the user actually saw: a 60-sample session shows 60 s.
- Seconds without a sample (hidden tab, ADR-009 gaps) still count toward the duration, because they
  are part of the elapsed session. The averages and percentages count only stored samples, so
  `sample_count` can be lower than `duration_s`.
- Documented in the README (edge-case choices), `docs/data-model.md`, `docs/api-contract.md`, and
  the OpenAPI field description.
