"""The verdict rule (docs/data-model.md). The frontend implements the same rule; both are tested
against shared/verdict-cases.json.
"""

from dataclasses import dataclass
from typing import Literal

Verdict = Literal["good", "poor"]
Reason = Literal["no_face", "too_dark", "too_bright", "hold_still", "low_fps"]


@dataclass(frozen=True, slots=True)
class Thresholds:
    fps_min: float
    brightness_min: float
    brightness_max: float
    motion_max: float


def evaluate(
    *,
    fps: float,
    brightness: float,
    motion: float | None,
    face: bool,
    thresholds: Thresholds,
) -> tuple[Verdict, Reason | None]:
    """Return (verdict, reason). The first failing rule, in priority order, is the reason.

    Boundaries are OK. `motion is None` means "not measurable" (ADR-009): hold_still is skipped.
    """
    if not face:
        return "poor", "no_face"
    if brightness < thresholds.brightness_min:
        return "poor", "too_dark"
    if brightness > thresholds.brightness_max:
        return "poor", "too_bright"
    if motion is not None and motion > thresholds.motion_max:
        return "poor", "hold_still"
    if fps < thresholds.fps_min:
        return "poor", "low_fps"
    return "good", None
