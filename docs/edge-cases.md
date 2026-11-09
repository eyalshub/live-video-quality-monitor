# Edge cases and chosen behavior

Phase = where the behavior is implemented. Every case has (or will have) a test or a manual check.

## Camera
| Case | Behavior | Phase |
|---|---|---|
| Permission denied (`NotAllowedError`) | Clear message ("Camera access was denied — allow it in the address bar and press Start again"). No session is created (ADR-006). | P2/P3 |
| No camera (`NotFoundError`, `OverconstrainedError`) | "No camera found". No session. | P2/P3 |
| Camera busy (`NotReadableError`) | "Camera is in use by another app". No session. | P2/P3 |
| Face model fails to load | Start is blocked with a clear message; we never report `face=false` from a missing model. | P2/P3 |

## Backend availability
| Case | Behavior | Phase |
|---|---|---|
| Cold start (free backend asleep) | Health check shows "waking up the backend…"; request timeout is `VITE_API_TIMEOUT_MS` (long enough for ~1 min). Mentioned in README. | P0/P3 |
| Backend unreachable | Clear message with the configured URL and a Retry button. | P0 |
| Network drop mid-session | Samples stay in the outbox; UI shows "N samples pending"; resent with the next batch. | P3 |

## Measurement honesty
| Case | Behavior | Phase |
|---|---|---|
| First frame has no previous frame | Its motion is excluded from that second's average; if no frame has motion → `motion = null` (ADR-009). | P2 |
| Partial last second at Stop | Not sent (it would under-report FPS). | P3 |
| Hidden tab (frames stop) | Gap in the timeline; no invented samples. Motion reference is reset after the gap. | P2/P3 |
| A second with zero frames | No sample; UI says "no frames received". | P2/P3 |
| No face | Shown as "No face", verdict Poor `no_face`. Never a fake value. | P3 |
| Partly covered face (hand, edge of frame) | May still count as a face: the check is detection only, by design (iron rule 5). | P2 |
| Low light | The camera lengthens its exposure and lowers its own frame rate (e.g. ~9 FPS in a dark room), so `low_fps` shows up together with dark images. It is real and reported honestly, not a bug in our FPS counter. Camera auto-gain also keeps a dark room around 79 brightness, which is why the minimum is 80 (ADR-012). | P2 |

## Session lifecycle & idempotency
| Case | Behavior | Phase |
|---|---|---|
| Stop called twice | 200 with the same `ended_at` (ADR-004). | P1 |
| Samples arriving after Stop | Always 200, nothing written. Already stored `(session_id, t)` → counted as `duplicates`; new `t` → counted as `ignored_after_stop` (ADR-010). The client puts its whole outbox into the Stop request, so no real sample is lost. | P1/P3 |
| Tab closed without Stop | `pagehide` → `fetch` with `keepalive` flushes the outbox. Session stays open (`ended_at = null`); duration runs to the last stored `t` (`max(t) + 1`). | P3 |
| Resent sample (retry) | `ON CONFLICT DO NOTHING`, first write wins, reported as duplicate. | P0 schema / P1 API |
| Same `t` twice in one batch | First one wins. | P1 |
| Batch larger than `MAX_SAMPLES_PER_BATCH` | Server: 422 `batch_too_large`. Client splits the outbox into chunks so it never hits this. | P1/P3 |
| verdict/reason inconsistent with values | 422 `inconsistent_verdict` (ADR-002). | P1 |
| Unknown session id | 404 `not_found`. | P1 |

## History
| Case | Behavior | Phase |
|---|---|---|
| No sessions | "No sessions yet". | P5 |
| Session with no samples | Row shows "—"; details page says "No data recorded for this session". | P5 |
| Thresholds changed after a session | History uses the session's snapshot thresholds (ADR-002). | P1/P5 |
| Leaving the live screen while `POST /sessions` is in flight | The new session is ended at once with no samples, so none is left open. | P3 |
