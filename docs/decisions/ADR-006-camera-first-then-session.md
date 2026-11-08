# ADR-006 — Open the camera first, then create the session

- **Status:** Accepted (2026-11-08)

## Context
The task says Start creates a session and opens the camera. If the session were created first, a
denied permission or a missing camera would leave an empty session in history.

## Decision
On Start the browser calls `getUserMedia` first. Only when the stream is live does it call
`POST /sessions`. If the session call fails, the camera is released and an error is shown.

## Consequences
- History contains only sessions that actually had a camera.
- `t = 0` starts when the session is created, right after the camera is live.
