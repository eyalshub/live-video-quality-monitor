"""Stop (ADR-004, ADR-010), list, detail and the server-side summary."""

import uuid
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.factories import sample


def _new_session(client: TestClient) -> str:
    session_id: str = client.post("/sessions").json()["id"]
    return session_id


def _post(client: TestClient, session_id: str, samples: list[dict[str, Any]]) -> Any:
    return client.post(f"/sessions/{session_id}/samples", json={"samples": samples})


def _detail(client: TestClient, session_id: str) -> Any:
    return client.get(f"/sessions/{session_id}").json()


# --- stop ---------------------------------------------------------------------------------


def test_stop_without_body_ends_the_session(client: TestClient) -> None:
    session_id = _new_session(client)
    response = client.post(f"/sessions/{session_id}/stop")
    assert response.status_code == 200
    body = response.json()
    ended_at = datetime.fromisoformat(body["session"]["ended_at"])
    assert ended_at >= datetime.fromisoformat(body["session"]["started_at"])
    assert body["ingest"] == {"inserted": 0, "duplicates": 0, "ignored_after_stop": 0}


def test_stop_with_empty_object_body(client: TestClient) -> None:
    session_id = _new_session(client)
    response = client.post(f"/sessions/{session_id}/stop", json={})
    assert response.status_code == 200
    assert response.json()["session"]["ended_at"] is not None


def test_stop_saves_final_samples_and_returns_summary(client: TestClient) -> None:
    session_id = _new_session(client)
    _post(client, session_id, [sample(0), sample(1)])
    response = client.post(f"/sessions/{session_id}/stop", json={"samples": [sample(1), sample(2)]})
    body = response.json()
    assert body["ingest"] == {"inserted": 1, "duplicates": 1, "ignored_after_stop": 0}
    assert body["session"]["summary"]["sample_count"] == 3
    assert body["session"]["summary"]["duration_s"] == 3


def test_stop_twice_keeps_the_first_ended_at(client: TestClient) -> None:
    session_id = _new_session(client)
    first = client.post(f"/sessions/{session_id}/stop").json()["session"]["ended_at"]
    second = client.post(f"/sessions/{session_id}/stop")
    assert second.status_code == 200
    assert second.json()["session"]["ended_at"] == first


def test_second_stop_with_samples_writes_nothing(client: TestClient) -> None:
    session_id = _new_session(client)
    client.post(f"/sessions/{session_id}/stop", json={"samples": [sample(0)]})
    response = client.post(f"/sessions/{session_id}/stop", json={"samples": [sample(0), sample(1)]})
    assert response.status_code == 200
    assert response.json()["ingest"] == {"inserted": 0, "duplicates": 1, "ignored_after_stop": 1}
    assert response.json()["session"]["summary"]["sample_count"] == 1


def test_samples_endpoint_after_stop_is_200_and_writes_nothing(client: TestClient) -> None:
    session_id = _new_session(client)
    client.post(f"/sessions/{session_id}/stop", json={"samples": [sample(0)]})
    response = _post(client, session_id, [sample(0), sample(1)])
    assert response.status_code == 200
    assert response.json() == {"inserted": 0, "duplicates": 1, "ignored_after_stop": 1}
    assert _detail(client, session_id)["summary"]["sample_count"] == 1


