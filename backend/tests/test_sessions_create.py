import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import Engine, select

from app.db.models import MonitoringSession
from app.main import create_app
from tests.conftest import make_settings


def test_create_returns_id_start_and_thresholds(client: TestClient) -> None:
    before = datetime.now(UTC)
    response = client.post("/sessions")
    assert response.status_code == 201
    body = response.json()
    assert uuid.UUID(body["id"])
    started_at = datetime.fromisoformat(body["started_at"])
    assert before - timedelta(seconds=1) <= started_at <= datetime.now(UTC) + timedelta(seconds=1)
    assert body["thresholds"] == {
        "fps_min": 15,
        "brightness_min": 60,
        "brightness_max": 200,
        "motion_max": 20,
    }


def test_each_session_gets_a_new_id(client: TestClient) -> None:
    first = client.post("/sessions").json()["id"]
    second = client.post("/sessions").json()["id"]
    assert first != second


def test_thresholds_come_from_settings_and_are_snapshotted(
    clean_db: Engine, test_database_url: str
) -> None:
    custom = make_settings(
        test_database_url,
        threshold_fps_min=24,
        threshold_brightness_min=80,
        threshold_brightness_max=180,
        threshold_motion_max=10,
    )
    with TestClient(create_app(custom)) as client:
        body = client.post("/sessions").json()
    assert body["thresholds"] == {
        "fps_min": 24,
        "brightness_min": 80,
        "brightness_max": 180,
        "motion_max": 10,
    }
    with clean_db.connect() as connection:
        row = connection.execute(
            select(MonitoringSession).where(MonitoringSession.id == uuid.UUID(body["id"]))
        ).one()
    assert (row.fps_min, row.brightness_min, row.brightness_max, row.motion_max) == (
        24,
        80,
        180,
        10,
    )
    assert row.ended_at is None


def test_create_ignores_a_request_body(client: TestClient) -> None:
    """Clients cannot choose their own thresholds (ADR-002)."""
    response = client.post("/sessions", json={"thresholds": {"fps_min": 0}})
    assert response.status_code == 201
    assert response.json()["thresholds"]["fps_min"] == 15
