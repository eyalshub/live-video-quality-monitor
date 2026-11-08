"""Request/response models for sessions and samples. They define the OpenAPI schema that the
frontend types are generated from (ADR-008).
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

INT32_MAX = 2_147_483_647


def _rounded_to_one_decimal(value: float) -> float:
    if round(value, 1) != value:
        raise ValueError("must be rounded to 1 decimal before sending (ADR-003)")
    return value


Fps = Annotated[float, Field(ge=0, le=120), AfterValidator(_rounded_to_one_decimal)]
Luma = Annotated[float, Field(ge=0, le=255), AfterValidator(_rounded_to_one_decimal)]


class Thresholds(BaseModel):
    """Threshold snapshot of a session (ADR-002)."""

    fps_min: float
    brightness_min: float
    brightness_max: float
    motion_max: float


class SampleIn(BaseModel):
    """One per-second sample. Every key is required; `motion` and `reason` may be null."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    t: int = Field(ge=0, le=INT32_MAX, description="Whole seconds since the session started")
    fps: Fps = Field(description="Frames actually processed in that second")
    brightness: Luma = Field(description="Mean luma 0-255")
    motion: Luma | None = Field(
        description="Mean abs. luma difference vs. previous frame; null = not measurable (ADR-009)"
    )
    face: bool = Field(description="At least one frame in that second had a face")
    verdict: Literal["good", "poor"]
    reason: Literal["no_face", "too_dark", "too_bright", "hold_still", "low_fps"] | None


class SampleOut(BaseModel):
    t: int
    fps: float
    brightness: float
    motion: float | None
    face: bool
    verdict: Literal["good", "poor"]
    reason: Literal["no_face", "too_dark", "too_bright", "hold_still", "low_fps"] | None


class SessionCreated(BaseModel):
    id: uuid.UUID
    started_at: datetime
    thresholds: Thresholds
    max_samples_per_batch: int = Field(
        description="Largest samples list one request may carry; the client splits its outbox"
    )


class SamplesBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    samples: list[SampleIn] = Field(
        min_length=1,
        description="At most MAX_SAMPLES_PER_BATCH samples; same t twice -> first wins",
    )


class StopRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    samples: list[SampleIn] = Field(
        default_factory=list, description="Final samples, saved in the same transaction (ADR-004)"
    )


class Summary(BaseModel):
    """Computed by the backend at read time. All fields except sample_count are null when the
    session has no samples."""

    duration_s: int | None = Field(description="t of the last sample")
    avg_fps: float | None
    face_pct: float | None = Field(description="% of seconds with a face")
    good_pct: float | None = Field(description="% of seconds with verdict good")
    sample_count: int


class SessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None = Field(description="null while running or if the tab was closed")
    thresholds: Thresholds
    summary: Summary


class SessionDetail(SessionOut):
    samples: list[SampleOut] = Field(description="Ordered by t")


class IngestResult(BaseModel):
    """What happened to the samples of one request (ADR-010)."""

    inserted: int = Field(description="New samples stored")
    duplicates: int = Field(description="Already stored, or repeated in the request; unchanged")
    ignored_after_stop: int = Field(description="New samples for an ended session; not stored")


class StopResponse(BaseModel):
    session: SessionOut
    ingest: IngestResult
