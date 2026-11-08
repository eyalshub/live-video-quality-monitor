"""POST /sessions/{id}/samples: idempotency, validation, verdict check, ended sessions."""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, select, update

from app.db.models import MonitoringSession, Sample
from app.main import create_app
from app.services.verdict import Thresholds
from tests.conftest import make_settings
from tests.factories import sample


def _new_session(client: TestClient) -> str:
    session_id: str = client.post("/sessions").json()["id"]
    return session_id


def _post(client: TestClient, session_id: str, samples: list[dict[str, Any]]) -> Any:
    return client.post(f"/sessions/{session_id}/samples", json={"samples": samples})


def _stored(engine: Engine, session_id: str) -> dict[int, float]:
    with engine.connect() as connection:
        rows = connection.execute(
            select(Sample.t, Sample.fps).where(Sample.session_id == uuid.UUID(session_id))
        ).all()
    return {t: fps for t, fps in rows}


def _end(engine: Engine, session_id: str) -> None:
    with engine.begin() as connection:
        connection.execute(
            update(MonitoringSession)
            .where(MonitoringSession.id == uuid.UUID(session_id))
            .values(ended_at=datetime.now(UTC))
        )


# --- storing ------------------------------------------------------------------------------


def test_new_samples_are_inserted(client: TestClient, clean_db: Engine) -> None:
    session_id = _new_session(client)
    response = _post(client, session_id, [sample(0), sample(1), sample(2, motion=None)])
    assert response.status_code == 200
    assert response.json() == {"inserted": 3, "duplicates": 0, "ignored_after_stop": 0}
    assert set(_stored(clean_db, session_id)) == {0, 1, 2}


def test_resent_samples_are_duplicates_and_first_write_wins(
    client: TestClient, clean_db: Engine
) -> None:
    session_id = _new_session(client)
    _post(client, session_id, [sample(0, fps=30.0), sample(1)])
    response = _post(client, session_id, [sample(0, fps=20.0), sample(1)])
    assert response.json() == {"inserted": 0, "duplicates": 2, "ignored_after_stop": 0}
    assert _stored(clean_db, session_id)[0] == 30.0


def test_partially_overlapping_retry(client: TestClient, clean_db: Engine) -> None:
    """A failed request is resent together with new samples (outbox)."""
    session_id = _new_session(client)
    _post(client, session_id, [sample(0), sample(1)])
    response = _post(client, session_id, [sample(1), sample(2), sample(3)])
    assert response.json() == {"inserted": 2, "duplicates": 1, "ignored_after_stop": 0}
    assert set(_stored(clean_db, session_id)) == {0, 1, 2, 3}


def test_same_t_twice_in_one_batch_first_wins(client: TestClient, clean_db: Engine) -> None:
    session_id = _new_session(client)
    response = _post(client, session_id, [sample(5, fps=30.0), sample(5, fps=10.0)])
    assert response.json() == {"inserted": 1, "duplicates": 1, "ignored_after_stop": 0}
    assert _stored(clean_db, session_id) == {5: 30.0}


def test_samples_of_different_sessions_are_independent(client: TestClient) -> None:
    first, second = _new_session(client), _new_session(client)
    _post(client, first, [sample(0)])
    response = _post(client, second, [sample(0)])
    assert response.json()["inserted"] == 1


# --- validation ---------------------------------------------------------------------------


def test_invalid_sample_rejects_the_whole_batch(client: TestClient, clean_db: Engine) -> None:
    session_id = _new_session(client)
    response = _post(client, session_id, [sample(0), {**sample(1), "fps": 121}])
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"][0]["loc"] == ["body", "samples", 1, "fps"]
    assert _stored(clean_db, session_id) == {}


def test_missing_field_is_reported(client: TestClient) -> None:
    session_id = _new_session(client)
    payload = sample(0)
    del payload["face"]
    response = _post(client, session_id, [payload])
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["loc"] == ["body", "samples", 0, "face"]


