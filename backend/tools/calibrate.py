"""Threshold calibration from recorded sessions (ADR-014). Read-only: only GET /sessions/{id}.

Record one session per scenario (about a minute each), then label them on the command line:

    uv run python -m tools.calibrate --api-url http://localhost:8000 \
        --label <session-id>=normal --label <session-id>=moving \
        --label <session-id>=dark --label <session-id>=no_face

Prints Markdown tables: the per-second distribution of each metric per scenario, the error rates of
the thresholds the sessions were recorded with, and the threshold with the lowest balanced error.
"""

from __future__ import annotations

import argparse
import itertools
import json
import statistics
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

SCENARIOS = ("normal", "moving", "dark", "bright", "no_face")
MIN_SECONDS = 30  # fewer seconds per scenario than this → the result is flagged as thin
# Balanced error at or above this → the scenarios barely separate; the "best" value is not usable.
WEAK_SEPARATION = 0.25

Direction = Literal["below", "above"]


@dataclass(frozen=True)
class Check:
    """One threshold. `positive` scenarios should be flagged by it, `negative` ones should pass."""

    threshold: str
    metric: str
    direction: Direction
    positive: frozenset[str]
    negative: frozenset[str]


CHECKS = (
    Check(
        "brightness_min",
        "brightness",
        "below",
        frozenset({"dark"}),
        frozenset({"normal", "moving"}),
    ),
    Check(
        "brightness_max",
        "brightness",
        "above",
        frozenset({"bright"}),
        frozenset({"normal", "moving"}),
    ),
    Check("motion_max", "motion", "above", frozenset({"moving"}), frozenset({"normal"})),
    # Low FPS cannot be staged on purpose; only its false alarms in good conditions are measured.
    Check("fps_min", "fps", "below", frozenset(), frozenset({"normal", "moving"})),
)


def flags(value: float, threshold: float, direction: Direction) -> bool:
    """Same strict comparisons as the verdict rule: a value on the boundary passes."""
    return value < threshold if direction == "below" else value > threshold


def error_rates(
    positive: list[float], negative: list[float], threshold: float, direction: Direction
) -> tuple[float | None, float | None]:
    """(miss rate on positives, false-alarm rate on negatives); None when that side has no data."""
    miss = (
        sum(not flags(v, threshold, direction) for v in positive) / len(positive)
        if positive
        else None
    )
    false_alarm = (
        sum(flags(v, threshold, direction) for v in negative) / len(negative) if negative else None
    )
    return miss, false_alarm


