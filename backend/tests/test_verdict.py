"""The verdict rule against the shared case table (also read by the frontend's Vitest suite)."""

import json
from typing import Any

import pytest

from app.services.verdict import Thresholds, evaluate
from tests.conftest import BACKEND_DIR

CASES_FILE = BACKEND_DIR.parent / "shared" / "verdict-cases.json"
CASES: list[dict[str, Any]] = json.loads(CASES_FILE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_shared_verdict_case(case: dict[str, Any]) -> None:
    verdict, reason = evaluate(**case["input"], thresholds=Thresholds(**case["thresholds"]))
    assert {"verdict": verdict, "reason": reason} == case["expected"]


def test_case_table_covers_every_reason_and_null_motion() -> None:
    reasons = {case["expected"]["reason"] for case in CASES}
    assert reasons == {None, "no_face", "too_dark", "too_bright", "hold_still", "low_fps"}
    assert any(case["input"]["motion"] is None for case in CASES)
