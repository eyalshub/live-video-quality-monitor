from typing import Any

import pytest

from tools.calibrate import best_threshold, error_rates, flags, metric_values, parse_label, report


def test_boundary_passes_like_the_verdict_rule() -> None:
    assert not flags(80.0, 80.0, "below")
    assert flags(79.9, 80.0, "below")
    assert not flags(12.0, 12.0, "above")
    assert flags(12.1, 12.0, "above")


def test_error_rates() -> None:
    # motion_max = 10: one moving second is missed, one sitting second is a false alarm
    miss, false_alarm = error_rates([15.0, 18.0, 9.0], [3.0, 4.0, 11.0, 5.0], 10.0, "above")
    assert miss == pytest.approx(1 / 3)
    assert false_alarm == pytest.approx(1 / 4)
    assert error_rates([], [3.0], 10.0, "above") == (None, 0.0)


def test_best_threshold_sits_in_the_middle_of_the_gap() -> None:
    # Sitting 3-6, moving 14-16: every cut between 6 and 14 is perfect; the middle is 10.
    assert best_threshold([14.0, 15.0, 16.0], [3.0, 4.0, 6.0], "above") == 10.0
    # Dark 70-75, normal 120-130: the middle of the gap is 97.5.
    assert best_threshold([70.0, 75.0], [120.0, 130.0], "below") == 97.5


def test_best_threshold_with_overlap_minimises_balanced_error() -> None:
    pos, neg = [8.0, 14.0, 16.0], [3.0, 5.0, 9.0]
    best = best_threshold(pos, neg, "above")
    miss, false_alarm = error_rates(pos, neg, best, "above")
    assert ((miss or 0) + (false_alarm or 0)) / 2 == pytest.approx(1 / 6)


def test_null_motion_is_left_out_not_zero() -> None:
    assert metric_values([{"motion": None}, {"motion": 4.0}], "motion") == [4.0]


def test_parse_label() -> None:
    assert parse_label("abc=dark") == ("abc", "dark")
    with pytest.raises(Exception, match="expected"):
        parse_label("abc=sunny")


def _sample(**overrides: Any) -> dict[str, Any]:
    return {"fps": 30.0, "brightness": 125.0, "motion": 4.0, "face": True} | overrides


def test_report_tables() -> None:
    sessions = {
        "normal": [_sample(), _sample(face=False)],
        "dark": [_sample(brightness=70.0, fps=9.0)],
        "no_face": [_sample(face=False)],
    }
    thresholds = {
        "fps_min": 15.0,
        "brightness_min": 80.0,
        "brightness_max": 200.0,
        "motion_max": 12.0,
    }
    text = report(sessions, thresholds)
    assert "| brightness_min | 80.0 | 0.0 % | 0.0 % | 97.5 | 0.0 % | 0.0 % |" in text
    assert "| Missed face (normal) | 50.0 % |" in text
    assert "| Face where none (no_face) | 0.0 % |" in text
    assert "thin: fewer than 30 s" in text
    assert "weak separation" not in text


def test_report_flags_weak_separation() -> None:
    # "moving" looks exactly like "normal": no threshold separates them.
    sessions = {"normal": [_sample(motion=m) for m in (2.0, 3.0, 4.0)]}
    sessions["moving"] = [_sample(motion=m) for m in (2.5, 3.0, 3.5)]
    thresholds = {
        "fps_min": 15.0,
        "brightness_min": 80.0,
        "brightness_max": 200.0,
        "motion_max": 12.0,
    }
    assert "(weak separation)" in report(sessions, thresholds)


def test_report_with_an_empty_session_shows_no_data_instead_of_crashing() -> None:
    """A labelled session with no samples (stopped at once) is "-", never a crash or a fake 0."""
    thresholds = {
        "fps_min": 15.0,
        "brightness_min": 80.0,
        "brightness_max": 200.0,
        "motion_max": 12.0,
    }
    text = report({"normal": [], "no_face": []}, thresholds)
    assert "| Missed face (normal) | - |" in text
    assert "| Face where none (no_face) | - |" in text