def test_empty_or_missing_samples_list_is_rejected(client: TestClient) -> None:
    session_id = _new_session(client)
    assert _post(client, session_id, []).status_code == 422
    response = client.post(f"/sessions/{session_id}/samples", json={})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_inconsistent_verdict_is_rejected_and_nothing_written(
    client: TestClient, clean_db: Engine
) -> None:
    session_id = _new_session(client)
    lying = {**sample(1, brightness=30.0), "verdict": "good", "reason": None}
    response = _post(client, session_id, [sample(0), lying])
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "inconsistent_verdict"
    assert error["details"] == [
        {
            "t": 1,
            "expected": {"verdict": "poor", "reason": "too_dark"},
            "received": {"verdict": "good", "reason": None},
        }
    ]
    assert _stored(clean_db, session_id) == {}


def test_wrong_reason_priority_is_inconsistent(client: TestClient) -> None:
    session_id = _new_session(client)
    # no face AND too dark: the reason must be no_face
    wrong = {**sample(0, face=False, brightness=30.0), "reason": "too_dark"}
    response = _post(client, session_id, [wrong])
    assert response.json()["error"]["code"] == "inconsistent_verdict"


def test_verdict_is_checked_against_the_session_snapshot(
    clean_db: Engine, test_database_url: str
) -> None:
    strict = make_settings(test_database_url, threshold_fps_min=24)
    with TestClient(create_app(strict)) as client:
        session_id = _new_session(client)
    # Thresholds change afterwards; the old session keeps fps_min = 24.
    with TestClient(create_app(make_settings(test_database_url))) as client:
        default_verdict = _post(client, session_id, [sample(0, fps=20.0)])
        snapshot = Thresholds(fps_min=24, brightness_min=60, brightness_max=200, motion_max=20)
        snapshot_verdict = _post(client, session_id, [sample(0, fps=20.0, thresholds=snapshot)])
    assert default_verdict.status_code == 422
    assert snapshot_verdict.json()["inserted"] == 1


def test_batch_limit_comes_from_settings(clean_db: Engine, test_database_url: str) -> None:
    with TestClient(create_app(make_settings(test_database_url, max_samples_per_batch=3))) as c:
        session_id = _new_session(c)
        too_many = _post(c, session_id, [sample(t) for t in range(4)])
        exactly = _post(c, session_id, [sample(t) for t in range(3)])
    assert too_many.status_code == 422
    assert too_many.json()["error"]["code"] == "batch_too_large"
    assert too_many.json()["error"]["details"] == {"max": 3, "received": 4}
    assert exactly.json()["inserted"] == 3


def test_unknown_session_is_404(client: TestClient) -> None:
    response = _post(client, str(uuid.uuid4()), [sample(0)])
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_malformed_session_id_is_422(client: TestClient) -> None:
    response = _post(client, "not-a-uuid", [sample(0)])
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["loc"] == ["path", "session_id"]


# --- ended sessions (ADR-010) -------------------------------------------------------------


def test_after_stop_nothing_is_written_and_status_is_200(
    client: TestClient, clean_db: Engine
) -> None:
    session_id = _new_session(client)
    _post(client, session_id, [sample(0), sample(1)])
    _end(clean_db, session_id)

    response = _post(client, session_id, [sample(1), sample(2), sample(3)])
    assert response.status_code == 200
    assert response.json() == {"inserted": 0, "duplicates": 1, "ignored_after_stop": 2}
    assert set(_stored(clean_db, session_id)) == {0, 1}


def test_after_stop_invalid_data_is_still_422(client: TestClient, clean_db: Engine) -> None:
    session_id = _new_session(client)
    _end(clean_db, session_id)
    response = _post(client, session_id, [{**sample(0), "brightness": 300}])
    assert response.status_code == 422


# --- contract -----------------------------------------------------------------------------


def test_openapi_declares_error_responses(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    responses = schema["paths"]["/sessions/{session_id}/samples"]["post"]["responses"]
    for status_code in ("404", "422"):
        ref = responses[status_code]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("/ErrorResponse")
