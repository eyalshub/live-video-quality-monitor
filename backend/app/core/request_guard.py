"""ASGI middleware: request body size limit and the 500 safety net.

Registered *inside* CORSMiddleware so its 413/411/500 responses still get CORS headers (a browser
cannot read a cross-origin error that lacks them), and inside RequestIdMiddleware so they carry
X-Request-ID.
"""

import logging

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response

logger = logging.getLogger("app.request")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return str(value.decode("latin-1"))
    return None


class RequestGuardMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Reject oversized bodies before anything parses them. Without Content-Length (chunked)
        # the size is unknown up front; browsers' fetch always sends it, so such bodies are refused.
        if _header(scope, b"transfer-encoding") is not None:
            response = error_response(411, "length_required", "Content-Length is required")
            await response(scope, receive, send)
            return
        length = _header(scope, b"content-length")
        if length is not None and (not length.isdigit() or int(length) > self.max_body_bytes):
            response = error_response(
                413,
                "payload_too_large",
                f"Request body larger than {self.max_body_bytes} bytes",
                {"max_bytes": self.max_body_bytes},
            )
            await response(scope, receive, send)
            return

        response_started = False

        async def send_tracking(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_tracking)
        except Exception:
            logger.exception("unhandled error")
            if response_started:
                raise
            response = error_response(500, "internal_error", "Internal server error")
            await response(scope, receive, send)
