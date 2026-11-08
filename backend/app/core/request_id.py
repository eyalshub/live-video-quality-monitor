"""ASGI middleware: request id, one structured log line per request, and the 500 safety net."""

import logging
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response
from app.core.request_context import reset_request_id, set_request_id

REQUEST_ID_HEADER = "X-Request-ID"
_HEADER_KEY = REQUEST_ID_HEADER.lower().encode("latin-1")
# Accept a client-supplied id only if it is short and harmless to log/echo.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

logger = logging.getLogger("app.request")


def _incoming_request_id(scope: Scope) -> str | None:
    for key, value in scope.get("headers", []):
        if key == _HEADER_KEY:
            candidate = value.decode("latin-1")
            return candidate if _VALID_REQUEST_ID.match(candidate) else None
    return None


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _incoming_request_id(scope) or uuid.uuid4().hex
        token = set_request_id(request_id)
        started = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = list(message.get("headers", []))
                headers.append((_HEADER_KEY, request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            logger.exception("unhandled error")
            if response_started:
                raise
            status_code = 500
            response = error_response(
                500,
                "internal_error",
                "Internal server error",
                headers={REQUEST_ID_HEADER: request_id},
            )
            await response(scope, receive, send)
        finally:
            logger.info(
                "request",
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            reset_request_id(token)
