"""SampleIn validation: required keys, ranges, types, rounding (ADR-003), nullable motion."""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.sessions import SampleIn
from tests.factories import sample


def _validate(payload: dict[str, Any]) -> SampleIn:
    return SampleIn.model_validate_json(json.dumps(payload))


def test_valid_sample_is_accepted() -> None:
    parsed = _validate(sample(12))
    assert parsed.t == 12
    assert parsed.fps == 29.6


def test_null_motion_is_accepted() -> None:
    assert _validate(sample(0, motion=None)).motion is None


def test_integer_values_are_accepted_for_floats() -> None:
    assert _validate(sample(0, fps=30, brightness=130, motion=0)).fps == 30


@pytest.mark.parametrize("field", ["t", "fps", "brightness", "motion", "face", "verdict", "reason"])
def test_every_key_is_required(field: str) -> None:
    payload = sample(0)
    del payload[field]
    with pytest.raises(ValidationError, match=field):
        _validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("t", -1),
        ("t", 2_147_483_648),
        ("t", 1.5),
        ("t", "3"),
        ("fps", -0.1),
        ("fps", 120.1),
        ("fps", "30"),
        ("brightness", -1),
        ("brightness", 255.1),
        ("motion", 255.1),
        ("motion", -0.1),
        ("face", "yes"),
        ("face", 1),
        ("verdict", "ok"),
        ("reason", "blurry"),
        ("fps", 29.65),
        ("brightness", 132.45),
        ("motion", 3.14),
    ],
)
def test_invalid_value_is_rejected(field: str, value: Any) -> None:
    with pytest.raises(ValidationError, match=field):
        _validate({**sample(0), field: value})


def test_nan_is_rejected() -> None:
    raw = json.dumps(sample(0)).replace('"fps": 29.6', '"fps": NaN')
    with pytest.raises(ValidationError, match="fps"):
        SampleIn.model_validate_json(raw)


def test_unknown_key_is_rejected() -> None:
    with pytest.raises(ValidationError, match="video"):
        _validate({**sample(0), "video": "frame-bytes"})


def test_unrounded_value_message_points_to_adr() -> None:
    with pytest.raises(ValidationError, match="ADR-003"):
        _validate(sample(0, fps=29.65))
