"""Every error response uses {"error": {"code", "message", "details"}}."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.core.errors import AppError
from app.core.request_id import REQUEST_ID_HEADER


class _Payload(BaseModel):
    fps: float = Field(ge=0, le=120)
    face: bool


@pytest.fixture
def error_client(app: FastAPI) -> Iterator[TestClient]:
    """The real app plus throwaway routes that trigger each kind of error."""

    @app.post("/_test/validate")
    def validate(payload: _Payload) -> dict[str, float]:
        return {"fps": payload.fps}

    @app.get("/_test/app-error")
    def app_error() -> None:
        raise AppError(409, "session_ended", "Session has ended", {"session_id": "x"})

    @app.get("/_test/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def _assert_error_shape(body: Any, code: str) -> None:
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]


def test_unknown_route_is_404_not_found(error_client: TestClient) -> None:
    response = error_client.get("/does-not-exist")
    assert response.status_code == 404
    _assert_error_shape(response.json(), "not_found")


def test_wrong_method_is_405(error_client: TestClient) -> None:
    response = error_client.post("/health")
    assert response.status_code == 405
    _assert_error_shape(response.json(), "method_not_allowed")


def test_missing_field_is_422_with_location(error_client: TestClient) -> None:
    response = error_client.post("/_test/validate", json={"fps": 30})
    assert response.status_code == 422
    body = response.json()
    _assert_error_shape(body, "validation_error")
    assert {"loc": ["body", "face"], "msg": "Field required", "type": "missing"} in body["error"][
        "details"
    ]


def test_out_of_range_value_is_422(error_client: TestClient) -> None:
    response = error_client.post("/_test/validate", json={"fps": 121, "face": True})
    assert response.status_code == 422
    body = response.json()
    _assert_error_shape(body, "validation_error")
    assert body["error"]["details"][0]["loc"] == ["body", "fps"]


def test_malformed_json_is_422(error_client: TestClient) -> None:
    response = error_client.post(
        "/_test/validate", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    _assert_error_shape(response.json(), "validation_error")


def test_app_error_keeps_code_and_details(error_client: TestClient) -> None:
    response = error_client.get("/_test/app-error")
    assert response.status_code == 409
    body = response.json()
    _assert_error_shape(body, "session_ended")
    assert body["error"]["details"] == {"session_id": "x"}


def test_unexpected_exception_is_500_without_internals(error_client: TestClient) -> None:
    response = error_client.get("/_test/boom")
    assert response.status_code == 500
    _assert_error_shape(response.json(), "internal_error")
    assert "secret" not in response.text
    assert response.headers.get(REQUEST_ID_HEADER)
