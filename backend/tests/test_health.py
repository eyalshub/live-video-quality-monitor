from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import UNREACHABLE_DB_URL, make_settings


def test_health_ok_when_database_reachable(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_503_when_database_unreachable() -> None:
    app = create_app(make_settings(UNREACHABLE_DB_URL))
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "db": "error"}


def test_health_is_in_openapi_schema(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/health" in schema["paths"]
    assert "HealthResponse" in schema["components"]["schemas"]