def test_invalid_final_sample_rejects_stop_and_keeps_session_open(client: TestClient) -> None:
    session_id = _new_session(client)
    bad = {**sample(0), "verdict": "poor", "reason": "low_fps"}  # fps 29.6 is not low
    response = client.post(f"/sessions/{session_id}/stop", json={"samples": [bad]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "inconsistent_verdict"
    detail = _detail(client, session_id)
    assert detail["ended_at"] is None
    assert detail["samples"] == []


def test_stop_rejects_unknown_keys(client: TestClient) -> None:
    session_id = _new_session(client)
    response = client.post(f"/sessions/{session_id}/stop", json={"ended_at": "2020-01-01"})
    assert response.status_code == 422


def test_stop_unknown_session_is_404(client: TestClient) -> None:
    response = client.post(f"/sessions/{uuid.uuid4()}/stop")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- summary ------------------------------------------------------------------------------


def test_summary_is_computed_from_samples(client: TestClient) -> None:
    session_id = _new_session(client)
    _post(
        client,
        session_id,
        [
            sample(0, fps=30.0),  # good
            sample(1, fps=30.0),  # good
            sample(2, fps=20.0, face=False),  # poor: no_face
            sample(3, fps=10.0),  # poor: low_fps
        ],
    )
    assert _detail(client, session_id)["summary"] == {
        "duration_s": 4,
        "avg_fps": 22.5,
        "face_pct": 75.0,
        "good_pct": 50.0,
        "sample_count": 4,
    }


def test_summary_rounds_to_one_decimal(client: TestClient) -> None:
    session_id = _new_session(client)
    _post(client, session_id, [sample(0), sample(1), sample(2, face=False)])
    summary = _detail(client, session_id)["summary"]
    assert summary["face_pct"] == 66.7
    assert summary["good_pct"] == 66.7


def test_duration_is_last_t_even_with_gaps_and_without_stop(client: TestClient) -> None:
    """Tab closed without Stop: the session simply ends at its last sample."""
    session_id = _new_session(client)
    _post(client, session_id, [sample(0), sample(7), sample(3)])
    detail = _detail(client, session_id)
    assert detail["ended_at"] is None
    assert detail["summary"]["duration_s"] == 8
    assert detail["summary"]["sample_count"] == 3


def test_session_without_samples_has_null_summary(client: TestClient) -> None:
    session_id = _new_session(client)
    assert _detail(client, session_id)["summary"] == {
        "duration_s": None,
        "avg_fps": None,
        "face_pct": None,
        "good_pct": None,
        "sample_count": 0,
    }


# --- detail -------------------------------------------------------------------------------


def test_detail_returns_samples_ordered_by_t(client: TestClient) -> None:
    session_id = _new_session(client)
    sent = [sample(2), sample(0, motion=None), sample(1, brightness=30.0)]
    _post(client, session_id, sent)
    detail = _detail(client, session_id)
    assert [s["t"] for s in detail["samples"]] == [0, 1, 2]
    assert detail["samples"][0] == sent[1]  # exact round-trip, motion null included
    assert detail["samples"][1]["reason"] == "too_dark"
    assert detail["thresholds"] == {
        "fps_min": 15,
        "brightness_min": 60,
        "brightness_max": 200,
        "motion_max": 20,
    }


def test_detail_unknown_session_is_404(client: TestClient) -> None:
    response = client.get(f"/sessions/{uuid.uuid4()}")
    assert response.status_code == 404
    assert set(response.json()["error"]) == {"code", "message", "details"}


def test_detail_malformed_id_is_422(client: TestClient) -> None:
    response = client.get("/sessions/123")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


# --- list ---------------------------------------------------------------------------------


def test_list_is_empty_without_sessions(client: TestClient) -> None:
    response = client.get("/sessions")
    assert response.status_code == 200
    assert response.json() == []


def test_list_is_newest_first_with_summaries(client: TestClient) -> None:
    older = _new_session(client)
    _post(client, older, [sample(0), sample(1, face=False)])
    client.post(f"/sessions/{older}/stop")
    newer = _new_session(client)

    sessions = client.get("/sessions").json()
    assert [s["id"] for s in sessions] == [newer, older]
    assert sessions[0]["summary"]["sample_count"] == 0
    assert sessions[0]["summary"]["avg_fps"] is None
    assert sessions[1]["summary"] == {
        "duration_s": 2,
        "avg_fps": 29.6,
        "face_pct": 50.0,
        "good_pct": 50.0,
        "sample_count": 2,
    }
    assert sessions[1]["ended_at"] is not None
    assert "samples" not in sessions[1]


# --- contract -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/sessions/{session_id}/stop", "post"),
        ("/sessions/{session_id}", "get"),
    ],
)
def test_openapi_declares_error_responses(client: TestClient, path: str, method: str) -> None:
    responses = client.get("/openapi.json").json()["paths"][path][method]["responses"]
    for status_code in ("404", "422"):
        ref = responses[status_code]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("/ErrorResponse")
