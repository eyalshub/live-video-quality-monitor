"""Test data builders. Samples are consistent with the default test thresholds unless overridden."""

from typing import Any

from app.services.verdict import Thresholds, evaluate

DEFAULT_THRESHOLDS = Thresholds(fps_min=15, brightness_min=60, brightness_max=200, motion_max=20)


def sample(
    t: int,
    *,
    fps: float = 29.6,
    brightness: float = 132.4,
    motion: float | None = 3.1,
    face: bool = True,
    thresholds: Thresholds = DEFAULT_THRESHOLDS,
    **overrides: Any,
) -> dict[str, Any]:
    """A JSON sample whose verdict/reason follow the rule for the given values."""
    verdict, reason = evaluate(
        fps=fps, brightness=brightness, motion=motion, face=face, thresholds=thresholds
    )
    payload: dict[str, Any] = {
        "t": t,
        "fps": fps,
        "brightness": brightness,
        "motion": motion,
        "face": face,
        "verdict": verdict,
        "reason": reason,
    }
    payload.update(overrides)
    return payload
