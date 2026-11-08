"""Application settings, read from environment variables (and `backend/.env` locally).

Every setting except LOG_LEVEL is required: there are no defaults in code (iron rule 3, ADR-002).
A missing or invalid value stops the app at startup with a message naming the variable.
"""

from functools import lru_cache
from typing import Annotated, Literal, Self

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class ConfigError(RuntimeError):
    """Raised when the environment does not describe a valid configuration."""


def normalize_database_url(url: str) -> str:
    """Make provider URLs (Neon/Render give `postgres://` or `postgresql://`) use psycopg 3."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    database_url: str = Field(min_length=1)
    cors_origins: Annotated[list[str], NoDecode]

    threshold_fps_min: float = Field(ge=0, le=120)
    threshold_brightness_min: float = Field(ge=0, le=255)
    threshold_brightness_max: float = Field(ge=0, le=255)
    threshold_motion_max: float = Field(ge=0, le=255)

    max_samples_per_batch: int = Field(gt=0)

    log_level: LogLevel = "INFO"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(value.strip())

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def _check_cors_origins(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("must list at least one origin")
        if "*" in value:
            raise ValueError("wildcard '*' is not allowed; list the frontend origin(s) explicitly")
        return value

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper_log_level(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _check_brightness_range(self) -> Self:
        if self.threshold_brightness_min >= self.threshold_brightness_max:
            raise ValueError("THRESHOLD_BRIGHTNESS_MIN must be lower than THRESHOLD_BRIGHTNESS_MAX")
        return self


def _format_validation_error(exc: ValidationError) -> str:
    lines = []
    for err in exc.errors():
        name = "_".join(str(part) for part in err["loc"]).upper() or "(settings)"
        lines.append(f"  - {name}: {err['msg']}")
    return "Invalid or missing configuration (see backend/.env.example):\n" + "\n".join(lines)


def load_settings() -> Settings:
    """Build settings from the environment, turning validation errors into a readable message."""
    try:
        return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
    except ValidationError as exc:
        raise ConfigError(_format_validation_error(exc)) from None


@lru_cache
def get_settings() -> Settings:
    return load_settings()
