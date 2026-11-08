"""CORS restricted to CORS_ORIGINS; X-Request-ID on every response; JSON log lines."""

import json
import logging

from fastapi.testclient import TestClient

from app.core.logging import JsonFormatter
from app.core.request_context import reset_request_id, set_request_id
from app.core.request_id import REQUEST_ID_HEADER
from tests.conftest import FRONTEND_ORIGIN

OTHER_ORIGIN = "https://evil.example.com"


# --- CORS ---------------------------------------------------------------------------------


def test_allowed_origin_gets_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": FRONTEND_ORIGIN})
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert REQUEST_ID_HEADER.lower() in response.headers["access-control-expose-headers"].lower()


def test_other_origin_gets_no_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": OTHER_ORIGIN})
    assert "access-control-allow-origin" not in response.headers


def test_preflight_from_allowed_origin_succeeds(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN


def test_preflight_from_other_origin_is_refused(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={"Origin": OTHER_ORIGIN, "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


# --- request id ---------------------------------------------------------------------------


def test_request_id_is_generated_when_missing(client: TestClient) -> None:
    first = client.get("/health").headers[REQUEST_ID_HEADER]
    second = client.get("/health").headers[REQUEST_ID_HEADER]
    assert first
    assert first != second


def test_valid_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/health", headers={REQUEST_ID_HEADER: "abc-123.X_y"})
    assert response.headers[REQUEST_ID_HEADER] == "abc-123.X_y"


def test_unsafe_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/health", headers={REQUEST_ID_HEADER: "bad id\twith spaces"})
    assert response.headers[REQUEST_ID_HEADER] != "bad id\twith spaces"


def test_error_responses_carry_request_id(client: TestClient) -> None:
    response = client.get("/nope", headers={REQUEST_ID_HEADER: "trace-404"})
    assert response.status_code == 404
    assert response.headers[REQUEST_ID_HEADER] == "trace-404"


# --- JSON logs ----------------------------------------------------------------------------


def test_log_line_is_json_with_request_id_and_extra_fields() -> None:
    record = logging.makeLogRecord(
        {"name": "app.request", "levelname": "INFO", "msg": "request", "status": 200}
    )
    token = set_request_id("rid-1")
    try:
        line = JsonFormatter().format(record)
    finally:
        reset_request_id(token)
    payload = json.loads(line)
    assert payload["msg"] == "request"
    assert payload["level"] == "INFO"
    assert payload["request_id"] == "rid-1"
    assert payload["status"] == 200
    assert "ts" in payload