def best_threshold(positive: list[float], negative: list[float], direction: Direction) -> float:
    """Threshold with the lowest balanced error ((miss + false alarm) / 2).

    Candidates are midpoints between neighbouring observed values. When several are equally good,
    the middle one is taken, so the threshold sits in the centre of the gap between the classes.
    """
    values = sorted(set(positive) | set(negative))
    candidates = [(a + b) / 2 for a, b in itertools.pairwise(values)] or values

    def balanced(t: float) -> float:
        miss, false_alarm = error_rates(positive, negative, t, direction)
        return ((miss or 0.0) + (false_alarm or 0.0)) / 2

    lowest = min(balanced(t) for t in candidates)
    best = [t for t in candidates if balanced(t) == lowest]
    return round(best[len(best) // 2], 1)


def percentile(values: list[float], q: int) -> float:
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[q - 1]


def fetch_session(api_url: str, session_id: str) -> dict[str, Any]:
    url = f"{api_url.rstrip('/')}/sessions/{urllib.parse.quote(session_id)}"
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise SystemExit(f"--api-url must be http(s): {api_url}")
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 (scheme checked above)
        data: dict[str, Any] = json.load(response)
    return data


def metric_values(samples: list[dict[str, Any]], metric: str) -> list[float]:
    """Values of one metric; null motion (ADR-009) is not measurable and is left out, never 0."""
    return [float(s[metric]) for s in samples if s[metric] is not None]


def rate(hits: list[bool]) -> float | None:
    """Share of True values; None (shown as "-") for an empty list, never a fake 0."""
    return sum(hits) / len(hits) if hits else None


def fmt(value: float | None) -> str:
    return "-" if value is None else f"{value * 100:.1f} %"


def report(sessions: dict[str, list[dict[str, Any]]], thresholds: dict[str, float]) -> str:
    """`sessions` maps a scenario to the samples of every session labelled with it."""
    lines = ["## Seconds per scenario", "", "| Scenario | Seconds | Note |", "|---|---|---|"]
    for scenario, samples in sessions.items():
        note = f"thin: fewer than {MIN_SECONDS} s" if len(samples) < MIN_SECONDS else ""
        lines.append(f"| {scenario} | {len(samples)} | {note} |")

    lines += ["", "## Distribution per second (p5 / p50 / p95)", ""]
    lines += [
        "| Scenario | FPS | Brightness | Motion | Face (% of seconds) |",
        "|---|---|---|---|---|",
    ]
    for scenario, samples in sessions.items():
        cells = []
        for metric in ("fps", "brightness", "motion"):
            v = metric_values(samples, metric)
            cells.append(
                " / ".join(f"{percentile(v, q):.1f}" for q in (5, 50, 95)) if v else "no data"
            )
        face = rate([bool(s["face"]) for s in samples])
        lines.append(f"| {scenario} | {' | '.join(cells)} | {fmt(face)} |")

    lines += ["", "## Thresholds", ""]
    lines += [
        "| Threshold | Current | Miss | False alarm | Best | Miss | False alarm |",
        "|---|---|---|---|---|---|---|",
    ]
    for check in CHECKS:
        pos = [
            v
            for s in check.positive & sessions.keys()
            for v in metric_values(sessions[s], check.metric)
        ]
        neg = [
            v
            for s in check.negative & sessions.keys()
            for v in metric_values(sessions[s], check.metric)
        ]
        if not pos and not neg:
            continue
        current = thresholds[check.threshold]
        miss, fa = error_rates(pos, neg, current, check.direction)
        if pos and neg:
            best = best_threshold(pos, neg, check.direction)
            b_miss, b_fa = error_rates(pos, neg, best, check.direction)
            weak = ((b_miss or 0.0) + (b_fa or 0.0)) / 2 >= WEAK_SEPARATION
            best_cells = (
                f"{best}{' (weak separation)' if weak else ''} | {fmt(b_miss)} | {fmt(b_fa)}"
            )
        else:
            best_cells = "needs both sides | - | -"
        lines.append(f"| {check.threshold} | {current} | {fmt(miss)} | {fmt(fa)} | {best_cells} |")

    # The face detector itself: it should see a face when one is there, and none when it is not.
    if "normal" in sessions or "no_face" in sessions:
        lines += ["", "## Face detector", "", "| Error | Rate |", "|---|---|"]
        if "normal" in sessions:
            missed = [not s["face"] for s in sessions["normal"]]
            lines.append(f"| Missed face (normal) | {fmt(rate(missed))} |")
        if "no_face" in sessions:
            phantom = [bool(s["face"]) for s in sessions["no_face"]]
            lines.append(f"| Face where none (no_face) | {fmt(rate(phantom))} |")
    return "\n".join(lines)


def parse_label(raw: str) -> tuple[str, str]:
    session_id, sep, scenario = raw.partition("=")
    if not sep or scenario not in SCENARIOS:
        raise argparse.ArgumentTypeError(
            f"expected <session-id>=<{'|'.join(SCENARIOS)}>, got {raw!r}"
        )
    return session_id, scenario


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument(
        "--api-url", required=True, help="Backend base URL, e.g. http://localhost:8000"
    )
    parser.add_argument("--label", type=parse_label, action="append", required=True)
    args = parser.parse_args(argv)

    sessions: dict[str, list[dict[str, Any]]] = {}
    snapshots: set[tuple[tuple[str, float], ...]] = set()
    thresholds: dict[str, float] = {}
    for session_id, scenario in args.label:
        data = fetch_session(args.api_url, session_id)
        sessions.setdefault(scenario, []).extend(data["samples"])
        thresholds = data["thresholds"]
        snapshots.add(tuple(sorted(thresholds.items())))
    if len(snapshots) > 1:
        print(
            "warning: sessions were recorded with different thresholds; using the last one",
            file=sys.stderr,
        )

    print(report(sessions, thresholds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
